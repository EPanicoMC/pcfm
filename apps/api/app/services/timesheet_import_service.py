"""Orchestrazione import file 8: backup → parse → upsert dim → upsert fact_timesheet → stale."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from domain.importers.timesheet_importer import (
    TimesheetImportResult,
    TimesheetRow,
    extract_project_id_from_filename,
    parse_csv,
    parse_xlsx,
)

from ..models.dimensions import DimCostCenter, DimFiscalCalendar, DimResource, DimWeek
from ..models.facts import FactTimesheet, Import
from .backup_service import backup_db


def run_timesheet_import(
    db: Session,
    file_path: Path,
    original_filename: str,
    project_id_override: str | None = None,
) -> dict[str, Any]:
    project_id = project_id_override or extract_project_id_from_filename(original_filename)
    backup_path = backup_db()

    imp = Import(
        file_type="timesheet",
        original_filename=original_filename,
        project_id_extracted=project_id,
        import_ts=datetime.now(tz=timezone.utc),
        backup_path=str(backup_path) if backup_path else None,
        status="in_progress",
    )
    db.add(imp)
    db.flush()

    try:
        parsed = _parse(file_path, project_id)
        if not parsed.file_type_confirmed:
            raise ValueError("File non riconosciuto come timesheet (tipo 8)")

        counts = _apply_upsert(db, parsed, imp.import_id)
        _mark_stale(db, project_id, seen_ids={r.timesheet_id for r in parsed.rows}, import_id=imp.import_id)

        imp.rows_inserted = counts["inserted"]
        imp.rows_updated = counts["updated"]
        imp.rows_skipped = counts["skipped"]
        imp.rows_error = len(parsed.parse_errors)
        imp.status = "success" if not parsed.parse_errors else "partial"
        db.commit()

    except Exception as exc:
        db.rollback()
        imp.status = "failed"
        imp.rows_error = 1
        db.add(imp)
        db.commit()
        raise exc

    return {
        "import_id": imp.import_id,
        "project_id": project_id,
        "status": imp.status,
        "inserted": imp.rows_inserted,
        "updated": imp.rows_updated,
        "skipped": imp.rows_skipped,
        "errors": imp.rows_error,
        "parse_errors": parsed.parse_errors,
        "backup_path": str(backup_path) if backup_path else None,
    }


def preview_timesheet_import(
    file_path: Path,
    original_filename: str,
    db: Session,
    project_id_override: str | None = None,
) -> dict[str, Any]:
    project_id = project_id_override or extract_project_id_from_filename(original_filename)
    parsed = _parse(file_path, project_id)

    existing_ids = {
        ts.timesheet_id
        for ts in db.query(FactTimesheet.timesheet_id)
        .filter(FactTimesheet.project_id == project_id, FactTimesheet.is_stale == 0)
        .all()
    }

    diff = []
    for row in parsed.rows:
        if row.timesheet_id not in existing_ids:
            diff.append({"timesheet_id": row.timesheet_id, "action": "insert",
                         "resource_id": row.resource_id, "week_id": row.week_id})
        else:
            diff.append({"timesheet_id": row.timesheet_id, "action": "skip",
                         "resource_id": row.resource_id, "week_id": row.week_id})

    return {
        "file_type": "timesheet",
        "project_id": project_id,
        "parse_errors": parsed.parse_errors,
        "diff": diff,
        "summary": {
            "insert": sum(1 for d in diff if d["action"] == "insert"),
            "skip": sum(1 for d in diff if d["action"] == "skip"),
            "parse_errors": len(parsed.parse_errors),
        },
    }


def _parse(path: Path, project_id: str) -> TimesheetImportResult:
    if path.suffix.lower() == ".csv":
        return parse_csv(path, project_id)
    return parse_xlsx(path, project_id)


def _apply_upsert(db: Session, parsed: TimesheetImportResult, import_id: int) -> dict[str, int]:
    counts = {"inserted": 0, "updated": 0, "skipped": 0}

    for row in parsed.rows:
        _upsert_cost_center(db, row)
        _upsert_resource(db, row)
        _upsert_week(db, row)

        existing = db.get(FactTimesheet, row.timesheet_id)
        if existing is None:
            db.add(_make_fact(row, import_id))
            db.flush()  # rende il record visibile alle get() successive nella stessa sessione
            counts["inserted"] += 1
        else:
            changed = _detect_changes(existing, row)
            if changed:
                _update_fact(existing, row, import_id)
                counts["updated"] += 1
            else:
                existing.last_seen_import_id = import_id
                counts["skipped"] += 1

    db.flush()
    return counts


def _mark_stale(db: Session, project_id: str, seen_ids: set[str], import_id: int) -> None:
    active = (
        db.query(FactTimesheet)
        .filter(FactTimesheet.project_id == project_id, FactTimesheet.is_stale == 0)
        .all()
    )
    for ts in active:
        if ts.timesheet_id not in seen_ids:
            ts.is_stale = 1
            ts.last_seen_import_id = import_id


def _upsert_cost_center(db: Session, row: TimesheetRow) -> None:
    if not row.resource_cost_center:
        return
    existing = db.get(DimCostCenter, row.resource_cost_center)
    if existing is None:
        db.add(DimCostCenter(
            cc_code=row.resource_cost_center,
            cc_name=row.resource_cost_center_name or row.resource_cost_center,
            bu=row.resource_bu,
            ou=row.resource_ou,
            los=row.resource_los,
            legal_entity=row.legal_entity,
        ))
        db.flush()


def _upsert_resource(db: Session, row: TimesheetRow) -> None:
    existing = db.get(DimResource, row.resource_id)
    if existing is None:
        db.add(DimResource(
            resource_id=row.resource_id,
            resource_name=row.resource_name or row.resource_id,
            job_title=row.job_title,
            resource_cost_center=row.resource_cost_center,
            legal_entity=row.legal_entity,
        ))
        db.flush()
    else:
        if row.job_title:
            existing.job_title = row.job_title
        if row.resource_cost_center:
            existing.resource_cost_center = row.resource_cost_center


def _upsert_week(db: Session, row: TimesheetRow) -> None:
    existing = db.get(DimWeek, row.week_id)
    if existing is None:
        _ensure_fiscal_calendar(db, row.fy)
        fy_month = _calc_fy_month(row.week_id, row.fy)
        db.add(DimWeek(
            week_id=row.week_id,
            week_end=row.week_end,
            month_id=row.month_id,
            fy=row.fy,
            fy_month=fy_month,
            fy_month_week=row.fy_month_week,
        ))
        db.flush()


def _ensure_fiscal_calendar(db: Session, fy: int) -> None:
    """Inserisce dim_fiscal_calendar se mancante (utile anche in test con DB in-memory)."""
    from datetime import date as _date
    if db.get(DimFiscalCalendar, fy) is None:
        db.add(DimFiscalCalendar(
            fy=fy,
            fy_start_date=_date(fy - 1, 7, 1),
            fy_end_date=_date(fy, 6, 30),
            label=f"FY{str(fy)[2:]}",
        ))
        db.flush()


def _calc_fy_month(week_id: str, fy: int) -> int:
    """Mese fiscale del lunedì: luglio=1, ..., giugno=12."""
    from datetime import date
    d = date.fromisoformat(week_id)
    # FY inizia a luglio; luglio del anno FY-1 = mese 1
    month = d.month
    return month - 6 if month >= 7 else month + 6


def _make_fact(row: TimesheetRow, import_id: int) -> FactTimesheet:
    return FactTimesheet(
        timesheet_id=row.timesheet_id,
        project_id=row.project_id,
        resource_id=row.resource_id,
        week_id=row.week_id,
        fy=row.fy,
        fy_month_week=row.fy_month_week,
        job_title=row.job_title,
        document_item_text=row.document_item_text,
        hours_actual=row.hours_actual,
        gross_revenue=row.gross_revenue,
        discount=row.discount,
        wip_provision=row.wip_provision,
        net_revenue_actual=row.net_revenue_actual,
        gross_rate=row.gross_rate,
        net_rate=row.net_rate,
        resource_cost_center=row.resource_cost_center,
        import_id=import_id,
        last_seen_import_id=import_id,
        is_stale=0,
    )


def _update_fact(existing: FactTimesheet, row: TimesheetRow, import_id: int) -> None:
    for field in ("hours_actual", "gross_revenue", "discount", "wip_provision",
                  "net_revenue_actual", "gross_rate", "net_rate", "job_title",
                  "document_item_text", "resource_cost_center"):
        setattr(existing, field, getattr(row, field))
    existing.import_id = import_id
    existing.last_seen_import_id = import_id
    existing.is_stale = 0


def _detect_changes(existing: FactTimesheet, row: TimesheetRow) -> bool:
    for field in ("hours_actual", "net_revenue_actual", "gross_rate", "net_rate",
                  "discount", "wip_provision"):
        a = getattr(existing, field)
        b = getattr(row, field)
        if a is None and b is None:
            continue
        if a is None or b is None:
            return True
        if abs(float(a) - float(b)) >= 0.005:
            return True
    return False
