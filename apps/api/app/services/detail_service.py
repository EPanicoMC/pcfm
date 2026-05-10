"""Vista di dettaglio per un singolo codice progetto.

Espone: KPI finanziari, breakdown BU>CC, caricamenti settimanali, previsione
saturazione basata sull'ultima settimana con dati reali (NR > 0).
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy.orm import Session

from ..models.dimensions import DimCostCenter, DimWeek
from ..models.facts import FactProject, FactTimesheet


def get_project_detail(db: Session, project_id: str) -> dict[str, Any]:
    p = db.get(FactProject, project_id)
    if p is None:
        return {"error": f"Progetto {project_id} non trovato"}

    ts_rows = (
        db.query(FactTimesheet)
        .filter(FactTimesheet.project_id == project_id, FactTimesheet.is_stale == 0)
        .all()
    )

    # ── Aggregazione settimanale ───────────────────────────────────────────────
    weekly: dict[str, dict] = {}
    cc_agg: dict[str, dict] = {}

    for ts in ts_rows:
        wid = ts.week_id
        if not wid:
            continue

        # Settimane
        if wid not in weekly:
            dim_w = db.get(DimWeek, wid)
            weekly[wid] = {
                "week_id": wid,
                "week_end": dim_w.week_end.isoformat() if (dim_w and dim_w.week_end) else None,
                "hours": 0.0,
                "net_revenue": 0.0,
                "gross_revenue": 0.0,
                "discount": 0.0,
                "resources": set(),
                "cc_set": set(),
            }
        weekly[wid]["hours"] += ts.hours_actual or 0.0
        weekly[wid]["net_revenue"] += ts.net_revenue_actual or 0.0
        weekly[wid]["gross_revenue"] += ts.gross_revenue or 0.0
        weekly[wid]["discount"] += ts.discount or 0.0
        weekly[wid]["resources"].add(ts.resource_id)
        if ts.resource_cost_center:
            weekly[wid]["cc_set"].add(ts.resource_cost_center)

        # Breakdown CC
        cc_code = ts.resource_cost_center or "__ND__"
        if cc_code not in cc_agg:
            dim_cc = db.get(DimCostCenter, cc_code) if cc_code != "__ND__" else None
            cc_agg[cc_code] = {
                "cc_code": cc_code if cc_code != "__ND__" else "N/D",
                "cc_name": (dim_cc.cc_name if dim_cc else None) or cc_code,
                "bu": (dim_cc.bu if dim_cc else None) or "N/D",
                "ou": (dim_cc.ou if dim_cc else None),
                "hours": 0.0,
                "net_revenue": 0.0,
            }
        cc_agg[cc_code]["hours"] += ts.hours_actual or 0.0
        cc_agg[cc_code]["net_revenue"] += ts.net_revenue_actual or 0.0

    # ── Totali ─────────────────────────────────────────────────────────────────
    ts_hours_total = sum(w["hours"] for w in weekly.values())
    ts_nr_total = sum(w["net_revenue"] for w in weekly.values())
    ts_gross_total = sum(w["gross_revenue"] for w in weekly.values())
    ts_discount_total = sum(w["discount"] for w in weekly.values())

    iow_contract = float(p.iow_contract_value) if p.iow_contract_value else None
    iow_nr = float(p.iow_net_revenue) if p.iow_net_revenue else None
    iow_hours = float(p.iow_hours_total) if p.iow_hours_total else None

    pct_consumo_nr = round(ts_nr_total / iow_nr * 100, 1) if iow_nr else None
    pct_consumo_ore = round(ts_hours_total / iow_hours * 100, 1) if iow_hours else None
    residuo_eur = round(iow_nr - ts_nr_total, 2) if iow_nr is not None else None
    residuo_ore = round(iow_hours - ts_hours_total, 1) if iow_hours is not None else None

    # ── BU > CC breakdown ──────────────────────────────────────────────────────
    bu_map: dict[str, dict] = {}
    for cc_data in cc_agg.values():
        bu = cc_data["bu"]
        if bu not in bu_map:
            bu_map[bu] = {"bu": bu, "hours": 0.0, "net_revenue": 0.0, "cost_centers": []}
        bu_map[bu]["hours"] += cc_data["hours"]
        bu_map[bu]["net_revenue"] += cc_data["net_revenue"]
        h, nr = cc_data["hours"], cc_data["net_revenue"]
        bu_map[bu]["cost_centers"].append({
            "cc_code": cc_data["cc_code"],
            "cc_name": cc_data["cc_name"],
            "ou": cc_data["ou"],
            "hours": round(h, 1),
            "net_revenue": round(nr, 2),
            "pct_nr": round(nr / ts_nr_total * 100, 1) if ts_nr_total else None,
            "blended_rate": round(nr / h, 2) if h else None,
        })

    by_bu = sorted(
        [
            {
                "bu": v["bu"],
                "hours": round(v["hours"], 1),
                "net_revenue": round(v["net_revenue"], 2),
                "pct_nr": round(v["net_revenue"] / ts_nr_total * 100, 1) if ts_nr_total else None,
                "blended_rate": round(v["net_revenue"] / v["hours"], 2) if v["hours"] else None,
                "cost_centers": sorted(
                    v["cost_centers"], key=lambda x: x["net_revenue"], reverse=True
                ),
            }
            for v in bu_map.values()
        ],
        key=lambda x: x["net_revenue"],
        reverse=True,
    )

    # ── Lista settimanale (cronologica inversa) ────────────────────────────────
    weekly_list = sorted(
        [
            {
                "week_id": w["week_id"],
                "week_end": w["week_end"],
                "hours": round(w["hours"], 1),
                "net_revenue": round(w["net_revenue"], 2),
                "gross_revenue": round(w["gross_revenue"], 2),
                "discount": round(w["discount"], 2),
                "resources_active": len(w["resources"]),
                "cc_count": len(w["cc_set"]),
                "has_activity": w["hours"] > 0 or abs(w["net_revenue"]) > 0.01,
            }
            for w in weekly.values()
        ],
        key=lambda x: x["week_id"],
        reverse=True,
    )

    # ── Forecast basato su settimane non-zero ─────────────────────────────────
    active_weeks = [w for w in sorted(weekly.keys(), reverse=True) if
                    weekly[w]["hours"] > 0 or abs(weekly[w]["net_revenue"]) > 0.01]
    forecast = _calc_weekly_forecast(active_weeks, weekly, residuo_eur)

    client = p.client
    return {
        "project_id": project_id,
        "project_title": p.project_title,
        "client_name": client.client_name if client else None,
        "client_group": client.client_group if client else None,
        "engagement_manager": p.engagement_manager,
        "engagement_partner": p.engagement_partner,
        "project_status": p.project_status,
        "legal_entity": p.legal_entity,
        "fy_closing": p.fy_closing,
        "product_code": p.product_code,
        # Contrattuali (da File 9)
        "iow_contract_value": iow_contract,
        "iow_net_revenue": iow_nr,
        "iow_hours_total": iow_hours,
        # Consuntivo TS
        "ts_hours_total": round(ts_hours_total, 1),
        "ts_net_revenue_total": round(ts_nr_total, 2),
        "ts_gross_revenue_total": round(ts_gross_total, 2),
        "ts_discount_total": round(ts_discount_total, 2),
        "pct_consumo_nr": pct_consumo_nr,
        "pct_consumo_ore": pct_consumo_ore,
        "residuo_eur": residuo_eur,
        "residuo_ore": residuo_ore,
        # Breakdown
        "by_bu": by_bu,
        # Caricamenti settimanali (più recente prima)
        "weekly": weekly_list,
        # Previsione saturazione
        "forecast": forecast,
    }


def _calc_weekly_forecast(
    active_week_ids: list[str],
    weekly: dict[str, dict],
    residuo_eur: float | None,
) -> dict[str, Any]:
    empty = {
        "last_week_id": None, "last_week_end": None,
        "last_week_nr": None, "last_week_hours": None,
        "avg_4w_nr": None, "avg_4w_hours": None,
        "residuo_eur": residuo_eur,
        "weeks_to_saturation_lw": None, "weeks_to_saturation_4w": None,
        "saturation_date_lw": None, "saturation_date_4w": None,
    }
    if not active_week_ids:
        return empty

    last_id = active_week_ids[0]
    last_nr = weekly[last_id]["net_revenue"]
    last_hours = weekly[last_id]["hours"]
    last_end = weekly[last_id]["week_end"]

    last_4 = active_week_ids[:4]
    avg_4w_nr = sum(weekly[w]["net_revenue"] for w in last_4) / len(last_4)
    avg_4w_hours = sum(weekly[w]["hours"] for w in last_4) / len(last_4)

    # Data di saturazione: partiamo da week_end dell'ultima settimana attiva
    base_date = date.fromisoformat(last_end) if last_end else date.fromisoformat(last_id)

    sat_lw = sat_4w = weeks_lw = weeks_4w = None
    if residuo_eur is not None and residuo_eur > 0:
        if last_nr > 0:
            weeks_lw = residuo_eur / last_nr
            sat_lw = (base_date + timedelta(weeks=weeks_lw)).isoformat()
        if avg_4w_nr > 0:
            weeks_4w = residuo_eur / avg_4w_nr
            sat_4w = (base_date + timedelta(weeks=weeks_4w)).isoformat()

    return {
        "last_week_id": last_id,
        "last_week_end": last_end,
        "last_week_nr": round(last_nr, 2),
        "last_week_hours": round(last_hours, 1),
        "avg_4w_nr": round(avg_4w_nr, 2),
        "avg_4w_hours": round(avg_4w_hours, 1),
        "residuo_eur": residuo_eur,
        "weeks_to_saturation_lw": round(weeks_lw, 1) if weeks_lw is not None else None,
        "weeks_to_saturation_4w": round(weeks_4w, 1) if weeks_4w is not None else None,
        "saturation_date_lw": sat_lw,
        "saturation_date_4w": sat_4w,
    }
