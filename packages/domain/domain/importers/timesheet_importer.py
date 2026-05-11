"""Logica di import per file 8 (timesheet settimanali per risorsa × progetto × settimana).

Il project_id NON è nelle colonne: va estratto dal nome file (senza estensione).
"""

from __future__ import annotations

import csv
import hashlib
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

import openpyxl

_COL_RESOURCE_ID = "Resource ID"
_COL_WEEK_RANGE = "Week Range"

_MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}

_COL_MAP: dict[str, str] = {
    "FYMonthWeek_PAR": "fy_month_week",
    "FY": "fy_raw",
    "Month": "month_label",
    "Week Range": "week_range",
    "Job Title": "job_title",
    "Resource": "resource_name",
    "Document Item Text": "document_item_text",
    "Hours Actual": "hours_actual",
    "Gross Revenue": "gross_revenue",
    "Discount": "discount",
    "Wip Provision": "wip_provision",
    "Net Revenue Actual": "net_revenue_actual",
    "Gross Rate": "gross_rate",
    "Net Rate": "net_rate",
    "Resource Cost Center": "resource_cost_center",
    "Resource Cost Center Name": "resource_cost_center_name",
    "Resource OU": "resource_ou",
    "Resource BU": "resource_bu",
    "Resource Los": "resource_los",
    "Legal Entity": "legal_entity",
    "Resource ID": "resource_id",
}

_FLOAT_FIELDS = {
    "hours_actual", "gross_revenue", "discount", "wip_provision",
    "net_revenue_actual", "gross_rate", "net_rate",
}
# Campi da sommare durante aggregazione righe duplicate (stesso resource×periodo fiscale)
_SUM_FIELDS = {"hours_actual", "gross_revenue", "discount", "wip_provision", "net_revenue_actual"}
# Tassi: tenere il primo valore non-zero
_RATE_FIELDS = {"gross_rate", "net_rate"}


@dataclass
class TimesheetRow:
    timesheet_id: str
    project_id: str
    resource_id: str
    week_id: str        # "YYYY-MM-DD" del lunedì
    week_end: date
    month_id: str       # "YYYY-MM" del lunedì
    fy: int
    fy_month_week: str | None = None
    job_title: str | None = None
    resource_name: str | None = None
    document_item_text: str | None = None
    hours_actual: float | None = None
    gross_revenue: float | None = None
    discount: float | None = None
    wip_provision: float | None = None
    net_revenue_actual: float | None = None
    gross_rate: float | None = None
    net_rate: float | None = None
    resource_cost_center: str | None = None
    resource_cost_center_name: str | None = None
    resource_ou: str | None = None
    resource_bu: str | None = None
    resource_los: str | None = None
    legal_entity: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.__dict__.items()}


@dataclass
class TimesheetImportResult:
    project_id: str
    rows: list[TimesheetRow] = field(default_factory=list)
    parse_errors: list[str] = field(default_factory=list)
    file_type_confirmed: bool = False


def is_timesheet_file(headers: list[str]) -> bool:
    return _COL_RESOURCE_ID in headers and _COL_WEEK_RANGE in headers


def extract_project_id_from_filename(filename: str) -> str:
    """Estrae il project_id dal nome file rimuovendo solo estensioni note (.xlsx, .xls, .csv)."""
    p = Path(filename)
    if p.suffix.lower() in (".xlsx", ".xls", ".csv"):
        return p.stem
    return p.name


def make_timesheet_id(resource_id: str, project_id: str, fy_month_week: str) -> str:
    key = f"{resource_id}|{project_id}|{fy_month_week}"
    return hashlib.sha256(key.encode()).hexdigest()


def parse_week_range(week_range: str, year_hint: int) -> tuple[date, date]:
    """Converte "29 Mar - 04 Apr" in (date(2026,3,29), date(2026,4,4)).

    Regola anno: se end_month < start_month (cambio anno solare), end_year += 1.
    """
    parts = week_range.strip().split(" - ")
    if len(parts) != 2:
        raise ValueError(f"Formato Week Range non atteso: {week_range!r}")

    s_parts = parts[0].strip().split()
    e_parts = parts[1].strip().split()

    s_day, s_mon = int(s_parts[0]), _MONTHS[s_parts[1]]
    e_day, e_mon = int(e_parts[0]), _MONTHS[e_parts[1]]

    s_year = year_hint
    e_year = year_hint if e_mon >= s_mon else year_hint + 1

    return date(s_year, s_mon, s_day), date(e_year, e_mon, e_day)


def normalize_fy(fy_raw: str | None) -> int | None:
    """Converte "FY26" → 2026."""
    if not fy_raw:
        return None
    s = str(fy_raw).strip()
    if s.startswith("FY") and len(s) >= 4:
        try:
            return 2000 + int(s[2:])
        except ValueError:
            pass
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None


def parse_xlsx(path: Path, project_id: str) -> TimesheetImportResult:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)

    header_row = next(rows_iter, None)
    if header_row is None:
        wb.close()
        return TimesheetImportResult(project_id=project_id, parse_errors=["File vuoto"])

    headers = [str(h).strip() if h is not None else "" for h in header_row]

    if not is_timesheet_file(headers):
        wb.close()
        return TimesheetImportResult(
            project_id=project_id,
            parse_errors=["File non riconosciuto come timesheet (mancano 'Resource ID' o 'Week Range')"],
        )

    raw_rows = []
    for row in rows_iter:
        if len(row) < len(headers):
            continue
        d = dict(zip(headers, row))
        raw_rows.append(d)

    wb.close()
    return _parse_raw_rows(raw_rows, headers, project_id, using_original_headers=True)


def parse_csv(path: Path, project_id: str) -> TimesheetImportResult:
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        headers = list(reader.fieldnames or [])
        raw_rows = list(reader)
    using_original = _COL_RESOURCE_ID in headers
    return _parse_raw_rows(raw_rows, headers, project_id, using_original_headers=using_original)


def _parse_raw_rows(
    raw_rows: list[dict],
    headers: list[str],
    project_id: str,
    using_original_headers: bool,
) -> TimesheetImportResult:
    result = TimesheetImportResult(project_id=project_id, file_type_confirmed=True)

    raw_rows_parsed: list[TimesheetRow] = []
    for raw in raw_rows:
        try:
            row = _parse_single_row(raw, project_id, using_original_headers)
            if row is not None:
                raw_rows_parsed.append(row)
        except Exception as e:
            rid = raw.get("resource_id") or raw.get(_COL_RESOURCE_ID) or "?"
            result.parse_errors.append(f"risorsa {rid}: {e}")

    # Aggrega righe con stesso timesheet_id (es. righe duplicate con 0 e valori reali)
    aggregated: dict[str, TimesheetRow] = {}
    for row in raw_rows_parsed:
        if row.timesheet_id not in aggregated:
            aggregated[row.timesheet_id] = row
        else:
            base = aggregated[row.timesheet_id]
            for f in _SUM_FIELDS:
                base_val = getattr(base, f) or 0.0
                new_val = getattr(row, f) or 0.0
                setattr(base, f, round(base_val + new_val, 4))
            for f in _RATE_FIELDS:
                if not getattr(base, f) and getattr(row, f):
                    setattr(base, f, getattr(row, f))

    result.rows = list(aggregated.values())
    return result


def _parse_single_row(raw: dict, project_id: str, using_original_headers: bool) -> TimesheetRow | None:
    if using_original_headers:
        norm: dict[str, Any] = {}
        for orig, norm_key in _COL_MAP.items():
            norm[norm_key] = raw.get(orig)
        # Riga non dati: FYMonthWeek_PAR assente o None
        if norm.get("fy_month_week") is None:
            return None
    else:
        norm = dict(raw)
        if not norm.get("fy_month_week") and not norm.get("resource_id"):
            return None

    resource_id = _str(norm.get("resource_id"))
    if not resource_id:
        return None

    fy_raw = norm.get("fy_raw") or norm.get("fy")
    fy = normalize_fy(str(fy_raw) if fy_raw else None)
    if fy is None:
        return None

    # Parsing week range
    week_range = _str(norm.get("week_range"))
    if not week_range:
        return None

    month_label = _str(norm.get("month_label"))
    year_hint = _year_from_month_label(month_label) or fy
    week_start, week_end = parse_week_range(week_range, year_hint)

    week_id = week_start.isoformat()
    month_id = f"{week_start.year}-{week_start.month:02d}"
    fy_month_week_str = _str(norm.get("fy_month_week")) or week_id
    timesheet_id = make_timesheet_id(resource_id, project_id, fy_month_week_str)

    kwargs: dict[str, Any] = {
        "timesheet_id": timesheet_id,
        "project_id": project_id,
        "resource_id": resource_id,
        "week_id": week_id,
        "week_end": week_end,
        "month_id": month_id,
        "fy": fy,
        "fy_month_week": _str(norm.get("fy_month_week")),
        "job_title": _str(norm.get("job_title")),
        "resource_name": _str(norm.get("resource_name") or norm.get("resource")),
        "document_item_text": _str(norm.get("document_item_text")) or None,
    }

    for f in _FLOAT_FIELDS:
        kwargs[f] = _float(norm.get(f))

    for f in ("resource_cost_center", "resource_cost_center_name", "resource_ou",
              "resource_bu", "resource_los", "legal_entity"):
        kwargs[f] = _str(norm.get(f))

    return TimesheetRow(**kwargs)


def _year_from_month_label(label: str | None) -> int | None:
    """"2026-Mar" → 2026."""
    if not label:
        return None
    try:
        return int(str(label).split("-")[0])
    except (ValueError, IndexError):
        return None


def _str(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def _float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return round(float(v), 4)
    except (ValueError, TypeError):
        return None
