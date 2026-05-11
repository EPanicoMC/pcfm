"""Endpoint dashboard: KPI globali + breakdown per cliente/FY/BU + previsione chiusura FY."""

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.dimensions import DimCostCenter
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


# ─────────────────────────────────────────────────────────────────────────────
# /api/dashboard  — KPI globali + breakdown FY/BU/clienti
# ─────────────────────────────────────────────────────────────────────────────

@router.get("")
def dashboard(
    fy: int | None = Query(None, description="FY corrente (default: calcolato da oggi)"),
    db: Session = Depends(get_db),
):
    """KPI globali, breakdown FY/BU con livello BU per FY, lista clienti interattiva, codici a rischio."""
    today = date.today()
    current_fy = fy or _current_fy(today)

    projects = db.query(FactProject).filter(FactProject.is_stale == 0).all()

    # ── Query unica 3-way: progetto × FY timesheet × BU ─────────────────────
    # Sostituisce le 3 query separate precedenti per maggiore efficienza
    ts_3way = (
        db.query(
            FactTimesheet.project_id,
            FactTimesheet.fy,
            func.coalesce(DimCostCenter.bu, "—").label("bu"),
            func.sum(FactTimesheet.hours_actual).label("ts_hours"),
            func.sum(FactTimesheet.net_revenue_actual).label("ts_net_revenue"),
        )
        .outerjoin(DimCostCenter, FactTimesheet.resource_cost_center == DimCostCenter.cc_code)
        .filter(FactTimesheet.is_stale == 0)
        .group_by(FactTimesheet.project_id, FactTimesheet.fy, DimCostCenter.bu)
        .all()
    )

    # Indici derivati dalla query 3-way
    # proj_fy_bu_map[pid][fy][bu] = {hours, nr}
    proj_fy_bu_map: dict[str, dict[int, dict[str, dict[str, float]]]] = {}
    for r in ts_3way:
        pid, fy_ts, bu = r.project_id, r.fy or 0, r.bu
        proj_fy_bu_map.setdefault(pid, {}).setdefault(fy_ts, {}).setdefault(bu, {"hours": 0.0, "nr": 0.0})
        proj_fy_bu_map[pid][fy_ts][bu]["hours"] += float(r.ts_hours or 0)
        proj_fy_bu_map[pid][fy_ts][bu]["nr"] += float(r.ts_net_revenue or 0)

    def _sum_proj_total(pid: str) -> tuple[float, float]:
        """Totale ts hours/nr per progetto (su tutti i FY e BU)."""
        h = nr = 0.0
        for fy_d in proj_fy_bu_map.get(pid, {}).values():
            for bu_d in fy_d.values():
                h += bu_d["hours"]
                nr += bu_d["nr"]
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

    # ── Costruzione risposta ──────────────────────────────────────────────────
    total_iow_hours = 0.0
    total_iow_nr = 0.0
    total_ts_hours = 0.0
    total_ts_nr = 0.0
    open_count = 0
    closed_count = 0

    # Accumulatori globali
    by_fy_project: dict[int, dict[str, Any]] = {}   # da fy_closing
    by_fy_ts: dict[int, dict[str, dict[str, Any]]] = {}  # da timesheet.fy, con by_bu
    by_bu_total: dict[str, dict[str, Any]] = {}

    at_risk_projects: list[dict] = []
    by_client: dict[str, dict[str, Any]] = {}

    for p in projects:
        ts_h, ts_nr = _sum_proj_total(p.project_id)
        iow_h = float(p.iow_hours_total or 0)
        iow_nr = float(p.iow_net_revenue or 0)

        total_iow_hours += iow_h
        total_iow_nr += iow_nr
        total_ts_hours += ts_h
        total_ts_nr += ts_nr

        is_closed = p.project_status == "In Chiusura"
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

        # ── by_fy_ts: produzione per timesheet.fy, con BU nested ──
        for fy_ts, bu_map in proj_fy_bu_map.get(p.project_id, {}).items():
            if fy_ts not in by_fy_ts:
                by_fy_ts[fy_ts] = {"fy": fy_ts, "ts_hours": 0.0, "ts_net_revenue": 0.0, "_by_bu": {}}
            for bu, vals in bu_map.items():
                by_fy_ts[fy_ts]["ts_hours"] += vals["hours"]
                by_fy_ts[fy_ts]["ts_net_revenue"] += vals["nr"]
                bu_d = by_fy_ts[fy_ts]["_by_bu"]
                bu_d.setdefault(bu, {"bu": bu, "ts_hours": 0.0, "ts_net_revenue": 0.0})
                bu_d[bu]["ts_hours"] += vals["hours"]
                bu_d[bu]["ts_net_revenue"] += vals["nr"]

        # ── by_bu globale (tutti i FY) ──
        for fy_map in proj_fy_bu_map.get(p.project_id, {}).values():
            for bu, vals in fy_map.items():
                by_bu_total.setdefault(bu, {"bu": bu, "ts_hours": 0.0, "ts_net_revenue": 0.0})
                by_bu_total[bu]["ts_hours"] += vals["hours"]
                by_bu_total[bu]["ts_net_revenue"] += vals["nr"]

        # ── at-risk ──
        monthly = monthly_by_project.get(p.project_id, [])
        rr = calc_run_rate(monthly, "last_month")
        residuo_ore = (float(p.iow_hours_total) - ts_h) if p.iow_hours_total else None
        mesi = calc_mesi_residui(residuo_ore, rr.hours)
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
                "_by_fy": {},   # fy → {ts_h, ts_nr, count, _by_bu}
                "_by_bu": {},   # bu → {ts_h, ts_nr}
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
            c["_by_fy"].setdefault(fy_ts, {
                "fy": fy_ts, "ts_hours": 0.0, "ts_net_revenue": 0.0,
                "project_count": 0, "_by_bu": {},
            })
            c["_by_fy"][fy_ts]["project_count"] += 1
            for bu, vals in bu_map.items():
                c["_by_fy"][fy_ts]["ts_hours"] += vals["hours"]
                c["_by_fy"][fy_ts]["ts_net_revenue"] += vals["nr"]
                c["_by_fy"][fy_ts]["_by_bu"].setdefault(bu, {"bu": bu, "ts_hours": 0.0, "ts_net_revenue": 0.0})
                c["_by_fy"][fy_ts]["_by_bu"][bu]["ts_hours"] += vals["hours"]
                c["_by_fy"][fy_ts]["_by_bu"][bu]["ts_net_revenue"] += vals["nr"]
                c["_by_bu"].setdefault(bu, {"bu": bu, "ts_hours": 0.0, "ts_net_revenue": 0.0})
                c["_by_bu"][bu]["ts_hours"] += vals["hours"]
                c["_by_bu"][bu]["ts_net_revenue"] += vals["nr"]

    at_risk_projects.sort(key=lambda x: x["giorni_residui"] if x["giorni_residui"] is not None else 9999)

    # ── Merge by_fy (fy_closing + timesheet.fy) ──────────────────────────────
    all_fys = sorted((set(by_fy_project) | set(by_fy_ts)) - {0})
    by_fy = []
    for fy_val in all_fys:
        proj_d = by_fy_project.get(fy_val, {})
        ts_d = by_fy_ts.get(fy_val, {})
        fy_ts_nr = ts_d.get("ts_net_revenue", 0.0)
        fy_bu_raw = ts_d.get("_by_bu", {})
        fy_bu = sorted(
            [
                {
                    "bu": b,
                    "ts_hours": round(v["ts_hours"], 1),
                    "ts_net_revenue": round(v["ts_net_revenue"], 2),
                    "pct_of_total": round(v["ts_net_revenue"] / fy_ts_nr * 100, 1) if fy_ts_nr else 0.0,
                }
                for b, v in fy_bu_raw.items()
            ],
            key=lambda x: x["ts_net_revenue"],
            reverse=True,
        )
        by_fy.append({
            "fy": fy_val,
            "project_count": proj_d.get("project_count", 0),
            "open_count": proj_d.get("open_count", 0),
            "closed_count": proj_d.get("closed_count", 0),
            "iow_net_revenue": round(proj_d.get("iow_net_revenue", 0.0), 2),
            "ts_net_revenue": round(ts_d.get("ts_net_revenue", 0.0), 2),
            "ts_hours": round(ts_d.get("ts_hours", 0.0), 1),
            "by_bu": fy_bu,
        })

    # ── by_bu globale ─────────────────────────────────────────────────────────
    by_bu_list = sorted(by_bu_total.values(), key=lambda x: x["ts_net_revenue"], reverse=True)
    for item in by_bu_list:
        item["ts_hours"] = round(item["ts_hours"], 1)
        item["ts_net_revenue"] = round(item["ts_net_revenue"], 2)
        item["pct_of_total"] = round(item["ts_net_revenue"] / total_ts_nr * 100, 1) if total_ts_nr else 0.0

    # ── Finalizza clienti ─────────────────────────────────────────────────────
    clients = []
    for c in by_client.values():
        c_ts_nr = c["ts_net_revenue"]
        pct_consumo_c = round(c_ts_nr / c["iow_net_revenue"] * 100, 1) if c["iow_net_revenue"] else None

        c_by_bu = sorted(c["_by_bu"].values(), key=lambda x: x["ts_net_revenue"], reverse=True)
        for item in c_by_bu:
            item["ts_hours"] = round(item["ts_hours"], 1)
            item["ts_net_revenue"] = round(item["ts_net_revenue"], 2)
            item["pct_of_total"] = round(item["ts_net_revenue"] / c_ts_nr * 100, 1) if c_ts_nr else 0.0

        c_by_fy = []
        for fy_val, fy_d in sorted(c["_by_fy"].items()):
            fy_ts_nr = fy_d["ts_net_revenue"]
            c_fy_bu = sorted(fy_d["_by_bu"].values(), key=lambda x: x["ts_net_revenue"], reverse=True)
            for item in c_fy_bu:
                item["ts_hours"] = round(item["ts_hours"], 1)
                item["ts_net_revenue"] = round(item["ts_net_revenue"], 2)
                item["pct_of_total"] = round(item["ts_net_revenue"] / fy_ts_nr * 100, 1) if fy_ts_nr else 0.0
            c_by_fy.append({
                "fy": fy_val,
                "ts_hours": round(fy_d["ts_hours"], 1),
                "ts_net_revenue": round(fy_ts_nr, 2),
                "project_count": fy_d["project_count"],
                "by_bu": c_fy_bu,
            })

        clients.append({
            "client_name": c["client_name"],
            "client_group": c["client_group"],
            "project_count": c["project_count"],
            "open_count": c["open_count"],
            "closed_count": c["closed_count"],
            "ts_hours": round(c["ts_hours"], 1),
            "ts_net_revenue": round(c_ts_nr, 2),
            "iow_net_revenue": round(c["iow_net_revenue"], 2),
            "residuo_eur": round(c["residuo_eur"], 2),
            "pct_consumo": pct_consumo_c,
            "at_risk_count": c["at_risk_count"],
            "by_fy": c_by_fy,
            "by_bu": c_by_bu,
        })

    clients.sort(key=lambda x: x["ts_net_revenue"], reverse=True)
    pct_consumo_globale = round(total_ts_hours / total_iow_hours * 100, 1) if total_iow_hours else None

    return {
        "fy": current_fy,
        "today": today.isoformat(),
        "totals": {
            "project_count": len(projects),
            "open_count": open_count,
            "closed_count": closed_count,
            "iow_hours_total": round(total_iow_hours, 1),
            "iow_net_revenue_total": round(total_iow_nr, 2),
            "ts_hours_total": round(total_ts_hours, 1),
            "ts_net_revenue_total": round(total_ts_nr, 2),
            "pct_consumo_globale": pct_consumo_globale,
            "residuo_ore_totale": round(total_iow_hours - total_ts_hours, 1),
            "residuo_eur_totale": round(total_iow_nr - total_ts_nr, 2),
        },
        "by_fy": by_fy,
        "by_bu": by_bu_list,
        "clients": clients,
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
    Previsione di chiusura FY al 30 giugno per cliente.
    Calcola run rate settimanale (ultime 4 settimane con dati nel FY),
    NR previsto a fine FY, budget residuo disponibile e semaforo di copertura.
    """
    today = date.today()
    current_fy = fy or _current_fy(today)
    end_date = _fy_end(current_fy)
    days_remaining = max(0, (end_date - today).days)
    weeks_remaining = round(days_remaining / 7, 2)

    projects = db.query(FactProject).filter(FactProject.is_stale == 0).all()

    # ── Totale TS per progetto (all-time, per residuo) ────────────────────────
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

    # ── Totale TS nel FY corrente per progetto ────────────────────────────────
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

    # ── Dati settimanali FY corrente per run rate ─────────────────────────────
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
    # {project_id → [(week_id, nr), ...] ordinati dal più recente}
    weekly_by_proj: dict[str, list[tuple[str, float, float]]] = {}
    for r in ts_weekly_rows:
        weekly_by_proj.setdefault(r.project_id, []).append(
            (r.week_id, float(r.nr or 0), float(r.hours or 0))
        )
    for pid in weekly_by_proj:
        weekly_by_proj[pid].sort(key=lambda x: x[0], reverse=True)

    # ── BU mix per progetto (FY corrente) per allocazione forecast ────────────
    ts_fy_bu_rows = (
        db.query(
            FactTimesheet.project_id,
            func.coalesce(DimCostCenter.bu, "—").label("bu"),
            func.sum(FactTimesheet.net_revenue_actual).label("nr"),
        )
        .outerjoin(DimCostCenter, FactTimesheet.resource_cost_center == DimCostCenter.cc_code)
        .filter(FactTimesheet.is_stale == 0, FactTimesheet.fy == current_fy)
        .group_by(FactTimesheet.project_id, DimCostCenter.bu)
        .all()
    )
    # {project_id → {bu → pct}}
    bu_mix_by_proj: dict[str, dict[str, float]] = {}
    for r in ts_fy_bu_rows:
        bu_mix_by_proj.setdefault(r.project_id, {})[r.bu] = float(r.nr or 0)
    for pid, bus in bu_mix_by_proj.items():
        total = sum(bus.values())
        if total:
            bu_mix_by_proj[pid] = {bu: nr / total for bu, nr in bus.items()}

    # ── Aggrega per cliente ───────────────────────────────────────────────────
    by_client: dict[str, dict[str, Any]] = {}

    for p in projects:
        client = p.client
        cn = client.client_name if client else "—"
        cg = client.client_group if client else None

        ts_all = ts_total_map.get(p.project_id, {"nr": 0.0, "hours": 0.0})
        ts_fy = ts_fy_map.get(p.project_id, {"nr": 0.0, "hours": 0.0})
        iow_nr = float(p.iow_net_revenue or 0)
        iow_hours = float(p.iow_hours_total or 0)

        # Residuo NR (IOW NR - NR consumato all-time)
        residuo_nr = (iow_nr - ts_all["nr"]) if iow_nr else 0.0
        # Residuo ore (IOW hours - ore consumate all-time) — None se dati File9 assenti
        residuo_ore = (iow_hours - ts_all["hours"]) if iow_hours else None

        # Run rate settimanale: media ultime 4 settimane del FY corrente
        weekly = weekly_by_proj.get(p.project_id, [])
        last4 = weekly[:4]
        rr_nr = sum(w[1] for w in last4) / len(last4) if last4 else 0.0
        rr_hours = sum(w[2] for w in last4) / len(last4) if last4 else 0.0

        bu_mix = bu_mix_by_proj.get(p.project_id, {})

        if cn not in by_client:
            by_client[cn] = {
                "client_name": cn,
                "client_group": cg,
                "ts_nr_ytd": 0.0,
                "ts_hours_ytd": 0.0,
                "run_rate_weekly_nr": 0.0,
                "run_rate_weekly_hours": 0.0,
                "available_budget_nr": 0.0,
                "available_budget_hours": 0.0,   # solo da progetti con dati IOW ore
                "_has_hours_data": False,
                "_bu_weighted": {},
            }
        c = by_client[cn]
        c["ts_nr_ytd"] += ts_fy["nr"]
        c["ts_hours_ytd"] += ts_fy["hours"]
        c["run_rate_weekly_nr"] += rr_nr
        c["run_rate_weekly_hours"] += rr_hours
        c["available_budget_nr"] += residuo_nr
        if residuo_ore is not None:
            c["available_budget_hours"] += residuo_ore
            c["_has_hours_data"] = True

        # BU mix pesata per run rate (contribuzione proporzionale al ritmo del progetto)
        for bu, pct in bu_mix.items():
            c["_bu_weighted"].setdefault(bu, 0.0)
            c["_bu_weighted"][bu] += rr_nr * pct

    # ── Calcola previsione e semaforo per ogni cliente ─────────────────────────
    clients_result = []
    total_ts_ytd = 0.0
    total_additional = 0.0
    total_available_nr = 0.0

    INF = float("inf")

    for cn, c in by_client.items():
        rr_nr = c["run_rate_weekly_nr"]
        rr_hours = c["run_rate_weekly_hours"]
        available_nr = c["available_budget_nr"]
        available_hours = c["available_budget_hours"]
        has_hours = c["_has_hours_data"]

        projected_additional = rr_nr * weeks_remaining
        projected_total = c["ts_nr_ytd"] + projected_additional

        # ── Settimane di copertura: il vincolo più restrittivo tra NR e ore ──
        # La logica corretta: quante settimane possiamo lavorare al ritmo attuale?
        weeks_nr = (available_nr / rr_nr) if rr_nr > 0 else INF
        weeks_hours = (available_hours / rr_hours) if (has_hours and rr_hours > 0) else INF
        weeks_coverage = min(weeks_nr, weeks_hours)

        # Tipo di vincolo che esaurisce prima
        if weeks_coverage == INF:
            exhaustion_type = "ok"
        elif weeks_hours <= weeks_nr:
            exhaustion_type = "hours"
        else:
            exhaustion_type = "nr"

        # Data stimata di saturazione (oggi + weeks_coverage × 7 giorni)
        if weeks_coverage < INF and weeks_coverage < weeks_remaining * 3:
            sat_delta = int(weeks_coverage * 7)
            saturation_date = (today + __import__("datetime").timedelta(days=sat_delta)).isoformat()
        else:
            saturation_date = None

        # ── Semaforo ──
        # Soglie: AMBER se il budget copre < 95% del FY rimanente (≥ 3 giorni scoperti)
        if rr_nr == 0:
            status = "grey"
        elif available_nr <= 0 or (has_hours and available_hours <= 0):
            status = "red"
        elif weeks_coverage < weeks_remaining * 0.95:
            # Budget si esaurisce almeno 3-4 giorni prima del 30 giugno
            deficit_weeks = weeks_remaining - weeks_coverage
            status = "red" if deficit_weeks > 2 else "amber"
        else:
            status = "green"

        # Breakdown BU della produzione prevista (usa mix del FY corrente)
        bu_total = sum(c["_bu_weighted"].values())
        by_bu_forecast = [
            {
                "bu": bu,
                "forecasted_nr": round((nr / bu_total) * projected_additional, 2) if bu_total else 0.0,
                "pct_of_forecast": round((nr / bu_total) * 100, 1) if bu_total else 0.0,
            }
            for bu, nr in sorted(c["_bu_weighted"].items(), key=lambda x: x[1], reverse=True)
        ]

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
        })

    clients_result.sort(key=lambda x: x["projected_total_nr"], reverse=True)

    # ── Semaforo globale ──
    global_additional = total_additional
    # Settimane di copertura NR globale (le ore non si sommano significativamente)
    global_weeks = (total_available_nr / (global_additional / weeks_remaining)) if (global_additional > 0 and weeks_remaining > 0) else INF
    if global_additional == 0:
        global_status = "grey"
    elif total_available_nr <= 0:
        global_status = "red"
    elif global_weeks < weeks_remaining * 0.95:
        deficit = weeks_remaining - global_weeks
        global_status = "red" if deficit > 2 else "amber"
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
            "projected_additional_nr": round(global_additional, 2),
            "projected_total_nr": round(total_ts_ytd + global_additional, 2),
            "available_budget": round(total_available_nr, 2),
            "coverage_status": global_status,
        },
        "clients": clients_result,
    }
