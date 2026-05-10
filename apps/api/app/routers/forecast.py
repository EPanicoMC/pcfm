"""Endpoint forecast e override mensili per singolo progetto."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.forecast_service import (
    delete_forecast_override,
    get_project_forecast,
    upsert_forecast_override,
)

router = APIRouter(prefix="/api/projects", tags=["forecast"])


@router.get("/{project_id}/forecast")
def project_forecast(
    project_id: str,
    window: str = Query("last_month", description="last_month | last_3_months | weighted"),
    fy: int | None = Query(None, description="FY da proiettare (default: FY del progetto)"),
    db: Session = Depends(get_db),
):
    """Forecast completo per un progetto: run rate, residuo, data esaurimento, scenari, forecast FY."""
    try:
        result = get_project_forecast(db, project_id, window=window, fy_override=fy)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


class OverrideBody(BaseModel):
    override_hours: float | None = None
    override_net_revenue: float | None = None
    note: str | None = None


@router.put("/{project_id}/forecast/override/{month_id}")
def set_override(
    project_id: str,
    month_id: str,
    body: OverrideBody,
    db: Session = Depends(get_db),
):
    """Imposta o aggiorna un override mensile per il forecast (formato month_id: YYYY-MM)."""
    return upsert_forecast_override(
        db,
        project_id=project_id,
        month_id=month_id,
        override_hours=body.override_hours,
        override_net_revenue=body.override_net_revenue,
        note=body.note,
    )


@router.delete("/{project_id}/forecast/override/{month_id}", status_code=204)
def remove_override(
    project_id: str,
    month_id: str,
    db: Session = Depends(get_db),
):
    """Rimuove un override mensile."""
    deleted = delete_forecast_override(db, project_id, month_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Override {project_id}/{month_id} non trovato")
