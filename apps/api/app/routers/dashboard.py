"""Endpoint dashboard: KPI globali FY corrente."""

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.dimensions import DimClient
from ..models.facts import FactProject, FactTimesheet
from domain.forecast import calc_data_esaurimento, calc_mesi_residui, calc_run_rate, fy_month_ids, is_at_risk, MonthlyPoint

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _current_fy(today: date, fy_start_month: int = 7) -> int:
    return today.year + 1 if today.month >= fy_start_month else today.year


@router.get("")
def dashboard(
    fy: int | None = Query(None, description="FY da analizzare (default: FY corrente)"),
    db: Session = Depends(get_db),
):
    """KPI globali: totali ore/EUR, top risk, breakdown per cliente, progetti attivi."""
    today = date.today()
    current_fy = fy or _current_fy(today)

    # Tutti i progetti attivi (non stale)
    projects = db.query(FactProject).filter(FactProject.is_stale == 0).all()

    # Aggregato timesheet (non stale)
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

    # Aggregato mensile per tutti i progetti (per run rate aggregato)
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

    # Aggregato per progetto → mesi
    monthly_by_project: dict[str, list[MonthlyPoint]] = {}
    for row in ts_monthly:
        if row.project_id not in monthly_by_project:
            monthly_by_project[row.project_id] = []
        monthly_by_project[row.project_id].append(
            MonthlyPoint(month_id=row.month_id, hours=row.hours or 0.0, net_revenue=row.net_revenue or 0.0)
        )

    # KPI per progetto
    at_risk_projects = []
    total_iow_hours = 0.0
    total_iow_nr = 0.0
    total_ts_hours = 0.0
    total_ts_nr = 0.0

    by_client: dict[str, dict[str, Any]] = {}
    fy_months_set = set(fy_month_ids(current_fy))

    for p in projects:
        ts = ts_map.get(p.project_id)
        ts_h = float(ts.ts_hours or 0) if ts else 0.0
        ts_nr = float(ts.ts_net_revenue or 0) if ts else 0.0

        total_iow_hours += float(p.iow_hours_total or 0)
        total_iow_nr += float(p.iow_net_revenue or 0)
        total_ts_hours += ts_h
        total_ts_nr += ts_nr

        # Run rate e data esaurimento per segnalazione rischio
        monthly = monthly_by_project.get(p.project_id, [])
        rr = calc_run_rate(monthly, "last_month")
        residuo_ore = (float(p.iow_hours_total) - ts_h) if p.iow_hours_total else None
        mesi = calc_mesi_residui(residuo_ore, rr.hours)
        data_esaur = calc_data_esaurimento(today, mesi)

        if is_at_risk(data_esaur, today, p.project_status):
            at_risk_projects.append({
                "project_id": p.project_id,
                "project_title": p.project_title,
                "project_status": p.project_status,
                "data_esaurimento": data_esaur.isoformat() if data_esaur else None,
                "giorni_residui": (data_esaur - today).days if data_esaur else None,
                "residuo_ore": round(residuo_ore, 1) if residuo_ore is not None else None,
            })

        # Breakdown per cliente
        client = p.client
        client_name = client.client_name if client else "—"
        if client_name not in by_client:
            by_client[client_name] = {"client_name": client_name, "ts_hours": 0.0, "ts_net_revenue": 0.0, "project_count": 0}
        by_client[client_name]["ts_hours"] += ts_h
        by_client[client_name]["ts_net_revenue"] += ts_nr
        by_client[client_name]["project_count"] += 1

    at_risk_projects.sort(key=lambda x: x["giorni_residui"] if x["giorni_residui"] is not None else 9999)

    top_clients = sorted(by_client.values(), key=lambda x: x["ts_net_revenue"], reverse=True)[:10]
    for c in top_clients:
        c["ts_hours"] = round(c["ts_hours"], 1)
        c["ts_net_revenue"] = round(c["ts_net_revenue"], 2)

    pct_consumo_globale = round(total_ts_hours / total_iow_hours * 100, 1) if total_iow_hours else None

    return {
        "fy": current_fy,
        "today": today.isoformat(),
        "totals": {
            "project_count": len(projects),
            "iow_hours_total": round(total_iow_hours, 1),
            "iow_net_revenue_total": round(total_iow_nr, 2),
            "ts_hours_total": round(total_ts_hours, 1),
            "ts_net_revenue_total": round(total_ts_nr, 2),
            "pct_consumo_globale": pct_consumo_globale,
            "residuo_ore_totale": round(total_iow_hours - total_ts_hours, 1),
            "residuo_eur_totale": round(total_iow_nr - total_ts_nr, 2),
        },
        "at_risk_count": len(at_risk_projects),
        "at_risk_projects": at_risk_projects,
        "top_clients_by_revenue": top_clients,
    }
