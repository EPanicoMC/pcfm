"""Vista di dettaglio per un singolo codice progetto.

NR effettivo: usa fact_project.net_revenue_act (da File 9, autoritative).
TS importati: breakdown BU/CC/settimana dai timesheet File 8 caricati.
Residuo = iow_net_revenue - net_revenue_act.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy.orm import Session

from ..models.dimensions import DimCostCenter, DimResource, DimWeek
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

    # ── Valori contrattuali (da File 9) ───────────────────────────────────────
    iow_contract = float(p.iow_contract_value) if p.iow_contract_value else None
    iow_nr = float(p.iow_net_revenue) if p.iow_net_revenue else None
    iow_hours = float(p.iow_hours_total) if p.iow_hours_total else None

    # NR effettivo autoritative — da File 9, copre tutti i mesi del progetto
    project_nr_actual = float(p.net_revenue_act) if p.net_revenue_act else None
    project_hours_actual = float(p.hours_actual) if p.hours_actual else None

    # ── Aggregazione da timesheet importati ───────────────────────────────────
    # weekly: per settimana (con resource set per contare risorse uniche)
    # cc_agg: per CC (per breakdown BU>CC)
    # fy_map: per FY (per breakdown temporale)
    # week_cc: per settimana×CC (entries flat per filtro drill-down)

    weekly: dict[str, dict] = {}
    cc_agg: dict[str, dict] = {}
    fy_map: dict[int, dict] = {}
    week_cc: dict[tuple, dict] = {}
    week_res: dict[tuple, dict] = {}  # (week_id, resource_id) → dati risorsa

    for ts in ts_rows:
        wid = ts.week_id
        if not wid:
            continue

        cc_code = ts.resource_cost_center or "__ND__"
        dim_w = db.get(DimWeek, wid)
        dim_cc = db.get(DimCostCenter, cc_code) if cc_code != "__ND__" else None

        week_end = dim_w.week_end.isoformat() if (dim_w and dim_w.week_end) else None
        fy = dim_w.fy if dim_w else (ts.fy or 0)
        cc_display = cc_code if cc_code != "__ND__" else "N/D"
        cc_name = (dim_cc.cc_name if dim_cc else None) or cc_display
        bu = (dim_cc.bu if dim_cc else None) or "N/D"

        dim_res = db.get(DimResource, ts.resource_id)
        resource_name = (dim_res.resource_name if dim_res else None) or ts.resource_id

        h = ts.hours_actual or 0.0
        nr = ts.net_revenue_actual or 0.0
        gr = ts.gross_revenue or 0.0
        disc = ts.discount or 0.0

        # Settimane
        if wid not in weekly:
            weekly[wid] = {"week_id": wid, "week_end": week_end, "fy": fy,
                           "hours": 0.0, "net_revenue": 0.0, "gross_revenue": 0.0,
                           "discount": 0.0, "resources": set()}
        weekly[wid]["hours"] += h
        weekly[wid]["net_revenue"] += nr
        weekly[wid]["gross_revenue"] += gr
        weekly[wid]["discount"] += disc
        weekly[wid]["resources"].add(ts.resource_id)

        # CC
        if cc_code not in cc_agg:
            cc_agg[cc_code] = {"cc_code": cc_display, "cc_name": cc_name,
                                "bu": bu, "ou": (dim_cc.ou if dim_cc else None),
                                "hours": 0.0, "net_revenue": 0.0}
        cc_agg[cc_code]["hours"] += h
        cc_agg[cc_code]["net_revenue"] += nr

        # FY
        if fy not in fy_map:
            fy_map[fy] = {"fy": fy, "hours": 0.0, "net_revenue": 0.0, "weeks": set()}
        fy_map[fy]["hours"] += h
        fy_map[fy]["net_revenue"] += nr
        fy_map[fy]["weeks"].add(wid)

        # Settimana × Risorsa (per drill-down nella UI)
        rkey = (wid, ts.resource_id)
        if rkey not in week_res:
            week_res[rkey] = {
                "resource_id": ts.resource_id,
                "resource_name": resource_name,
                "cc_code": cc_display,
                "cc_name": cc_name,
                "bu": bu,
                "hours": 0.0,
                "net_revenue": 0.0,
                "gross_revenue": 0.0,
            }
        week_res[rkey]["hours"] += h
        week_res[rkey]["net_revenue"] += nr
        week_res[rkey]["gross_revenue"] += gr

        # Entries flat (settimana × CC)
        key = (wid, cc_code)
        if key not in week_cc:
            week_cc[key] = {"week_id": wid, "week_end": week_end, "fy": fy,
                            "cc_code": cc_display, "cc_name": cc_name, "bu": bu,
                            "hours": 0.0, "net_revenue": 0.0,
                            "gross_revenue": 0.0, "discount": 0.0}
        week_cc[key]["hours"] += h
        week_cc[key]["net_revenue"] += nr
        week_cc[key]["gross_revenue"] += gr
        week_cc[key]["discount"] += disc

    # ── Totali timesheet importati ─────────────────────────────────────────────
    ts_nr_total = sum(w["net_revenue"] for w in weekly.values())
    ts_hours_total = sum(w["hours"] for w in weekly.values())
    ts_gross_total = sum(w["gross_revenue"] for w in weekly.values())
    ts_discount_total = sum(w["discount"] for w in weekly.values())

    # ── KPI basati su valori autoritativi (File 9) ────────────────────────────
    nr_for_kpi = project_nr_actual if project_nr_actual is not None else ts_nr_total
    h_for_kpi = project_hours_actual if project_hours_actual is not None else ts_hours_total

    pct_consumo_nr = round(nr_for_kpi / iow_nr * 100, 1) if iow_nr else None
    pct_consumo_ore = round(h_for_kpi / iow_hours * 100, 1) if iow_hours else None
    residuo_eur = round(iow_nr - nr_for_kpi, 2) if iow_nr is not None else None
    residuo_ore = round(iow_hours - h_for_kpi, 1) if iow_hours is not None else None

    # ── BU > CC breakdown (da TS importati) ───────────────────────────────────
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
        [{"bu": v["bu"], "hours": round(v["hours"], 1), "net_revenue": round(v["net_revenue"], 2),
          "pct_nr": round(v["net_revenue"] / ts_nr_total * 100, 1) if ts_nr_total else None,
          "blended_rate": round(v["net_revenue"] / v["hours"], 2) if v["hours"] else None,
          "cost_centers": sorted(v["cost_centers"], key=lambda x: x["net_revenue"], reverse=True)}
         for v in bu_map.values()],
        key=lambda x: x["net_revenue"], reverse=True,
    )

    # ── FY breakdown (da TS importati) ────────────────────────────────────────
    by_fy = sorted(
        [{"fy": v["fy"], "weeks": len(v["weeks"]), "hours": round(v["hours"], 1),
          "net_revenue": round(v["net_revenue"], 2),
          "pct_of_ts": round(v["net_revenue"] / ts_nr_total * 100, 1) if ts_nr_total else None}
         for v in fy_map.values()],
        key=lambda x: x["fy"],
    )

    # ── Risorse aggregate per settimana ───────────────────────────────────────
    by_week_resources: dict[str, list] = {}
    for (wid, _rid), r in week_res.items():
        if wid not in by_week_resources:
            by_week_resources[wid] = []
        real_pct = round(r["net_revenue"] / r["gross_revenue"] * 100, 1) if r["gross_revenue"] else None
        by_week_resources[wid].append({
            "resource_id": r["resource_id"],
            "resource_name": r["resource_name"],
            "cc_code": r["cc_code"],
            "cc_name": r["cc_name"],
            "bu": r["bu"],
            "hours": round(r["hours"], 1),
            "net_revenue": round(r["net_revenue"], 2),
            "realization_pct": real_pct,
        })
    for wid in by_week_resources:
        by_week_resources[wid].sort(key=lambda x: x["net_revenue"], reverse=True)

    # ── Lista settimanale (per vista default non filtrata) ─────────────────────
    weekly_list = sorted(
        [{"week_id": w["week_id"], "week_end": w["week_end"], "fy": w["fy"],
          "hours": round(w["hours"], 1), "net_revenue": round(w["net_revenue"], 2),
          "gross_revenue": round(w["gross_revenue"], 2), "discount": round(w["discount"], 2),
          "resources_active": len(w["resources"]),
          "has_activity": w["hours"] > 0 or abs(w["net_revenue"]) > 0.01,
          "resources": by_week_resources.get(w["week_id"], [])}
         for w in weekly.values()],
        key=lambda x: x["week_id"], reverse=True,
    )

    # ── Entries flat (settimana × CC, per filtro drill-down) ──────────────────
    entries = sorted(
        [{"week_id": v["week_id"], "week_end": v["week_end"], "fy": v["fy"],
          "cc_code": v["cc_code"], "cc_name": v["cc_name"], "bu": v["bu"],
          "hours": round(v["hours"], 1), "net_revenue": round(v["net_revenue"], 2),
          "gross_revenue": round(v["gross_revenue"], 2), "discount": round(v["discount"], 2)}
         for v in week_cc.values()],
        key=lambda x: x["week_id"], reverse=True,
    )

    # ── Forecast basato su settimane attive (TS importati) ────────────────────
    active_wids = [w["week_id"] for w in weekly_list if w["has_activity"]]
    forecast = _calc_weekly_forecast(active_wids, weekly, residuo_eur)

    # ── Realizzo e margine ────────────────────────────────────────────────────
    # Realizzo da timesheet importati (NR / Lordo dei TS caricati)
    ts_realization_pct = round(ts_nr_total / ts_gross_total * 100, 1) if ts_gross_total else None
    # Realizzo e margine da File 9 (autoritativi da BI)
    bi_real_pct = float(p.bi_real_pct_todo) if p.bi_real_pct_todo else None
    margin_pct = float(p.margin_pct) if p.margin_pct else None
    wip_provision_total = float(p.wip_provision) if p.wip_provision else None

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
        # Contrattuali (File 9)
        "iow_contract_value": iow_contract,
        "iow_net_revenue": iow_nr,
        "iow_hours_total": iow_hours,
        # NR/ore autoritativi da File 9
        "project_nr_actual": project_nr_actual,
        "project_hours_actual": project_hours_actual,
        # KPI calcolati su valori autoritativi
        "pct_consumo_nr": pct_consumo_nr,
        "pct_consumo_ore": pct_consumo_ore,
        "residuo_eur": residuo_eur,
        "residuo_ore": residuo_ore,
        # Totali timesheet importati (subset)
        "ts_nr_total": round(ts_nr_total, 2),
        "ts_hours_total": round(ts_hours_total, 1),
        "ts_gross_total": round(ts_gross_total, 2),
        "ts_discount_total": round(ts_discount_total, 2),
        # Realizzo e margine
        "ts_realization_pct": ts_realization_pct,  # realizzo dai TS importati
        "bi_real_pct": bi_real_pct,                # realizzo autoritative da File 9
        "margin_pct": margin_pct,                  # margine da File 9
        "wip_provision": wip_provision_total,
        # Breakdown
        "by_bu": by_bu,
        "by_fy": by_fy,
        # Dati settimanali
        "weekly": weekly_list,
        "entries": entries,
        # Forecast
        "forecast": forecast,
    }


def _calc_weekly_forecast(
    active_week_ids: list[str],
    weekly: dict[str, dict],
    residuo_eur: float | None,
) -> dict[str, Any]:
    empty: dict[str, Any] = {
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
