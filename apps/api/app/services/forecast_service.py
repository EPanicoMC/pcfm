"""Calcolo forecast per un singolo progetto: legge dal DB, delega la logica al domain.

Regola fondamentale: il NETTO è la metrica primaria. Le ore sono secondarie.
Il mese corrente è escluso dal run rate (dati parziali → distorce il calcolo).
"""

from __future__ import annotations

from datetime import date
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

from ..models.dimensions import DimResource
from ..models.facts import FactProject, FactTimesheet, ForecastOverride


def get_project_forecast(
    db: Session,
    project_id: str,
    window: str = "last_month",
    fy_override: int | None = None,
) -> dict[str, Any]:
    p = db.get(FactProject, project_id)
    if p is None:
        return {"error": f"Progetto {project_id} non trovato"}

    today = date.today()
    current_mid = f"{today.year}-{today.month:02d}"

    ts_rows = (
        db.query(FactTimesheet)
        .filter(FactTimesheet.project_id == project_id, FactTimesheet.is_stale == 0)
        .all()
    )

    # ── Aggregazione mensile ──────────────────────────────────────────────────
    monthly: dict[str, MonthlyPoint] = {}
    # Aggregazione per risorsa: ore + NR + gross_revenue per blended rate
    by_resource: dict[str, dict[str, Any]] = {}

    for ts in ts_rows:
        mid = ts.week_id[:7] if ts.week_id else None
        if not mid:
            continue

        # Mensile
        if mid not in monthly:
            monthly[mid] = MonthlyPoint(month_id=mid, hours=0.0, net_revenue=0.0)
        monthly[mid].hours += ts.hours_actual or 0.0
        monthly[mid].net_revenue += ts.net_revenue_actual or 0.0

        # Per risorsa
        rid = ts.resource_id
        if rid not in by_resource:
            dim_r = db.get(DimResource, rid)
            by_resource[rid] = {
                "resource_id": rid,
                "resource_name": (dim_r.resource_name if dim_r else None) or rid,
                "job_title": ts.job_title,
                "hours": 0.0,
                "net_revenue": 0.0,
                "gross_revenue": 0.0,
            }
        by_resource[rid]["hours"] += ts.hours_actual or 0.0
        by_resource[rid]["net_revenue"] += ts.net_revenue_actual or 0.0
        by_resource[rid]["gross_revenue"] += ts.gross_revenue or 0.0
        # Aggiorna job_title con il più recente disponibile
        if ts.job_title and not by_resource[rid]["job_title"]:
            by_resource[rid]["job_title"] = ts.job_title

    monthly_list = sorted(monthly.values(), key=lambda x: x.month_id)

    # Totali (incluso mese corrente parziale — è dato reale)
    ts_hours_total = sum(m.hours for m in monthly_list)
    ts_nr_total = sum(m.net_revenue for m in monthly_list)

    # ── Run rate: SOLO mesi completi (esclude mese corrente parziale) ─────────
    complete_months = [m for m in monthly_list if m.month_id < current_mid]
    run_rate = calc_run_rate(complete_months, window=window)

    # ── Residuo (metrica primaria: EUR) ───────────────────────────────────────
    iow_hours = float(p.iow_hours_total) if p.iow_hours_total else None
    iow_nr = float(p.iow_net_revenue) if p.iow_net_revenue else None
    residuo_ore, residuo_eur = calc_residuo(iow_hours, ts_hours_total, iow_nr, ts_nr_total)

    pct_consumo_nr = round(ts_nr_total / iow_nr * 100, 1) if iow_nr else None
    pct_consumo_ore = round(ts_hours_total / iow_hours * 100, 1) if iow_hours else None

    # ── Data esaurimento (basata su NR residuo / run rate NR) ────────────────
    mesi_residui_nr = calc_mesi_residui(residuo_eur, run_rate.net_revenue)
    mesi_residui_ore = calc_mesi_residui(residuo_ore, run_rate.hours)
    data_esaurimento = calc_data_esaurimento(today, mesi_residui_nr)

    # ── Scenari (solo mesi completi) ──────────────────────────────────────────
    scenari_nr = calc_scenari_nr(complete_months)
    scenari_ore = calc_scenari(complete_months)

    # ── Forecast FY ───────────────────────────────────────────────────────────
    fy = fy_override or (p.fy_closing or _current_fy(today))
    fy_months = fy_month_ids(fy)

    # YTD = tutti i mesi del FY con dati (incluso mese parziale corrente)
    actual_ytd_nr = sum(
        m.net_revenue for m in monthly_list if m.month_id in set(fy_months)
    )
    actual_ytd_hours = sum(
        m.hours for m in monthly_list if m.month_id in set(fy_months)
    )

    # Mesi futuri del FY = dal prossimo mese in poi (il corrente è già conteggiato in YTD)
    next_mid = _next_month(current_mid)
    future_mids = [m for m in fy_months if m >= next_mid]

    override_rows = (
        db.query(ForecastOverride)
        .filter(ForecastOverride.project_id == project_id)
        .all()
    )
    overrides_nr = {
        o.month_id: float(o.override_net_revenue)
        for o in override_rows if o.override_net_revenue is not None
    }

    forecast_fy_nr = calc_forecast_fy(actual_ytd_nr, run_rate.net_revenue, future_mids, overrides_nr)
    at_risk = is_at_risk(data_esaurimento, today, p.project_status)

    # ── Breakdown risorse ─────────────────────────────────────────────────────
    resource_list = []
    for r in sorted(by_resource.values(), key=lambda x: x["net_revenue"], reverse=True):
        h = r["hours"]
        nr = r["net_revenue"]
        resource_list.append({
            "resource_id": r["resource_id"],
            "resource_name": r["resource_name"],
            "job_title": r["job_title"],
            "hours": round(h, 1),
            "net_revenue": round(nr, 2),
            "gross_revenue": round(r["gross_revenue"], 2),
            "blended_net_rate": round(nr / h, 2) if h else None,
            "pct_nr": round(nr / ts_nr_total * 100, 1) if ts_nr_total else None,
        })

    # ── Mesi futuri con proiezione ────────────────────────────────────────────
    future_detail = []
    for mid in future_mids:
        ov = overrides_nr.get(mid)
        future_detail.append({
            "month_id": mid,
            "projected_nr": round(ov, 2) if ov is not None else (round(run_rate.net_revenue, 2) if run_rate.net_revenue else None),
            "is_override": ov is not None,
        })

    return {
        "project_id": project_id,
        "project_title": p.project_title,
        "project_status": p.project_status,
        "client_name": p.client.client_name if p.client else None,
        "client_group": p.client.client_group if p.client else None,
        "engagement_manager": p.engagement_manager,
        "fy": fy,
        # Totali
        "ts_hours_total": round(ts_hours_total, 1),
        "ts_net_revenue_total": round(ts_nr_total, 2),
        "iow_hours_total": iow_hours,
        "iow_net_revenue": iow_nr,
        "iow_contract_value": float(p.iow_contract_value) if p.iow_contract_value else None,
        # Consumo (NR primario)
        "pct_consumo_nr": pct_consumo_nr,
        "pct_consumo_ore": pct_consumo_ore,
        # Residuo
        "residuo_ore": round(residuo_ore, 1) if residuo_ore is not None else None,
        "residuo_eur": round(residuo_eur, 2) if residuo_eur is not None else None,
        # Run rate (da mesi completi, mese corrente escluso)
        "run_rate": {
            "hours": run_rate.hours,
            "net_revenue": run_rate.net_revenue,
            "window": run_rate.window,
            "months_used": run_rate.months_used,
            "complete_months_available": len(complete_months),
        },
        # Proiezione temporale (basata su NR)
        "mesi_residui_nr": round(mesi_residui_nr, 1) if mesi_residui_nr is not None else None,
        "mesi_residui_ore": round(mesi_residui_ore, 1) if mesi_residui_ore is not None else None,
        "data_esaurimento": data_esaurimento.isoformat() if data_esaurimento else None,
        "at_risk": at_risk,
        # Scenari
        "scenari_nr": scenari_nr,
        "scenari_ore": scenari_ore,
        # Forecast FY
        "forecast_fy_net_revenue": forecast_fy_nr,
        "actual_ytd_net_revenue": round(actual_ytd_nr, 2),
        "actual_ytd_hours": round(actual_ytd_hours, 1),
        "future_months_detail": future_detail,
        # Override
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
        # Storico mensile (incluso mese corrente parziale)
        "monthly_actuals": [
            {
                "month_id": m.month_id,
                "hours": round(m.hours, 1),
                "net_revenue": round(m.net_revenue, 2),
                "is_partial": m.month_id == current_mid,
            }
            for m in monthly_list
        ],
        # Breakdown per risorsa
        "resources": resource_list,
    }


def calc_scenari_nr(monthly_data: list[MonthlyPoint]) -> dict[str, float | None]:
    """Percentili 25/50/75 del net revenue mensile."""
    import math
    if not monthly_data:
        return {"low": None, "base": None, "high": None}
    vals = sorted(m.net_revenue for m in monthly_data)

    def _pct(data: list[float], p: float) -> float:
        idx = p / 100 * (len(data) - 1)
        lo, hi = int(idx), math.ceil(idx)
        if lo == hi:
            return data[lo]
        return data[lo] + (data[hi] - data[lo]) * (idx - lo)

    return {
        "low": round(_pct(vals, 25), 2),
        "base": round(_pct(vals, 50), 2),
        "high": round(_pct(vals, 75), 2),
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
    return today.year + 1 if today.month >= fy_start_month else today.year


def _next_month(month_id: str) -> str:
    """"2026-05" → "2026-06", "2026-12" → "2027-01"."""
    y, m = int(month_id[:4]), int(month_id[5:7])
    m += 1
    if m > 12:
        m, y = 1, y + 1
    return f"{y}-{m:02d}"
