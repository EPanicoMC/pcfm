"""Logica di forecast e provisioning per singolo progetto.

Tutte le funzioni sono pure (nessun I/O, nessun DB) e testabili in isolamento.
I parametri configurabili (hours_per_man_day, ecc.) vengono passati esplicitamente.
"""

from __future__ import annotations

import math
from calendar import monthrange
from dataclasses import dataclass, field
from datetime import date

from dateutil.relativedelta import relativedelta


@dataclass
class MonthlyPoint:
    """Aggregato mensile di timesheet per un progetto."""
    month_id: str   # "YYYY-MM"
    hours: float
    net_revenue: float


@dataclass
class RunRate:
    hours: float | None
    net_revenue: float | None
    window: str
    months_used: int


def calc_run_rate(monthly_data: list[MonthlyPoint], window: str = "last_month") -> RunRate:
    """Calcola il run rate mensile da storico aggregato per mese.

    window: "last_month" | "last_3_months" | "weighted"
    Ordine: dal mese più recente verso il passato.
    """
    if not monthly_data:
        return RunRate(hours=None, net_revenue=None, window=window, months_used=0)

    pts = sorted(monthly_data, key=lambda x: x.month_id, reverse=True)

    if window == "last_month":
        sample = pts[:1]
        hours = sample[0].hours
        net_rev = sample[0].net_revenue

    elif window == "last_3_months":
        sample = pts[:3]
        n = len(sample)
        hours = sum(p.hours for p in sample) / n
        net_rev = sum(p.net_revenue for p in sample) / n

    elif window == "weighted":
        sample = pts[:3]
        # pesi: mese più recente = 3, secondo = 2, terzo = 1
        weights = [3, 2, 1][: len(sample)]
        total_w = sum(weights)
        hours = sum(p.hours * w for p, w in zip(sample, weights)) / total_w
        net_rev = sum(p.net_revenue * w for p, w in zip(sample, weights)) / total_w

    else:
        raise ValueError(f"window non supportata: {window!r}")

    return RunRate(
        hours=round(hours, 4),
        net_revenue=round(net_rev, 4),
        window=window,
        months_used=len(sample),
    )


def calc_residuo(
    iow_hours_total: float | None,
    ts_hours: float,
    iow_net_revenue: float | None,
    ts_net_revenue: float,
) -> tuple[float | None, float | None]:
    """Restituisce (residuo_ore, residuo_eur). None se il budget IOW non è definito."""
    residuo_ore = round(iow_hours_total - ts_hours, 4) if iow_hours_total is not None else None
    residuo_eur = round(iow_net_revenue - ts_net_revenue, 4) if iow_net_revenue is not None else None
    return residuo_ore, residuo_eur


def calc_mesi_residui(residuo_ore: float | None, run_rate_hours: float | None) -> float | None:
    """Quanti mesi al run rate corrente si esauriscono le ore residue."""
    if residuo_ore is None or not run_rate_hours:
        return None
    return round(residuo_ore / run_rate_hours, 4)


def calc_data_esaurimento(today: date, mesi_residui: float | None) -> date | None:
    """Data attesa di esaurimento ore: today + ceil(mesi_residui) mesi → ultimo giorno del mese."""
    if mesi_residui is None:
        return None
    mesi = math.ceil(mesi_residui)
    target = today + relativedelta(months=mesi)
    last_day = monthrange(target.year, target.month)[1]
    return date(target.year, target.month, last_day)


def calc_scenari(monthly_data: list[MonthlyPoint]) -> dict[str, float | None]:
    """Percentili 25/50/75 delle ore mensili storiche (low/base/high)."""
    if not monthly_data:
        return {"low": None, "base": None, "high": None}

    hours_sorted = sorted(p.hours for p in monthly_data)

    def _percentile(data: list[float], pct: float) -> float:
        idx = pct / 100 * (len(data) - 1)
        lo, hi = int(idx), math.ceil(idx)
        if lo == hi:
            return data[lo]
        return data[lo] + (data[hi] - data[lo]) * (idx - lo)

    return {
        "low": round(_percentile(hours_sorted, 25), 2),
        "base": round(_percentile(hours_sorted, 50), 2),
        "high": round(_percentile(hours_sorted, 75), 2),
    }


def fy_month_ids(fy: int, fy_start_month: int = 7) -> list[str]:
    """Restituisce tutti i month_id del FY in ordine cronologico.

    FY26 con start_month=7: ["2025-07", "2025-08", ..., "2026-06"]
    """
    months = []
    year = fy - 1
    month = fy_start_month
    for _ in range(12):
        months.append(f"{year}-{month:02d}")
        month += 1
        if month > 12:
            month = 1
            year += 1
    return months


def calc_forecast_fy(
    actual_ytd_net_revenue: float,
    run_rate_net_revenue: float | None,
    future_month_ids: list[str],
    overrides: dict[str, float],
) -> float | None:
    """Forecast netto FY = YTD actual + proiezione mesi futuri.

    Per ogni mese futuro: usa override se presente, altrimenti run_rate.
    Restituisce None se non c'è run rate e nessun override copre i mesi futuri.
    """
    has_data = run_rate_net_revenue is not None or any(m in overrides for m in future_month_ids)
    if not has_data:
        return None

    rr = run_rate_net_revenue or 0.0
    future_total = sum(overrides.get(m, rr) for m in future_month_ids)
    return round(actual_ytd_net_revenue + future_total, 2)


def is_at_risk(
    data_esaurimento: date | None,
    today: date,
    project_status: str | None,
) -> bool:
    """True se il progetto esaurisce le ore entro 60 giorni (esclusi 'In Chiusura')."""
    if data_esaurimento is None:
        return False
    if project_status == "In Chiusura":
        return False
    return (data_esaurimento - today).days <= 60
