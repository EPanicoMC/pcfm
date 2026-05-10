"""Router per i codici progetto e i loro KPI calcolati."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.dimensions import DimClient
from ..models.facts import FactProject, FactTimesheet
from ..services.detail_service import get_project_detail

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("")
def list_projects(
    db: Session = Depends(get_db),
    include_stale: bool = Query(False, description="Includi record is_stale=1"),
    include_closed: bool = Query(True, description="Includi progetti In Chiusura"),
    status: str | None = Query(None, description="Filtra per project_status esatto"),
    client_name: str | None = Query(None),
    fy: int | None = Query(None, description="Filtra per FY chiusura progetto"),
):
    """Lista progetti con KPI calcolati: % consumo, residuo ore/EUR."""
    q = db.query(FactProject)

    if not include_stale:
        q = q.filter(FactProject.is_stale == 0)
    if not include_closed:
        q = q.filter(FactProject.project_status != "In Chiusura")
    if status:
        q = q.filter(FactProject.project_status == status)
    if fy:
        q = q.filter(FactProject.fy_closing == fy)
    if client_name:
        q = q.join(DimClient).filter(DimClient.client_name.ilike(f"%{client_name}%"))

    projects = q.order_by(FactProject.project_id).all()

    # Aggrega ore timesheet per progetto (esclusi stale)
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

    return [_enrich(p, ts_map.get(p.project_id), db) for p in projects]


@router.get("/{project_id}/detail")
def project_detail_view(project_id: str, db: Session = Depends(get_db)):
    """Vista dettaglio: KPI finanziari, BU/CC breakdown, caricamenti settimanali, forecast."""
    result = get_project_detail(db, project_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    """Dettaglio progetto con timesheet mensili aggregati."""
    p = db.get(FactProject, project_id)
    if p is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Progetto {project_id} non trovato")

    ts_rows = (
        db.query(FactTimesheet)
        .filter(FactTimesheet.project_id == project_id, FactTimesheet.is_stale == 0)
        .order_by(FactTimesheet.week_id)
        .all()
    )

    # Aggrega per mese
    monthly: dict[str, dict[str, Any]] = {}
    for ts in ts_rows:
        from ..models.dimensions import DimWeek
        week = db.get(DimWeek, ts.week_id)
        mid = week.month_id if week else ts.week_id[:7]
        if mid not in monthly:
            monthly[mid] = {"month_id": mid, "hours": 0.0, "net_revenue": 0.0, "resources": set()}
        monthly[mid]["hours"] += ts.hours_actual or 0.0
        monthly[mid]["net_revenue"] += ts.net_revenue_actual or 0.0
        monthly[mid]["resources"].add(ts.resource_id)

    monthly_list = [
        {
            "month_id": v["month_id"],
            "hours": round(v["hours"], 2),
            "net_revenue": round(v["net_revenue"], 2),
            "resource_count": len(v["resources"]),
        }
        for v in sorted(monthly.values(), key=lambda x: x["month_id"])
    ]

    ts_total_hours = sum(v["hours"] for v in monthly.values())
    ts_total_nr = sum(v["net_revenue"] for v in monthly.values())

    result = _project_base(p)
    result["monthly_timesheet"] = monthly_list
    result["ts_total_hours"] = round(ts_total_hours, 2)
    result["ts_total_net_revenue"] = round(ts_total_nr, 2)
    return result


def _enrich(p: FactProject, ts: Any, db: Session) -> dict[str, Any]:
    base = _project_base(p)

    ts_hours = float(ts.ts_hours or 0) if ts else 0.0
    ts_nr = float(ts.ts_net_revenue or 0) if ts else 0.0

    iow_h = p.iow_hours_total or 0.0
    iow_nr = p.iow_net_revenue or 0.0

    pct_consumo = round(ts_hours / iow_h * 100, 2) if iow_h else None
    residuo_ore = round(iow_h - ts_hours, 2) if iow_h else None
    residuo_eur = round(iow_nr - ts_nr, 2) if iow_nr else None

    base.update({
        "ts_hours": round(ts_hours, 2),
        "ts_net_revenue": round(ts_nr, 2),
        "pct_consumo": pct_consumo,
        "residuo_ore": residuo_ore,
        "residuo_eur": residuo_eur,
    })
    return base


def _project_base(p: FactProject) -> dict[str, Any]:
    client = p.client
    return {
        "project_id": p.project_id,
        "project_title": p.project_title,
        "client_name": client.client_name if client else None,
        "client_group": client.client_group if client else None,
        "project_status": p.project_status,
        "engagement_manager": p.engagement_manager,
        "engagement_partner": p.engagement_partner,
        "iow_hours_total": p.iow_hours_total,
        "iow_net_revenue": p.iow_net_revenue,
        "iow_contract_value": p.iow_contract_value,
        "hours_actual": p.hours_actual,
        "net_revenue_act": p.net_revenue_act,
        "bi_real_pct_todo": p.bi_real_pct_todo,
        "wip_provision": p.wip_provision,
        "margin_pct": p.margin_pct,
        "fy_closing": p.fy_closing,
        "is_stale": p.is_stale,
        "product_code": p.product_code,
        "legal_entity": p.legal_entity,
    }
