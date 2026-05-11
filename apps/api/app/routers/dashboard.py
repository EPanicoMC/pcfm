"""Endpoint dashboard: KPI globali + breakdown interattivo per cliente/FY/BU."""

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


@router.get("")
def dashboard(
    fy: int | None = Query(None, description="FY corrente (default: calcolato da oggi)"),
    db: Session = Depends(get_db),
):
    """KPI globali, breakdown per FY/BU, lista clienti interattiva, codici a rischio."""
    today = date.today()
    current_fy = fy or _current_fy(today)

    # Tutti i progetti non stale
    projects = db.query(FactProject).filter(FactProject.is_stale == 0).all()

    # ── Aggregati timesheet per progetto (totale) ─────────────────────────────
    ts_agg = (
        db.query(
            FactTimesheet.project_id,
            func.sum(FactTimesheet.hours_actual).label("ts_hours"),
            func.sum(FactTimesheet.net_revenue_actual).label("ts_net_revenue"),
        )
        .filter(FactTimesheet.is_stale == 0)
        .group_by(FactTimesheet.project_id)
        .all()
    )
    ts_map = {r.project_id: r for r in ts_agg}

    # ── Aggregati timesheet per progetto + FY ────────────────────────────────
    ts_by_proj_fy = (
        db.query(
            FactTimesheet.project_id,
            FactTimesheet.fy,
            func.sum(FactTimesheet.hours_actual).label("ts_hours"),
            func.sum(FactTimesheet.net_revenue_actual).label("ts_net_revenue"),
        )
        .filter(FactTimesheet.is_stale == 0)
        .group_by(FactTimesheet.project_id, FactTimesheet.fy)
        .all()
    )
    proj_fy_map: dict[str, dict[int, dict[str, float]]] = {}
    for r in ts_by_proj_fy:
        if r.project_id not in proj_fy_map:
            proj_fy_map[r.project_id] = {}
        proj_fy_map[r.project_id][r.fy or 0] = {
            "hours": float(r.ts_hours or 0),
            "nr": float(r.ts_net_revenue or 0),
        }

    # ── Aggregati timesheet per progetto + BU (join dim_cost_center) ─────────
    ts_by_proj_bu = (
        db.query(
            FactTimesheet.project_id,
            func.coalesce(DimCostCenter.bu, "—").label("bu"),
            func.sum(FactTimesheet.hours_actual).label("ts_hours"),
            func.sum(FactTimesheet.net_revenue_actual).label("ts_net_revenue"),
        )
        .outerjoin(DimCostCenter, FactTimesheet.resource_cost_center == DimCostCenter.cc_code)
        .filter(FactTimesheet.is_stale == 0)
        .group_by(FactTimesheet.project_id, DimCostCenter.bu)
        .all()
    )
    proj_bu_map: dict[str, dict[str, dict[str, float]]] = {}
    for r in ts_by_proj_bu:
        if r.project_id not in proj_bu_map:
            proj_bu_map[r.project_id] = {}
        proj_bu_map[r.project_id][r.bu] = {
            "hours": float(r.ts_hours or 0),
            "nr": float(r.ts_net_revenue or 0),
        }

    # ── Aggregati mensili per calcolo run rate (at-risk) ─────────────────────
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
        if row.project_id not in monthly_by_project:
            monthly_by_project[row.project_id] = []
        monthly_by_project[row.project_id].append(
            MonthlyPoint(month_id=row.month_id, hours=row.hours or 0.0, net_revenue=row.net_revenue or 0.0)
        )

    # ── Costruzione risposta ──────────────────────────────────────────────────
    total_iow_hours = 0.0
    total_iow_nr = 0.0
    total_ts_hours = 0.0
    total_ts_nr = 0.0
    open_count = 0
    closed_count = 0

    # Accumulatori globali per breakdown
    by_fy_project: dict[int, dict[str, Any]] = {}   # conteggi per fy_closing
    by_fy_ts: dict[int, dict[str, Any]] = {}         # produzione per timesheet.fy
    by_bu_total: dict[str, dict[str, Any]] = {}      # totale per BU

    at_risk_projects: list[dict] = []
    by_client: dict[str, dict[str, Any]] = {}

    for p in projects:
        ts = ts_map.get(p.project_id)
        ts_h = float(ts.ts_hours or 0) if ts else 0.0
        ts_nr = float(ts.ts_net_revenue or 0) if ts else 0.0
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

        # ── by_fy per fy_closing (conteggi e budget IOW) ──
        fy_c = p.fy_closing or 0
        if fy_c not in by_fy_project:
            by_fy_project[fy_c] = {
                "fy": fy_c, "project_count": 0, "open_count": 0,
                "closed_count": 0, "iow_net_revenue": 0.0,
            }
        by_fy_project[fy_c]["project_count"] += 1
        by_fy_project[fy_c]["iow_net_revenue"] += iow_nr
        by_fy_project[fy_c]["open_count" if not is_closed else "closed_count"] += 1

        # ── by_fy_ts per timesheet.fy (produzione NR effettiva) ──
        for fy_ts, vals in (proj_fy_map.get(p.project_id) or {}).items():
            if fy_ts not in by_fy_ts:
                by_fy_ts[fy_ts] = {"fy": fy_ts, "ts_hours": 0.0, "ts_net_revenue": 0.0}
            by_fy_ts[fy_ts]["ts_hours"] += vals["hours"]
            by_fy_ts[fy_ts]["ts_net_revenue"] += vals["nr"]

        # ── by_bu globale ──
        for bu, vals in (proj_bu_map.get(p.project_id) or {}).items():
            if bu not in by_bu_total:
                by_bu_total[bu] = {"bu": bu, "ts_hours": 0.0, "ts_net_revenue": 0.0}
            by_bu_total[bu]["ts_hours"] += vals["hours"]
            by_bu_total[bu]["ts_net_revenue"] += vals["nr"]

        # ── at-risk detection ──
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

        for fy_ts, vals in (proj_fy_map.get(p.project_id) or {}).items():
            if fy_ts not in c["_by_fy"]:
                c["_by_fy"][fy_ts] = {"fy": fy_ts, "ts_hours": 0.0, "ts_net_revenue": 0.0, "project_count": 0}
            c["_by_fy"][fy_ts]["ts_hours"] += vals["hours"]
            c["_by_fy"][fy_ts]["ts_net_revenue"] += vals["nr"]
            c["_by_fy"][fy_ts]["project_count"] += 1

        for bu, vals in (proj_bu_map.get(p.project_id) or {}).items():
            if bu not in c["_by_bu"]:
                c["_by_bu"][bu] = {"bu": bu, "ts_hours": 0.0, "ts_net_revenue": 0.0}
            c["_by_bu"][bu]["ts_hours"] += vals["hours"]
            c["_by_bu"][bu]["ts_net_revenue"] += vals["nr"]

    at_risk_projects.sort(key=lambda x: x["giorni_residui"] if x["giorni_residui"] is not None else 9999)

    # ── Merge by_fy: unisce fy_closing (budget/count) + timesheet.fy (produzione) ──
    all_fys = sorted((set(by_fy_project) | set(by_fy_ts)) - {0})
    by_fy = []
    for fy_val in all_fys:
        proj_d = by_fy_project.get(fy_val, {})
        ts_d = by_fy_ts.get(fy_val, {})
        by_fy.append({
            "fy": fy_val,
            "project_count": proj_d.get("project_count", 0),
            "open_count": proj_d.get("open_count", 0),
            "closed_count": proj_d.get("closed_count", 0),
            "iow_net_revenue": round(proj_d.get("iow_net_revenue", 0.0), 2),
            "ts_net_revenue": round(ts_d.get("ts_net_revenue", 0.0), 2),
            "ts_hours": round(ts_d.get("ts_hours", 0.0), 1),
        })

    # ── by_bu globale, ordinato per NR ──
    by_bu_list = sorted(by_bu_total.values(), key=lambda x: x["ts_net_revenue"], reverse=True)
    for item in by_bu_list:
        item["ts_hours"] = round(item["ts_hours"], 1)
        item["ts_net_revenue"] = round(item["ts_net_revenue"], 2)
        item["pct_of_total"] = round(item["ts_net_revenue"] / total_ts_nr * 100, 1) if total_ts_nr else 0.0

    # ── Finalizza clienti ──
    clients = []
    for c in by_client.values():
        c_ts_nr = c["ts_net_revenue"]

        c_by_fy = sorted(c["_by_fy"].values(), key=lambda x: x["fy"])
        for item in c_by_fy:
            item["ts_hours"] = round(item["ts_hours"], 1)
            item["ts_net_revenue"] = round(item["ts_net_revenue"], 2)

        c_by_bu = sorted(c["_by_bu"].values(), key=lambda x: x["ts_net_revenue"], reverse=True)
        for item in c_by_bu:
            item["ts_hours"] = round(item["ts_hours"], 1)
            item["ts_net_revenue"] = round(item["ts_net_revenue"], 2)
            item["pct_of_total"] = round(item["ts_net_revenue"] / c_ts_nr * 100, 1) if c_ts_nr else 0.0

        pct_consumo_c = round(c_ts_nr / c["iow_net_revenue"] * 100, 1) if c["iow_net_revenue"] else None

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
