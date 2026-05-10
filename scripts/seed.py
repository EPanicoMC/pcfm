"""Popola il DB con dati di default (dim_assumption, dim_fiscal_calendar)."""

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apps.api.app.database import SessionLocal
from apps.api.app.models.dimensions import DimAssumption, DimFiscalCalendar


ASSUMPTIONS = [
    ("hours_per_man_day", 8.0, None, "Ore per un Man-Day"),
    ("working_days_per_month", 21.0, None, "Giorni lavorativi standard per mese"),
    ("fte_hours_per_year", 1700.0, None, "Ore annue per un FTE"),
    ("fy_start_month", 7.0, None, "Mese di inizio FY (luglio = 7)"),
    ("forecast_window_default", None, "last_month", "Finestra default run rate: last_month | last_3_months | weighted"),
    ("backup_retention_years", 2.0, None, "Anni di retention dei backup automatici"),
]

# FY da FY23 (2023) a FY28 (2028) — sufficienti per l'orizzonte di progetto
FISCAL_YEARS = [
    (2023, date(2022, 7, 1), date(2023, 6, 30), "FY23"),
    (2024, date(2023, 7, 1), date(2024, 6, 30), "FY24"),
    (2025, date(2024, 7, 1), date(2025, 6, 30), "FY25"),
    (2026, date(2025, 7, 1), date(2026, 6, 30), "FY26"),
    (2027, date(2026, 7, 1), date(2027, 6, 30), "FY27"),
    (2028, date(2027, 7, 1), date(2028, 6, 30), "FY28"),
]


def seed():
    db = SessionLocal()
    try:
        inserted = 0
        skipped = 0

        for key, val_num, val_str, desc in ASSUMPTIONS:
            existing = db.get(DimAssumption, key)
            if existing is None:
                db.add(DimAssumption(key=key, value_num=val_num, value_str=val_str, description=desc))
                inserted += 1
            else:
                skipped += 1

        for fy, start, end, label in FISCAL_YEARS:
            existing = db.get(DimFiscalCalendar, fy)
            if existing is None:
                db.add(DimFiscalCalendar(fy=fy, fy_start_date=start, fy_end_date=end, label=label))
                inserted += 1
            else:
                skipped += 1

        db.commit()
        print(f"Seed completato: {inserted} inseriti, {skipped} già presenti.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
