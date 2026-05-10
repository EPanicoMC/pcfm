"""Logica di import per file 9 (anagrafica e KPI economici per progetto).

Input: path a file .xlsx oppure lista di dict (per test da CSV fixture).
Output: ProjectImportResult con contatori e lista di differenze per la preview.
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

import openpyxl


# ── Colonne attese (file 9) ────────────────────────────────────────────────────

_COL_PROJECT_ID = "Project ID"
_COL_NET_REVENUE_IOW = "Net Revenue (IOW)"

# Mappa colonna originale → nome campo normalizzato
_COL_MAP: dict[str, str] = {
    "Print ": "bi_report_url",
    "Service Account": "client_name",
    "Gruppo Comm. Serv. Account": "client_group",
    "Project Title": "project_title",
    "Project ID": "project_id",
    "Hours Actual": "hours_actual",
    "Gross Revenue": "gross_revenue",
    "Real (%) To Do": "bi_real_pct_todo",
    "Discount": "discount",
    "Wip Provision": "wip_provision",
    "Net Revenue Act": "net_revenue_act",
    "Fees As Expenses": "fees_as_expenses",
    "Expenses": "expenses_act",
    "Lump Sum": "lump_sum_act",
    "Total Expenses": "total_expenses_act",
    "Billed Fees": "billed_fees",
    "Billed Expenses": "billed_expenses",
    "Billed Amount": "billed_amount",
    "WIP": "wip",
    "Margin (%)": "margin_pct",
    "Hours Total Value (IOW)": "iow_hours_total",
    "Contract Value (IOW)": "iow_contract_value",
    "Net Revenue (IOW)": "iow_net_revenue",
    "Expenses (IOW)": "iow_expenses",
    "Lump Sum (IOW)": "iow_lump_sum",
    "Engagement Manager": "engagement_manager",
    "Engagement Manager CC": "engagement_manager_cc",
    "Engagement Partner": "engagement_partner",
    "Engagement Partner CC": "engagement_partner_cc",
    "Debtor Account": "debtor_account",
    "LE (Project)": "legal_entity",
    "Product Code": "product_code",
    "Opportunity Name": "opportunity_name",
    "Chargeable": "chargeable",
    "FY Closing Project": "fy_closing",
    "Project Closing Date": "project_closing_date",
    "Project Status": "project_status",
}

_FLOAT_FIELDS = {
    "hours_actual", "gross_revenue", "bi_real_pct_todo", "discount", "wip_provision",
    "net_revenue_act", "fees_as_expenses", "expenses_act", "lump_sum_act",
    "total_expenses_act", "billed_fees", "billed_expenses", "billed_amount", "wip",
    "margin_pct", "iow_hours_total", "iow_contract_value", "iow_net_revenue",
    "iow_expenses", "iow_lump_sum",
}

_INT_FIELDS = {"fy_closing"}


# ── Strutture dati ─────────────────────────────────────────────────────────────

@dataclass
class ProjectRow:
    project_id: str
    project_title: str | None = None
    client_name: str | None = None
    client_group: str | None = None
    hours_actual: float | None = None
    gross_revenue: float | None = None
    bi_real_pct_todo: float | None = None
    discount: float | None = None
    wip_provision: float | None = None
    net_revenue_act: float | None = None
    fees_as_expenses: float | None = None
    expenses_act: float | None = None
    lump_sum_act: float | None = None
    total_expenses_act: float | None = None
    billed_fees: float | None = None
    billed_expenses: float | None = None
    billed_amount: float | None = None
    wip: float | None = None
    margin_pct: float | None = None
    iow_hours_total: float | None = None
    iow_contract_value: float | None = None
    iow_net_revenue: float | None = None
    iow_expenses: float | None = None
    iow_lump_sum: float | None = None
    engagement_manager: str | None = None
    engagement_manager_cc: str | None = None
    engagement_partner: str | None = None
    engagement_partner_cc: str | None = None
    debtor_account: str | None = None
    legal_entity: str | None = None
    product_code: str | None = None
    opportunity_name: str | None = None
    chargeable: str | None = None
    fy_closing: int | None = None
    project_closing_date: date | None = None
    project_status: str | None = None
    bi_report_url: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.__dict__.items()}


@dataclass
class DiffRow:
    project_id: str
    action: str  # "insert" | "update" | "skip"
    changed_fields: list[str] = field(default_factory=list)


@dataclass
class ProjectImportResult:
    rows: list[ProjectRow] = field(default_factory=list)
    parse_errors: list[str] = field(default_factory=list)
    file_type_confirmed: bool = False


# ── Detect tipo file ───────────────────────────────────────────────────────────

def is_project_file(headers: list[str]) -> bool:
    return _COL_PROJECT_ID in headers and _COL_NET_REVENUE_IOW in headers


# ── Parsing ────────────────────────────────────────────────────────────────────

def parse_xlsx(path: Path) -> ProjectImportResult:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)

    header_row = next(rows_iter, None)
    if header_row is None:
        wb.close()
        return ProjectImportResult(parse_errors=["File vuoto"])

    headers = [str(h).strip() if h is not None else "" for h in header_row]

    if not is_project_file(headers):
        wb.close()
        return ProjectImportResult(parse_errors=["File non riconosciuto come file 9 (mancano 'Project ID' o 'Net Revenue (IOW)')"])

    raw_rows = []
    for row in rows_iter:
        if len(row) < len(headers):
            continue
        d = dict(zip(headers, row))
        raw_rows.append(d)

    wb.close()
    return _parse_raw_rows(raw_rows, headers, confirmed_type=True)


def parse_csv(path: Path) -> ProjectImportResult:
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        # Il CSV delle fixture usa nomi già normalizzati (non le intestazioni originali)
        # Supportiamo entrambi i formati.
        raw_rows = list(reader)
    return _parse_raw_rows(raw_rows, list(headers), confirmed_type=True)


def _parse_raw_rows(raw_rows: list[dict], headers: list[str], confirmed_type: bool) -> ProjectImportResult:
    result = ProjectImportResult(file_type_confirmed=confirmed_type)

    # Determina se gli header sono nomi originali o normalizzati
    using_original_headers = _COL_PROJECT_ID in headers

    for raw in raw_rows:
        try:
            row = _parse_single_row(raw, using_original_headers)
            if row is not None:
                result.rows.append(row)
        except Exception as e:
            pid = raw.get("project_id") or raw.get(_COL_PROJECT_ID) or "?"
            result.parse_errors.append(f"{pid}: {e}")

    return result


def _parse_single_row(raw: dict, using_original_headers: bool) -> ProjectRow | None:
    # Normalizza le chiavi
    if using_original_headers:
        norm = {}
        for orig_key, norm_key in _COL_MAP.items():
            norm[norm_key] = raw.get(orig_key)
        # Colonna "Total" = sempre None per dati reali; skip se valorizzata
        if raw.get("Total") is not None:
            return None
    else:
        norm = dict(raw)

    project_id = _str(norm.get("project_id"))
    if not project_id:
        return None

    # Normalizza tipi
    kwargs: dict[str, Any] = {"project_id": project_id}

    for f in _FLOAT_FIELDS:
        kwargs[f] = _float(norm.get(f))

    for f in _INT_FIELDS:
        kwargs[f] = _int(norm.get(f))

    for f in ("project_title", "client_name", "client_group", "engagement_manager",
              "engagement_manager_cc", "engagement_partner", "engagement_partner_cc",
              "debtor_account", "legal_entity", "product_code", "opportunity_name",
              "chargeable", "project_status", "bi_report_url"):
        kwargs[f] = _str(norm.get(f))

    raw_date = norm.get("project_closing_date")
    if isinstance(raw_date, date):
        kwargs["project_closing_date"] = raw_date
    elif raw_date and str(raw_date).strip():
        try:
            kwargs["project_closing_date"] = date.fromisoformat(str(raw_date))
        except ValueError:
            kwargs["project_closing_date"] = None
    else:
        kwargs["project_closing_date"] = None

    return ProjectRow(**kwargs)


# ── Diff contro stato attuale (per preview) ────────────────────────────────────

def compute_diff(
    parsed_rows: list[ProjectRow],
    existing: dict[str, dict[str, Any]],
) -> list[DiffRow]:
    """Calcola le differenze tra i dati parsati e quelli esistenti nel DB.

    existing: dict project_id → dict con i campi correnti del record.
    """
    diffs = []
    _SKIP_COMPARE = {"bi_report_url", "client_name", "client_group"}

    for row in parsed_rows:
        pid = row.project_id
        if pid not in existing:
            diffs.append(DiffRow(project_id=pid, action="insert"))
        else:
            changed = _changed_fields(row.to_dict(), existing[pid], skip=_SKIP_COMPARE)
            if changed:
                diffs.append(DiffRow(project_id=pid, action="update", changed_fields=changed))
            else:
                diffs.append(DiffRow(project_id=pid, action="skip"))

    return diffs


def _changed_fields(new: dict, old: dict, skip: set[str]) -> list[str]:
    changed = []
    for key, new_val in new.items():
        if key in skip or key in ("project_id",):
            continue
        old_val = old.get(key)
        if not _values_equal(new_val, old_val):
            changed.append(key)
    return changed


def _values_equal(a: Any, b: Any) -> bool:
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    if isinstance(a, float) and isinstance(b, float):
        return abs(a - b) < 0.005
    return str(a) == str(b)


# ── Helpers ────────────────────────────────────────────────────────────────────

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


def _int(v: Any) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None
