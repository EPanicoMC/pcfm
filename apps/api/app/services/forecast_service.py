"""Calcolo forecast per un singolo progetto: legge dal DB, delega la logica al domain."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from domain.forecast import (
    MonthlyPoint,
    calc_data_esaurimento,
    calc_forecast_fy,
    calc_mesi_residui,
    calc_residuo,
    calc_run_rate,
    calc_scenari,
    fy_month_ids,
    is_at_risk,
)

from ..models.facts import FactProject, FactTimesheet, ForecastOverride


def get_project_forecast(
    db: Session,
    project_id: str,
    window: str = "last_month",
    fy_override: int | None = None,
) -> dict[str, Any]:
    """Calcola e restituisce il forecast completo per un progetto."""
    p = db.get(FactProject, project_id)
    if p is None:
        return {"error": f"Progetto {project_id} non trovato"}

    # Aggrega timesheet per mese (solo righe non stale)
    ts_rows = (
        db.query(FactTimesheet)
        .filter(FactTimesheet.project_id == project_id, FactTimesheet.is_stale == 0)
        .all()
    )

    monthly: dict[str, MonthlyPoint] = {}
    for ts in ts_rows:
        mid = ts.week_id[:7] if ts.week_id else None
        if not mid:
            continue
        if mid not in monthly:
            monthly[mid] = MonthlyPoint(month_id=mid, hours=0.0, net_revenue=0.0)
        monthly[mid].hours += ts.hours_actual or 0.0
        monthly[mid].net_revenue += ts.net_revenue_actual or 0.0

    monthly_list = sorted(monthly.values(), key=lambda x: x.month_id)

    # Totali timesheet
    ts_hours_total = sum(m.hours for m in monthly_list)
    ts_nr_total = sum(m.net_revenue for m in monthly_list)

    # Run rate
    run_rate = calc_run_rate(monthly_list, window=window)

    # Residuo
    residuo_ore, residuo_eur = calc_residuo(
        iow_hours_total=float(p.iow_hours_total) if p.iow_hours_total else None,
        ts_hours=ts_hours_total,
        iow_net_revenue=float(p.iow_net_revenue) if p.iow_net_revenue else None,
        ts_net_revenue=ts_nr_total,
    )

    # Mesi residui e data esaurimento
    today = date.today()
    mesi_residui = calc_mesi_residui(residuo_ore, run_rate.hours)
    data_esaurimento = calc_data_esaurimento(today, mesi_residui)

    # Scenari low/base/high
    scenari = calc_scenari(monthly_list)

    # Forecast FY
    fy = fy_override or (p.fy_closing or _current_fy(today))
    fy_months = fy_month_ids(fy)
    current_mid = f"{today.year}-{today.month:02d}"

    # YTD = mesi del FY con dati effettivi (prima del mese corrente)
    actual_ytd = sum(
        m.net_revenue
        for m in monthly_list
        if m.month_id in fy_months and m.month_id < current_mid
    )

    # Mesi futuri del FY = dal mese corrente alla fine
    future_mids = [m for m in fy_months if m >= current_mid]

    # Override per questo progetto
    override_rows = (
        db.query(ForecastOverride)
        .filter(ForecastOverride.project_id == project_id)
        .all()
    )
    overrides_nr = {o.month_id: float(o.override_net_revenue) for o in override_rows if o.override_net_revenue is not None}

    forecast_fy = calc_forecast_fy(actual_ytd, run_rate.net_revenue, future_mids, overrides_nr)
    at_risk = is_at_risk(data_esaurimento, today, p.project_status)

    return {
        "project_id": project_id,
        "project_title": p.project_title,
        "project_status": p.project_status,
        "fy": fy,
        "ts_hours_total": round(ts_hours_total, 2),
        "ts_net_revenue_total": round(ts_nr_total, 2),
        "iow_hours_total": float(p.iow_hours_total) if p.iow_hours_total else None,
        "iow_net_revenue": float(p.iow_net_revenue) if p.iow_net_revenue else None,
        "run_rate": {
            "hours": run_rate.hours,
            "net_revenue": run_rate.net_revenue,
            "window": run_rate.window,
            "months_used": run_rate.months_used,
        },
        "residuo_ore": residuo_ore,
        "residuo_eur": residuo_eur,
        "mesi_residui": round(mesi_residui, 2) if mesi_residui is not None else None,
        "data_esaurimento": data_esaurimento.isoformat() if data_esaurimento else None,
        "at_risk": at_risk,
        "scenari": scenari,
        "forecast_fy_net_revenue": forecast_fy,
        "actual_ytd_net_revenue": round(actual_ytd, 2),
        "future_months": future_mids,
        "overrides": [
            {
                "override_id": o.override_id,
                "month_id": o.month_id,
                "override_hours": o.override_hours,
                "override_net_revenue": o.override_net_revenue,
                "note": o.note,
            }
            for o in override_rows
        ],
        "monthly_actuals": [
            {"month_id": m.month_id, "hours": round(m.hours, 2), "net_revenue": round(m.net_revenue, 2)}
            for m in monthly_list
        ],
    }


def upsert_forecast_override(
    db: Session,
    project_id: str,
    month_id: str,
    override_hours: float | None,
    override_net_revenue: float | None,
    note: str | None,
) -> dict[str, Any]:
    existing = (
        db.query(ForecastOverride)
        .filter(ForecastOverride.project_id == project_id, ForecastOverride.month_id == month_id)
        .first()
    )
    if existing:
        existing.override_hours = override_hours
        existing.override_net_revenue = override_net_revenue
        existing.note = note
    else:
        existing = ForecastOverride(
            project_id=project_id,
            month_id=month_id,
            override_hours=override_hours,
            override_net_revenue=override_net_revenue,
            note=note,
        )
        db.add(existing)
    db.commit()
    db.refresh(existing)
    return {
        "override_id": existing.override_id,
        "project_id": project_id,
        "month_id": month_id,
        "override_hours": existing.override_hours,
        "override_net_revenue": existing.override_net_revenue,
        "note": existing.note,
    }


def delete_forecast_override(db: Session, project_id: str, month_id: str) -> bool:
    row = (
        db.query(ForecastOverride)
        .filter(ForecastOverride.project_id == project_id, ForecastOverride.month_id == month_id)
        .first()
    )
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def _current_fy(today: date, fy_start_month: int = 7) -> int:
    """FY corrente: se siamo a luglio o oltre, FY = anno + 1."""
    return today.year + 1 if today.month >= fy_start_month else today.year
