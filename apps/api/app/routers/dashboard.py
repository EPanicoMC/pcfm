"""Endpoint dashboard: KPI globali + breakdown per cliente/FY/BU + previsione chiusura FY."""

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..models.dimensions import DimCostCenter, DimResource, DimWeek
from ..models.facts import FactProject, FactTimesheet
from domain.forecast import (
    calc_data_esaurimento,
    calc_mesi_residui,
    calc_run_rate,
    is_at_risk,
    MonthlyPoint,
)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _current_fy(today: date, fy_start_month: int = 7) -> int:
    return today.year + 1 if today.month >= fy_start_month else today.year


def _fy_end(fy: int) -> date:
    """Chiusura FY PwC: sempre 30 giugno dell'anno FY."""
    return date(fy, 6, 30)


# ── Pydantic Models ─────────────────────────────────────────────────────────

class DashboardCcBreakdown(BaseModel):
    cc_code: str
    cc_name: str
    ou: str | None
    ts_hours: float
    ts_net_revenue: float
    pct_of_total: float

class DashboardBuBreakdown(BaseModel):
    bu: str
    ts_hours: float
    ts_net_revenue: float
    pct_of_total: float
    cost_centers: list[DashboardCcBreakdown]

# ── Helper ──────────────────────────────────────────────────────────────────

def _make_bu_list(bu_dict: dict, total_nr: float) -> list[DashboardBuBreakdown]:
    """Trasforma il dizionario interno di accumulazione in una lista ordinata di DashboardBuBreakdown."""
    res = []
    # Ordina BU per NR decrescente
    for b in sorted(bu_dict.values(), key=lambda x: x["ts_net_revenue"], reverse=True):
        ccs = []
        # Ordina CC per NR decrescente
        for c in sorted(b.get("_ccs", {}).values(), key=lambda x: x["ts_net_revenue"], reverse=True):
            ccs.append(DashboardCcBreakdown(
                cc_code=c["cc_code"],
                cc_name=c["cc_name"],
                ou=c["ou"],
                ts_hours=round(c["ts_hours"], 1),
                ts_net_revenue=round(c["ts_net_revenue"], 2),
                pct_of_total=round(c["ts_net_revenue"] / total_nr * 100, 1) if total_nr else 0.0
            ))
        res.append(DashboardBuBreakdown(
            bu=b["bu"],
            ts_hours=round(b["ts_hours"], 1),
            ts_net_revenue=round(b["ts_net_revenue"], 2),
            pct_of_total=round(b["ts_net_revenue"] / total_nr * 100, 1) if total_nr else 0.0,
            cost_centers=ccs
        ))
    return res


# ─────────────────────────────────────────────────────────────────────────────
# /api/dashboard  — KPI globali + breakdown FY/BU/clienti
# ─────────────────────────────────────────────────────────────────────────────

@router.get("")
def dashboard(
    fy: int | None = Query(None, description="FY corrente (default: calcolato da oggi)"),
    db: Session = Depends(get_db),
):
    """KPI globali, breakdown FY/BU con livello BU -> CC, lista clienti interattiva, codici a rischio."""
    today = date.today()
    current_fy = fy or _current_fy(today)

    # Filtro progetti: solo non stale e "reali" (con produzione o aperti)
    # Questo evita di conteggiare budget di progetti cancellati o mai partiti.
    projects = db.query(FactProject).filter(
        FactProject.is_stale == 0,
        or_(
            FactProject.project_status.not_in(["Chiuso", "In Chiusura"]),
            FactProject.net_revenue_act > 0,
            FactProject.hours_actual > 0
        )
    ).all()

    # ── Query unica 3-way: progetto × FY timesheet × BU × CC ────────────────
    ts_3way = (
        db.query(
            FactTimesheet.project_id,
            FactTimesheet.fy,
            func.coalesce(DimCostCenter.bu, "—").label("bu"),
            func.coalesce(FactTimesheet.resource_cost_center, "—").label("cc_code"),
            func.coalesce(DimCostCenter.cc_name, "—").label("cc_name"),
            func.coalesce(DimCostCenter.ou, "—").label("ou"),
            func.sum(FactTimesheet.hours_actual).label("ts_hours"),
            func.sum(FactTimesheet.net_revenue_actual).label("ts_net_revenue"),
        )
        .outerjoin(DimCostCenter, FactTimesheet.resource_cost_center == DimCostCenter.cc_code)
        .filter(FactTimesheet.is_stale == 0)
        .group_by(
            FactTimesheet.project_id,
            FactTimesheet.fy,
            DimCostCenter.bu,
            FactTimesheet.resource_cost_center,
            DimCostCenter.cc_name,
            DimCostCenter.ou
        )
        .all()
    )

    # Indici derivati dalla query 3-way
    # proj_fy_bu_map[pid][fy][bu][cc_code] = {hours, nr, cc_name, ou}
    proj_fy_bu_map: dict[str, dict[int, dict[str, dict[str, dict]]]] = {}
    for r in ts_3way:
        pid, fy_ts, bu, cc_code = r.project_id, r.fy or 0, r.bu, r.cc_code
        fy_map = proj_fy_bu_map.setdefault(pid, {}).setdefault(fy_ts, {})
        bu_map = fy_map.setdefault(bu, {})
        cc_entry = bu_map.setdefault(cc_code, {"hours": 0.0, "nr": 0.0, "cc_name": r.cc_name, "ou": r.ou})
        cc_entry["hours"] += float(r.ts_hours or 0)
        cc_entry["nr"] += float(r.ts_net_revenue or 0)

    def _sum_proj_total(pid: str) -> tuple[float, float]:
        """Totale ts hours/nr per progetto (su tutti i FY e BU)."""
        h = nr = 0.0
        for fy_d in proj_fy_bu_map.get(pid, {}).values():
            for bu_d in fy_d.values():
                for cc_d in bu_d.values():
                    h += cc_d["hours"]
                    nr += cc_d["nr"]
        return h, nr

    # ── Aggregati mensili per at-risk detection ───────────────────────────────
    ts_monthly = (
        db.query(
            FactTimesheet.project_id,
            func.substr(FactTimesheet.week_id, 1, 7).label("month_id"),
            func.sum(FactTimesheet.hours_actual).label("hours"),
            func.sum(FactTimesheet.net_revenue_actual).label("net_revenue"),
        )
        .filter(FactTimesheet.is_stale == 0)
        .group_by(FactTimesheet.project_id, func.substr(FactTimesheet.week_id, 1, 7))
        .all()
    )
    monthly_by_project: dict[str, list[MonthlyPoint]] = {}
    for row in ts_monthly:
        monthly_by_project.setdefault(row.project_id, []).append(
            MonthlyPoint(month_id=row.month_id, hours=row.hours or 0.0, net_revenue=row.net_revenue or 0.0)
        )

    # ── Accumulatori globali ──────────────────────────────────────────────────
    total_iow_hours = 0.0
    total_iow_nr = 0.0
    total_ts_hours = 0.0
    total_ts_nr = 0.0
    open_count = 0
    closed_count = 0

    by_fy_project: dict[int, dict[str, Any]] = {}   # da fy_closing
    by_fy_ts: dict[int, dict[str, dict[str, Any]]] = {}  # da timesheet.fy, con by_bu nested CCs
    by_bu_total: dict[str, dict[str, Any]] = {} # globale con CCs nested
    by_client: dict[str, dict[str, Any]] = {}

    at_risk_projects: list[dict] = []

    for p in projects:
        ts_h, ts_nr = _sum_proj_total(p.project_id)
        iow_h = float(p.iow_hours_total or 0)
        iow_nr = float(p.iow_net_revenue or 0)

        total_iow_hours += iow_h
        total_iow_nr += iow_nr
        total_ts_hours += ts_h
        total_ts_nr += ts_nr

        is_closed = p.project_status == "In Chiusura" or p.project_status == "Chiuso"
        if is_closed:
            closed_count += 1
        else:
            open_count += 1

        # ── by_fy per fy_closing (budget IOW e conteggi) ──
        fy_c = p.fy_closing or 0
        by_fy_project.setdefault(fy_c, {
            "fy": fy_c, "project_count": 0, "open_count": 0,
            "closed_count": 0, "iow_net_revenue": 0.0,
        })
        by_fy_project[fy_c]["project_count"] += 1
        by_fy_project[fy_c]["iow_net_revenue"] += iow_nr
        by_fy_project[fy_c]["open_count" if not is_closed else "closed_count"] += 1

        # ── by_fy_ts: produzione per timesheet.fy, con BU > CC nested ──
        # ATTENZIONE: Attribuiamo il budget IOW a ogni anno in cui il progetto è attivo
        # per permettere confronti Budget vs Actual sensati nei singoli FY.
        for fy_ts, bu_map in proj_fy_bu_map.get(p.project_id, {}).items():
            if fy_ts not in by_fy_ts:
                by_fy_ts[fy_ts] = {
                    "fy": fy_ts, "ts_hours": 0.0, "ts_net_revenue": 0.0, 
                    "iow_net_revenue": 0.0, # Budget "attivo" in questo FY
                    "project_count": 0, "open_count": 0, "closed_count": 0,
                    "_by_bu": {}
                }
            
            f_ts = by_fy_ts[fy_ts]
            f_ts["iow_net_revenue"] += iow_nr
            f_ts["project_count"] += 1
            f_ts["open_count" if not is_closed else "closed_count"] += 1

            for bu, cc_map in bu_map.items():
                bu_d = f_ts["_by_bu"]
                bu_entry = bu_d.setdefault(bu, {"bu": bu, "ts_hours": 0.0, "ts_net_revenue": 0.0, "_ccs": {}})
                for cc_code, vals in cc_map.items():
                    f_ts["ts_hours"] += vals["hours"]
                    f_ts["ts_net_revenue"] += vals["nr"]
                    bu_entry["ts_hours"] += vals["hours"]
                    bu_entry["ts_net_revenue"] += vals["nr"]
                    cc_entry = bu_entry["_ccs"].setdefault(cc_code, {"cc_code": cc_code, "cc_name": vals["cc_name"], "ou": vals["ou"], "ts_hours": 0.0, "ts_net_revenue": 0.0})
                    cc_entry["ts_hours"] += vals["hours"]
                    cc_entry["ts_net_revenue"] += vals["nr"]

        # ── by_bu globale (tutti i FY) con CC nested ──
        for fy_map in proj_fy_bu_map.get(p.project_id, {}).values():
            for bu, cc_map in fy_map.items():
                bu_entry = by_bu_total.setdefault(bu, {"bu": bu, "ts_hours": 0.0, "ts_net_revenue": 0.0, "_ccs": {}})
                for cc_code, vals in cc_map.items():
                    bu_entry["ts_hours"] += vals["hours"]
                    bu_entry["ts_net_revenue"] += vals["nr"]
                    cc_entry = bu_entry["_ccs"].setdefault(cc_code, {"cc_code": cc_code, "cc_name": vals["cc_name"], "ou": vals["ou"], "ts_hours": 0.0, "ts_net_revenue": 0.0})
                    cc_entry["ts_hours"] += vals["hours"]
                    cc_entry["ts_net_revenue"] += vals["nr"]

        # ── at-risk ──
        monthly = monthly_by_project.get(p.project_id, [])
        rr = calc_run_rate(monthly, "last_month")
        residuo_ore = (float(p.iow_hours_total) - ts_h) if p.iow_hours_total else None
        if residuo_ore is not None:
            mesi = calc_mesi_residui(residuo_ore, rr.hours)
        else:
            residuo_nr_atr = (float(p.iow_net_revenue) - ts_nr) if p.iow_net_revenue else None
            mesi = (round(residuo_nr_atr / rr.net_revenue, 4) if (residuo_nr_atr and rr.net_revenue) else None)
        data_esaur = calc_data_esaurimento(today, mesi)
        is_risk = is_at_risk(data_esaur, today, p.project_status)

        client = p.client
        client_name = client.client_name if client else "—"
        client_group = client.client_group if client else None

        if is_risk:
            at_risk_projects.append({
                "project_id": p.project_id,
                "project_title": p.project_title,
                "project_status": p.project_status,
                "client_name": client_name,
                "data_esaurimento": data_esaur.isoformat() if data_esaur else None,
                "giorni_residui": (data_esaur - today).days if data_esaur else None,
                "residuo_ore": round(residuo_ore, 1) if residuo_ore is not None else None,
            })

        # ── aggregati per cliente ──
        if client_name not in by_client:
            by_client[client_name] = {
                "client_name": client_name,
                "client_group": client_group,
                "project_count": 0,
                "open_count": 0,
                "closed_count": 0,
                "ts_hours": 0.0,
                "ts_net_revenue": 0.0,
                "iow_net_revenue": 0.0,
                "residuo_eur": 0.0,
                "at_risk_count": 0,
                "_by_fy": {},   
                "_by_bu": {},   
            }
        c = by_client[client_name]
        c["project_count"] += 1
        c["ts_hours"] += ts_h
        c["ts_net_revenue"] += ts_nr
        c["iow_net_revenue"] += iow_nr
        c["residuo_eur"] += (iow_nr - ts_nr) if iow_nr else 0.0
        c["open_count" if not is_closed else "closed_count"] += 1
        if is_risk:
            c["at_risk_count"] += 1

        for fy_ts, bu_map in proj_fy_bu_map.get(p.project_id, {}).items():
            fy_entry = c["_by_fy"].setdefault(fy_ts, {
                "fy": fy_ts, "ts_hours": 0.0, "ts_net_revenue": 0.0,
                "project_count": 0, "_by_bu": {},
            })
            fy_entry["project_count"] += 1
            for bu, cc_map in bu_map.items():
                bu_entry_fy = fy_entry["_by_bu"].setdefault(bu, {"bu": bu, "ts_hours": 0.0, "ts_net_revenue": 0.0, "_ccs": {}})
                bu_entry_glob = c["_by_bu"].setdefault(bu, {"bu": bu, "ts_hours": 0.0, "ts_net_revenue": 0.0, "_ccs": {}})
                for cc_code, vals in cc_map.items():
                    fy_entry["ts_hours"] += vals["hours"]
                    fy_entry["ts_net_revenue"] += vals["nr"]
                    bu_entry_fy["ts_hours"] += vals["hours"]
                    bu_entry_fy["ts_net_revenue"] += vals["nr"]
                    cc_entry_fy = bu_entry_fy["_ccs"].setdefault(cc_code, {"cc_code": cc_code, "cc_name": vals["cc_name"], "ou": vals["ou"], "ts_hours": 0.0, "ts_net_revenue": 0.0})
                    cc_entry_fy["ts_hours"] += vals["hours"]
                    cc_entry_fy["ts_net_revenue"] += vals["nr"]
                    
                    bu_entry_glob["ts_hours"] += vals["hours"]
                    bu_entry_glob["ts_net_revenue"] += vals["nr"]
                    cc_entry_glob = bu_entry_glob["_ccs"].setdefault(cc_code, {"cc_code": cc_code, "cc_name": vals["cc_name"], "ou": vals["ou"], "ts_hours": 0.0, "ts_net_revenue": 0.0})
                    cc_entry_glob["ts_hours"] += vals["hours"]
                    cc_entry_glob["ts_net_revenue"] += vals["nr"]

    at_risk_projects.sort(key=lambda x: x["giorni_residui"] if x["giorni_residui"] is not None else 9999)

    # ── Merge by_fy (basato ora principalmente sui FY di attività) ───────────
    all_fys = sorted(by_fy_ts.keys())
    if 0 in all_fys: all_fys.remove(0)
    
    by_fy_result = []
    for fy_val in all_fys:
        ts_d = by_fy_ts.get(fy_val, {})
        fy_ts_nr = ts_d.get("ts_net_revenue", 0.0)
        fy_iow_nr = ts_d.get("iow_net_revenue", 0.0)
        
        by_fy_result.append({
            "fy": fy_val,
            "project_count": ts_d.get("project_count", 0),
            "open_count": ts_d.get("open_count", 0),
            "closed_count": ts_d.get("closed_count", 0),
            "iow_net_revenue": round(fy_iow_nr, 2),
            "ts_net_revenue": round(fy_ts_nr, 2),
            "ts_hours": round(ts_d.get("ts_hours", 0.0), 1),
            "by_bu": _make_bu_list(ts_d.get("_by_bu", {}), fy_ts_nr),
        })

    clients_final = []
    for cn, v in sorted(by_client.items()):
        clients_final.append({
            "client_name": cn,
            "client_group": v["client_group"],
            "project_count": v["project_count"],
            "open_count": v["open_count"],
            "closed_count": v["closed_count"],
            "iow_net_revenue": round(v["iow_net_revenue"], 2),
            "ts_net_revenue": round(v["ts_net_revenue"], 2),
            "ts_hours": round(v["ts_hours"], 1),
            "pct_consumo": round(v["ts_net_revenue"] / v["iow_net_revenue"] * 100, 1) if v["iow_net_revenue"] else None,
            "residuo_eur": round(v["residuo_eur"], 2),
            "at_risk_count": v["at_risk_count"],
            "by_fy": [
                {
                    "fy": fy_val,
                    "ts_net_revenue": round(fd["ts_net_revenue"], 2),
                    "ts_hours": round(fd["ts_hours"], 1),
                    "project_count": fd["project_count"],
                    "by_bu": _make_bu_list(fd["_by_bu"], fd["ts_net_revenue"]),
                }
                for fy_val, fd in sorted(v["_by_fy"].items())
            ],
            "by_bu": _make_bu_list(v["_by_bu"], v["ts_net_revenue"]),
        })

    return {
        "fy": current_fy,
        "totals": {
            "project_count": len(projects),
            "open_count": open_count,
            "closed_count": closed_count,
            "iow_net_revenue_total": round(total_iow_nr, 2),
            "ts_net_revenue_total": round(total_ts_nr, 2),
            "ts_hours_total": round(total_ts_hours, 1),
            "pct_consumo_globale": round(total_ts_nr / total_iow_nr * 100, 1) if total_iow_nr else None,
            "residuo_eur_totale": round(total_iow_nr - total_ts_nr, 2),
            "residuo_ore_totale": round(total_iow_hours - total_ts_hours, 1),
        },
        "by_fy": by_fy_result,
        "by_bu": _make_bu_list(by_bu_total, total_ts_nr),
        "clients": clients_final,
        "at_risk_count": len(at_risk_projects),
        "at_risk_projects": at_risk_projects,
    }


# ─────────────────────────────────────────────────────────────────────────────
# /api/dashboard/fy-forecast  — Previsione chiusura FY per cliente
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/fy-forecast")
def fy_forecast(
    fy: int | None = Query(None, description="FY da prevedere (default: corrente)"),
    db: Session = Depends(get_db),
):
    """
    Previsione di chiusura FY al 30 giugno per cliente con breakdown BU -> CC.
    """
    today = date.today()
    current_fy = fy or _current_fy(today)
    end_date = _fy_end(current_fy)
    days_remaining = max(0, (end_date - today).days)
    weeks_remaining = round(days_remaining / 7, 2)

    projects = db.query(FactProject).filter(
        FactProject.is_stale == 0,
        or_(
            FactProject.project_status.not_in(["Chiuso", "In Chiusura"]),
            FactProject.net_revenue_act > 0,
            FactProject.hours_actual > 0
        )
    ).all()

    # ── Totale TS per progetto (all-time, per residuo) ──
    ts_total_rows = (
        db.query(
            FactTimesheet.project_id,
            func.sum(FactTimesheet.net_revenue_actual).label("ts_nr"),
            func.sum(FactTimesheet.hours_actual).label("ts_hours"),
        )
        .filter(FactTimesheet.is_stale == 0)
        .group_by(FactTimesheet.project_id)
        .all()
    )
    ts_total_map = {r.project_id: {"nr": float(r.ts_nr or 0), "hours": float(r.ts_hours or 0)} for r in ts_total_rows}

    # ── Totale TS nel FY corrente per progetto ──
    ts_fy_rows = (
        db.query(
            FactTimesheet.project_id,
            func.sum(FactTimesheet.net_revenue_actual).label("ts_nr"),
            func.sum(FactTimesheet.hours_actual).label("ts_hours"),
        )
        .filter(FactTimesheet.is_stale == 0, FactTimesheet.fy == current_fy)
        .group_by(FactTimesheet.project_id)
        .all()
    )
    ts_fy_map = {r.project_id: {"nr": float(r.ts_nr or 0), "hours": float(r.ts_hours or 0)} for r in ts_fy_rows}

    # ── Dati settimanali FY corrente per run rate ──
    ts_weekly_rows = (
        db.query(
            FactTimesheet.project_id,
            FactTimesheet.week_id,
            func.sum(FactTimesheet.net_revenue_actual).label("nr"),
            func.sum(FactTimesheet.hours_actual).label("hours"),
        )
        .filter(FactTimesheet.is_stale == 0, FactTimesheet.fy == current_fy)
        .group_by(FactTimesheet.project_id, FactTimesheet.week_id)
        .all()
    )

    from ..models.giroconti import GirocontoTag
    giroconto_set: set[tuple[str, str]] = {
        (g.project_id, g.week_id)
        for g in db.query(GirocontoTag.project_id, GirocontoTag.week_id).all()
    }

    weekly_by_proj: dict[str, list[tuple[str, float, float, bool]]] = {}
    for r in ts_weekly_rows:
        is_giroconto = (r.project_id, r.week_id) in giroconto_set
        weekly_by_proj.setdefault(r.project_id, []).append(
            (r.week_id, float(r.nr or 0), float(r.hours or 0), is_giroconto)
        )
    for pid in weekly_by_proj:
        weekly_by_proj[pid].sort(key=lambda x: x[0], reverse=True)

    # ── BU→CC mix per progetto ──
    ts_fy_bu_cc_rows = (
        db.query(
            FactTimesheet.project_id,
            func.coalesce(DimCostCenter.bu, "—").label("bu"),
            func.coalesce(FactTimesheet.resource_cost_center, "—").label("cc_code"),
            func.coalesce(DimCostCenter.cc_name, "—").label("cc_name"),
            func.coalesce(DimCostCenter.ou, "—").label("ou"),
            func.sum(FactTimesheet.net_revenue_actual).label("nr"),
        )
        .outerjoin(DimCostCenter, FactTimesheet.resource_cost_center == DimCostCenter.cc_code)
        .filter(FactTimesheet.is_stale == 0, FactTimesheet.fy == current_fy)
        .group_by(
            FactTimesheet.project_id,
            DimCostCenter.bu,
            FactTimesheet.resource_cost_center,
            DimCostCenter.cc_name,
            DimCostCenter.ou,
        )
        .all()
    )
    bu_mix_by_proj: dict[str, dict[str, dict]] = {}
    for r in ts_fy_bu_cc_rows:
        bu_entry = bu_mix_by_proj.setdefault(r.project_id, {}).setdefault(r.bu, {"ccs": {}})
        cc_entry = bu_entry["ccs"].setdefault(r.cc_code, {"cc_name": r.cc_name, "ou": r.ou, "nr": 0.0})
        cc_entry["nr"] += float(r.nr or 0)

    for pid, bu_map in bu_mix_by_proj.items():
        total = sum(cc["nr"] for bu in bu_map.values() for cc in bu["ccs"].values())
        if total:
            for bu in bu_map.values():
                for cc in bu["ccs"].values():
                    cc["nr"] /= total

    # ── Aggrega per cliente ──
    by_client_f: dict[str, dict[str, Any]] = {}

    for p in projects:
        client = p.client
        cn = client.client_name if client else "—"
        cg = client.client_group if client else None

        ts_all = ts_total_map.get(p.project_id, {"nr": 0.0, "hours": 0.0})
        ts_fy = ts_fy_map.get(p.project_id, {"nr": 0.0, "hours": 0.0})
        iow_nr = float(p.iow_net_revenue or 0)
        iow_hours = float(p.iow_hours_total or 0)
        is_closed = p.project_status == "In Chiusura" or p.project_status == "Chiuso"

        nr_actual = float(p.net_revenue_act) if p.net_revenue_act else ts_all["nr"]
        hours_actual = float(p.hours_actual) if p.hours_actual else ts_all["hours"]

        weekly = weekly_by_proj.get(p.project_id, [])

        if is_closed:
            residuo_nr = 0.0
            residuo_ore = None
            rr_nr = 0.0
            rr_hours = 0.0
        else:
            residuo_nr = (iow_nr - nr_actual) if iow_nr else 0.0
            residuo_ore = (iow_hours - hours_actual) if iow_hours else None
            non_giroconto = [w for w in weekly if not w[3]]
            last4 = non_giroconto[:4]
            rr_nr = sum(w[1] for w in last4) / len(last4) if last4 else 0.0
            rr_hours = sum(w[2] for w in last4) / len(last4) if last4 else 0.0

        bu_mix = bu_mix_by_proj.get(p.project_id, {})

        if cn not in by_client_f:
            by_client_f[cn] = {
                "client_name": cn,
                "client_group": cg,
                "ts_nr_ytd": 0.0,
                "ts_hours_ytd": 0.0,
                "available_budget_nr": 0.0,
                "available_budget_hours": 0.0,
                "_has_hours_data": False,
                "_bu_weighted": {},
                "_weekly": {},
                "_weekly_open": {},
            }
        c = by_client_f[cn]
        c["ts_nr_ytd"] += ts_fy["nr"]
        c["ts_hours_ytd"] += ts_fy["hours"]
        c["available_budget_nr"] += residuo_nr
        if residuo_ore is not None:
            c["available_budget_hours"] += residuo_ore
            c["_has_hours_data"] = True

        for bu, bu_data in bu_mix.items():
            c_bu = c["_bu_weighted"].setdefault(bu, {"ccs": {}})
            for cc_code, cc_data in bu_data["ccs"].items():
                c_cc = c_bu["ccs"].setdefault(cc_code, {"cc_name": cc_data["cc_name"], "ou": cc_data["ou"], "weighted_nr": 0.0})
                c_cc["weighted_nr"] += rr_nr * cc_data["nr"]

        for wid, w_nr, w_hours, w_is_giroconto in weekly:
            c["_weekly"].setdefault(wid, {"nr": 0.0, "hours": 0.0, "has_giroconto": False})
            c["_weekly"][wid]["nr"] += w_nr
            c["_weekly"][wid]["hours"] += w_hours
            if w_is_giroconto:
                c["_weekly"][wid]["has_giroconto"] = True
            if not is_closed and not w_is_giroconto:
                c["_weekly_open"].setdefault(wid, {"nr": 0.0, "hours": 0.0})
                c["_weekly_open"][wid]["nr"] += w_nr
                c["_weekly_open"][wid]["hours"] += w_hours

    clients_result = []
    total_ts_ytd = 0.0
    total_additional = 0.0
    total_available_nr = 0.0

    INF = float("inf")

    for cn, c in by_client_f.items():
        open_weekly_sorted = sorted(c["_weekly_open"].items(), key=lambda x: x[0], reverse=True)[:4]
        rr_nr = sum(d["nr"] for _, d in open_weekly_sorted) / len(open_weekly_sorted) if open_weekly_sorted else 0.0
        rr_hours = sum(d["hours"] for _, d in open_weekly_sorted) / len(open_weekly_sorted) if open_weekly_sorted else 0.0
        available_nr = c["available_budget_nr"]
        available_hours = c["available_budget_hours"]
        has_hours = c["_has_hours_data"]

        projected_additional = rr_nr * weeks_remaining
        projected_total = c["ts_nr_ytd"] + projected_additional

        weeks_nr = (available_nr / rr_nr) if rr_nr > 0 else INF
        weeks_hours = (available_hours / rr_hours) if (has_hours and rr_hours > 0) else INF
        weeks_coverage = min(weeks_nr, weeks_hours)

        if weeks_coverage == INF:
            exhaustion_type = "ok"
        elif weeks_hours <= weeks_nr:
            exhaustion_type = "hours"
        else:
            exhaustion_type = "nr"

        if weeks_coverage < INF and weeks_coverage < weeks_remaining * 3:
            sat_delta = int(weeks_coverage * 7)
            saturation_date = (today + __import__("datetime").timedelta(days=sat_delta)).isoformat()
        else:
            saturation_date = None

        if rr_nr == 0:
            status = "grey"
        elif available_nr <= 0 or (has_hours and available_hours <= 0):
            status = "red"
        elif weeks_coverage < weeks_remaining * 0.95:
            deficit_weeks = weeks_remaining - weeks_coverage
            status = "red" if deficit_weeks > 2 else "amber"
        else:
            status = "green"

        bu_grand_total = sum(cc["weighted_nr"] for bu in c["_bu_weighted"].values() for cc in bu["ccs"].values())
        by_bu_forecast = []
        for bu, bu_data in sorted(c["_bu_weighted"].items(), key=lambda x: sum(cc["weighted_nr"] for cc in x[1]["ccs"].values()), reverse=True):
            bu_nr = sum(cc["weighted_nr"] for cc in bu_data["ccs"].values())
            bu_pct = round(bu_nr / bu_grand_total * 100, 1) if bu_grand_total else 0.0
            bu_forecasted = round(bu_nr / bu_grand_total * projected_additional, 2) if bu_grand_total else 0.0
            by_cc = sorted(
                [
                    {
                        "cc_code": cc_code,
                        "cc_name": cc_info["cc_name"],
                        "ou": cc_info["ou"],
                        "forecasted_nr": round(cc_info["weighted_nr"] / bu_grand_total * projected_additional, 2) if bu_grand_total else 0.0,
                        "pct_of_forecast": round(cc_info["weighted_nr"] / bu_grand_total * 100, 1) if bu_grand_total else 0.0,
                        "pct_of_bu": round(cc_info["weighted_nr"] / bu_nr * 100, 1) if bu_nr else 0.0,
                    }
                    for cc_code, cc_info in bu_data["ccs"].items()
                ],
                key=lambda x: x["forecasted_nr"],
                reverse=True,
            )
            by_bu_forecast.append({
                "bu": bu,
                "forecasted_nr": bu_forecasted,
                "pct_of_forecast": bu_pct,
                "by_cc": by_cc,
            })

        total_ts_ytd += c["ts_nr_ytd"]
        total_additional += projected_additional
        total_available_nr += available_nr

        clients_result.append({
            "client_name": cn,
            "client_group": c["client_group"],
            "ts_nr_ytd": round(c["ts_nr_ytd"], 2),
            "ts_hours_ytd": round(c["ts_hours_ytd"], 1),
            "run_rate_weekly_nr": round(rr_nr, 2),
            "run_rate_weekly_hours": round(rr_hours, 2),
            "projected_additional_nr": round(projected_additional, 2),
            "projected_total_nr": round(projected_total, 2),
            "available_budget": round(available_nr, 2),
            "available_budget_hours": round(available_hours, 1),
            "weeks_to_exhaustion": round(weeks_coverage, 1) if weeks_coverage < INF else None,
            "saturation_date": saturation_date,
            "exhaustion_type": exhaustion_type,
            "coverage_status": status,
            "by_bu_forecast": by_bu_forecast,
            "actual_weeks_fy": [
                {
                    "week_id": wid,
                    "nr": round(d["nr"], 2),
                    "hours": round(d["hours"], 1),
                    "is_giroconto": d.get("has_giroconto", False),
                }
                for wid, d in sorted(c["_weekly"].items(), reverse=True)[:16]
            ],
        })

    clients_result.sort(key=lambda x: x["projected_total_nr"], reverse=True)

    statuses = [c["coverage_status"] for c in clients_result]
    if not statuses or all(s == "grey" for s in statuses):
        global_status = "grey"
    elif "red" in statuses:
        global_status = "red"
    elif "amber" in statuses:
        global_status = "amber"
    else:
        global_status = "green"

    return {
        "fy": current_fy,
        "fy_end": end_date.isoformat(),
        "today": today.isoformat(),
        "days_remaining": days_remaining,
        "weeks_remaining": weeks_remaining,
        "global": {
            "ts_nr_ytd": round(total_ts_ytd, 2),
            "projected_additional_nr": round(total_additional, 2),
            "projected_total_nr": round(total_ts_ytd + total_additional, 2),
            "available_budget": round(total_available_nr, 2),
            "coverage_status": global_status,
        },
        "clients": clients_result,
    }


# ─────────────────────────────────────────────────────────────────────────────
# /api/dashboard/last-week  — Riepilogo caricamenti ultima settimana
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/last-week")
def last_week_summary(db: Session = Depends(get_db)):
    """
    Caricamenti dell'ultima settimana con dati, aggregati per risorsa.
    """
    recent_weeks = (
        db.query(FactTimesheet.week_id)
        .filter(FactTimesheet.is_stale == 0)
        .distinct()
        .order_by(FactTimesheet.week_id.desc())
        .limit(5)
        .all()
    )
    week_ids = [r.week_id for r in recent_weeks]
    if not week_ids:
        return {"week_id": None, "week_end": None, "total_hours": 0.0, "total_resources": 0, "resources": []}

    last_week_id = week_ids[0]
    dim_w = db.get(DimWeek, last_week_id)
    week_end = dim_w.week_end.isoformat() if (dim_w and dim_w.week_end) else None

    lw_rows = (
        db.query(
            FactTimesheet.resource_id,
            FactTimesheet.project_id,
            func.coalesce(DimCostCenter.bu, "—").label("bu"),
            func.sum(FactTimesheet.hours_actual).label("hours"),
            func.sum(FactTimesheet.net_revenue_actual).label("nr"),
        )
        .outerjoin(DimCostCenter, FactTimesheet.resource_cost_center == DimCostCenter.cc_code)
        .filter(FactTimesheet.is_stale == 0, FactTimesheet.week_id == last_week_id)
        .group_by(FactTimesheet.resource_id, FactTimesheet.project_id, DimCostCenter.bu)
        .all()
    )

    res_data: dict[str, dict] = {}
    for row in lw_rows:
        rid = row.resource_id
        if rid not in res_data:
            dim_res = db.get(DimResource, rid)
            res_data[rid] = {
                "resource_id": rid,
                "resource_name": (dim_res.resource_name if dim_res else None) or rid,
                "bu": row.bu,
                "hours": 0.0,
                "nr": 0.0,
                "projects": [],
            }
        res_data[rid]["hours"] += float(row.hours or 0)
        res_data[rid]["nr"] += float(row.nr or 0)
        res_data[rid]["projects"].append({
            "project_id": row.project_id,
            "hours": float(row.hours or 0),
            "nr": float(row.nr or 0),
        })

    result_res = []
    total_h = 0.0
    for r in res_data.values():
        total_h += r["hours"]
        r["hours"] = round(r["hours"], 1)
        r["nr"] = round(r["nr"], 2)
        for p in r["projects"]:
            p["hours"] = round(p["hours"], 1)
            p["nr"] = round(p["nr"], 2)
        result_res.append(r)

    result_res.sort(key=lambda x: x["hours"], reverse=True)

    return {
        "week_id": last_week_id,
        "week_end": week_end,
        "total_hours": round(total_h, 1),
        "total_resources": len(result_res),
        "resources": result_res,
    }


# ─────────────────────────────────────────────────────────────────────────────
# /api/dashboard/resource-fte  — FTE per risorsa
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/resource-fte")
def resource_fte(
    fy: int | None = Query(None, description="FY di riferimento"),
    db: Session = Depends(get_db),
):
    """
    FTE per risorsa nel FY selezionato.
    """
    today = date.today()
    current_fy = fy or _current_fy(today)

    rp_rows = (
        db.query(
            FactTimesheet.resource_id,
            FactTimesheet.project_id,
            func.coalesce(DimCostCenter.bu, "—").label("bu"),
            func.sum(FactTimesheet.hours_actual).label("hours"),
            func.sum(FactTimesheet.net_revenue_actual).label("nr"),
        )
        .outerjoin(DimCostCenter, FactTimesheet.resource_cost_center == DimCostCenter.cc_code)
        .filter(FactTimesheet.is_stale == 0, FactTimesheet.fy == current_fy)
        .group_by(FactTimesheet.resource_id, FactTimesheet.project_id, DimCostCenter.bu)
        .all()
    )

    active_weeks_rows = (
        db.query(
            FactTimesheet.resource_id,
            func.count(func.distinct(FactTimesheet.week_id)).label("active_weeks"),
        )
        .filter(FactTimesheet.is_stale == 0, FactTimesheet.fy == current_fy)
        .group_by(FactTimesheet.resource_id)
        .all()
    )
    active_weeks_map = {r.resource_id: int(r.active_weeks) for r in active_weeks_rows}

    res_data_fte: dict[str, dict] = {}
    for row in rp_rows:
        rid = row.resource_id
        if rid not in res_data_fte:
            dim_res = db.get(DimResource, rid)
            res_data_fte[rid] = {
                "resource_id": rid,
                "resource_name": (dim_res.resource_name if dim_res else None) or rid,
                "bu": row.bu,
                "total_hours": 0.0,
                "total_nr": 0.0,
                "projects": [],
            }
        res_data_fte[rid]["total_hours"] += float(row.hours or 0)
        res_data_fte[rid]["total_nr"] += float(row.nr or 0)
        res_data_fte[rid]["projects"].append({
            "project_id": row.project_id,
            "hours": float(row.hours or 0),
            "nr": float(row.nr or 0),
        })

    final_res = []
    for rid, r in res_data_fte.items():
        active_weeks = active_weeks_map.get(rid, 1)
        total_hours = r["total_hours"]
        fte_total = (total_hours / active_weeks / 40.0) if active_weeks > 0 else 0.0

        r["total_hours"] = round(total_hours, 1)
        r["total_nr"] = round(r["total_nr"], 2)
        r["fte"] = round(fte_total, 2)
        r["active_weeks"] = active_weeks
        r["days_per_month"] = round(fte_total * 20, 1)
        for p in r["projects"]:
            p["hours"] = round(p["hours"], 1)
            p["nr"] = round(p["nr"], 2)
            p["fte"] = round(p["hours"] / active_weeks / 40.0, 2) if active_weeks > 0 else 0.0
            p["pct_of_time"] = round(p["hours"] / total_hours * 100, 1) if total_hours > 0 else 0.0
        final_res.append(r)

    final_res.sort(key=lambda x: x["fte"], reverse=True)
    return final_res
