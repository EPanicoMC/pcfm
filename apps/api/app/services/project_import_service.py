"""Orchestrazione import file 9: backup → parse → diff → upsert → stale → history."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from domain.importers.project_importer import (
    DiffRow,
    ProjectImportResult,
    ProjectRow,
    compute_diff,
    parse_csv,
    parse_xlsx,
)

from ..models.dimensions import DimClient, DimEngagementOwner
from ..models.facts import FactProject, FactProjectHistory, Import
from .backup_service import backup_db


def run_project_import(
    db: Session,
    file_path: Path,
    original_filename: str,
) -> dict[str, Any]:
    """Esegue import completo file 9. Restituisce riepilogo con contatori."""
    backup_path = backup_db()

    imp = Import(
        file_type="project",
        original_filename=original_filename,
        import_ts=datetime.now(tz=timezone.utc),
        backup_path=str(backup_path) if backup_path else None,
        status="in_progress",
    )
    db.add(imp)
    db.flush()  # ottieni import_id

    try:
        parsed = _parse(file_path)
        if not parsed.file_type_confirmed:
            raise ValueError("File non riconosciuto come file progetto (tipo 9)")

        existing = _load_existing(db)
        diffs = compute_diff(parsed.rows, existing)

        counts = _apply_upsert(db, parsed.rows, diffs, imp.import_id)
        _mark_stale(db, seen_ids={r.project_id for r in parsed.rows}, import_id=imp.import_id)

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
        "status": imp.status,
        "inserted": imp.rows_inserted,
        "updated": imp.rows_updated,
        "skipped": imp.rows_skipped,
        "errors": imp.rows_error,
        "parse_errors": parsed.parse_errors,
        "backup_path": str(backup_path) if backup_path else None,
    }


def preview_project_import(file_path: Path, db: Session) -> dict[str, Any]:
    """Calcola anteprima diff senza modificare il DB."""
    parsed = _parse(file_path)
    existing = _load_existing(db)
    diffs = compute_diff(parsed.rows, existing)

    return {
        "file_type": "project",
        "parse_errors": parsed.parse_errors,
        "diff": [
            {
                "project_id": d.project_id,
                "action": d.action,
                "changed_fields": d.changed_fields,
            }
            for d in diffs
        ],
        "summary": {
            "insert": sum(1 for d in diffs if d.action == "insert"),
            "update": sum(1 for d in diffs if d.action == "update"),
            "skip": sum(1 for d in diffs if d.action == "skip"),
            "parse_errors": len(parsed.parse_errors),
        },
    }


# ── Helpers interni ────────────────────────────────────────────────────────────

def _parse(path: Path) -> ProjectImportResult:
    if path.suffix.lower() == ".csv":
        return parse_csv(path)
    return parse_xlsx(path)


def _load_existing(db: Session) -> dict[str, dict[str, Any]]:
    projects = db.query(FactProject).all()
    return {p.project_id: _project_to_dict(p) for p in projects}


def _project_to_dict(p: FactProject) -> dict[str, Any]:
    return {
        c.name: getattr(p, c.name)
        for c in p.__table__.columns
        if c.name not in ("created_at", "updated_at", "last_import_id", "last_seen_import_id", "client_id", "is_stale")
    }


def _apply_upsert(
    db: Session,
    rows: list[ProjectRow],
    diffs: list[DiffRow],
    import_id: int,
) -> dict[str, int]:
    diff_map = {d.project_id: d for d in diffs}
    counts = {"inserted": 0, "updated": 0, "skipped": 0}

    for row in rows:
        diff = diff_map.get(row.project_id)
        if diff is None:
            continue

        if diff.action == "skip":
            counts["skipped"] += 1
            _touch_last_seen(db, row.project_id, import_id)
            continue

        client_id = _upsert_client(db, row.client_name, row.client_group)
        _upsert_engagement_owner(db, row.engagement_manager, "manager")
        _upsert_engagement_owner(db, row.engagement_partner, "partner")

        if diff.action == "insert":
            p = FactProject(
                project_id=row.project_id,
                client_id=client_id,
                last_import_id=import_id,
                last_seen_import_id=import_id,
                is_stale=0,
                **_row_to_fact_kwargs(row),
            )
            db.add(p)
            counts["inserted"] += 1

        elif diff.action == "update":
            p = db.get(FactProject, row.project_id)
            if p is None:
                continue
            snapshot = _project_to_dict(p)
            _update_fact_project(p, row, client_id, import_id)
            history = FactProjectHistory(
                project_id=row.project_id,
                import_id=import_id,
                snapshot_json=json.dumps(snapshot, default=str),
                changed_fields=json.dumps(diff.changed_fields),
            )
            db.add(history)
            counts["updated"] += 1

    db.flush()
    return counts


def _mark_stale(db: Session, seen_ids: set[str], import_id: int) -> None:
    all_projects = db.query(FactProject).filter(FactProject.is_stale == 0).all()
    for p in all_projects:
        if p.project_id not in seen_ids:
            p.is_stale = 1
            p.last_seen_import_id = import_id


def _touch_last_seen(db: Session, project_id: str, import_id: int) -> None:
    p = db.get(FactProject, project_id)
    if p:
        p.last_seen_import_id = import_id


def _upsert_client(db: Session, client_name: str | None, client_group: str | None) -> int | None:
    if not client_name:
        return None
    existing = db.query(DimClient).filter(DimClient.client_name == client_name).first()
    if existing:
        if client_group and existing.client_group != client_group:
            existing.client_group = client_group
        return existing.client_id
    new = DimClient(client_name=client_name, client_group=client_group)
    db.add(new)
    db.flush()
    return new.client_id


def _upsert_engagement_owner(db: Session, name: str | None, role: str) -> None:
    if not name:
        return
    existing = db.query(DimEngagementOwner).filter(DimEngagementOwner.name == name).first()
    if not existing:
        db.add(DimEngagementOwner(name=name, role=role))


def _row_to_fact_kwargs(row: ProjectRow) -> dict[str, Any]:
    excluded = {"client_name", "client_group", "project_id"}
    return {k: v for k, v in row.to_dict().items() if k not in excluded}


def _update_fact_project(p: FactProject, row: ProjectRow, client_id: int | None, import_id: int) -> None:
    for k, v in _row_to_fact_kwargs(row).items():
        if hasattr(p, k):
            setattr(p, k, v)
    p.client_id = client_id
    p.last_import_id = import_id
    p.last_seen_import_id = import_id
    p.is_stale = 0
