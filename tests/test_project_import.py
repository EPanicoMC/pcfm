"""Test WP3: import file 9 (progetti) con upsert idempotente."""

import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from apps.api.app.database import Base
from apps.api.app.models import (  # registra tutti i model
    DimAssumption, DimClient, DimEngagementOwner, FactProject, FactProjectHistory, Import
)
from apps.api.app.services.project_import_service import (
    preview_project_import,
    run_project_import,
)
from domain.importers.project_importer import (
    compute_diff,
    is_project_file,
    parse_csv,
    parse_xlsx,
)

FIXTURES = Path(__file__).parent / "fixtures"
PROJECTS_CSV = FIXTURES / "projects.csv"
SAMPLES_DIR = Path(__file__).parents[1] / "samples"
PROJECTS_XLSX = SAMPLES_DIR / "data (9).xlsx"


# ── DB in-memory per i test ────────────────────────────────────────────────────

@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def set_pragmas(conn, _):
        conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


# ── Test parsing CSV ───────────────────────────────────────────────────────────

def test_parse_csv_returns_4_rows():
    result = parse_csv(PROJECTS_CSV)
    assert len(result.rows) == 4
    assert result.parse_errors == []
    assert result.file_type_confirmed is True


def test_parse_csv_project_ids():
    result = parse_csv(PROJECTS_CSV)
    ids = {r.project_id for r in result.rows}
    assert ids == {"ITE00041182.1.1", "ITE00067805.1.1", "ITE00065885.1.1", "ITE00060655.1.1"}


def test_parse_csv_numeric_fields():
    result = parse_csv(PROJECTS_CSV)
    a2a_f26 = next(r for r in result.rows if r.project_id == "ITE00065885.1.1")
    assert a2a_f26.iow_hours_total == pytest.approx(3952.0)
    assert a2a_f26.iow_net_revenue == pytest.approx(256381.67)
    assert a2a_f26.discount < 0  # discount sempre negativo


def test_parse_csv_status_values():
    result = parse_csv(PROJECTS_CSV)
    statuses = {r.project_id: r.project_status for r in result.rows}
    assert statuses["ITE00060655.1.1"] == "In Chiusura"
    assert statuses["ITE00065885.1.1"] == "Aperto"


@pytest.mark.skipif(not PROJECTS_XLSX.exists(), reason="file sample non disponibile")
def test_parse_xlsx_real_file():
    result = parse_xlsx(PROJECTS_XLSX)
    assert len(result.rows) == 4
    assert result.parse_errors == []


# ── Test detect tipo file ──────────────────────────────────────────────────────

def test_is_project_file_true():
    assert is_project_file(["Project ID", "Net Revenue (IOW)", "Hours Actual"]) is True


def test_is_project_file_false_missing_col():
    assert is_project_file(["Resource ID", "Week Range"]) is False


# ── Test compute_diff ──────────────────────────────────────────────────────────

def test_diff_all_insert_when_empty():
    result = parse_csv(PROJECTS_CSV)
    diffs = compute_diff(result.rows, existing={})
    assert all(d.action == "insert" for d in diffs)
    assert len(diffs) == 4


def test_diff_all_skip_when_identical(db):
    result = parse_csv(PROJECTS_CSV)
    # Prima passata: insert
    run_project_import(db, PROJECTS_CSV, "projects.csv")
    # Seconda passata: tutto skip
    diffs_data = preview_project_import(PROJECTS_CSV, db)
    assert diffs_data["summary"]["insert"] == 0
    assert diffs_data["summary"]["update"] == 0
    assert diffs_data["summary"]["skip"] == 4


# ── Test upsert completo ───────────────────────────────────────────────────────

def test_first_import_inserts_4_projects(db):
    result = run_project_import(db, PROJECTS_CSV, "projects.csv")
    assert result["inserted"] == 4
    assert result["updated"] == 0
    assert result["skipped"] == 0
    assert result["errors"] == 0
    assert result["status"] == "success"


def test_dim_client_populated(db):
    run_project_import(db, PROJECTS_CSV, "projects.csv")
    clients = db.query(DimClient).all()
    names = {c.client_name for c in clients}
    assert "GIORGIO ARMANI SPA" in names
    assert "A2A ENERGIA SPA" in names


def test_dim_engagement_owner_populated(db):
    run_project_import(db, PROJECTS_CSV, "projects.csv")
    owners = db.query(DimEngagementOwner).all()
    names = {o.name for o in owners}
    assert "Enrico Panico" in names
    assert "Fabio Castignetti" in names
    assert "Massimo Ferriani" in names


def test_second_import_is_idempotent(db):
    run_project_import(db, PROJECTS_CSV, "projects.csv")
    result2 = run_project_import(db, PROJECTS_CSV, "projects.csv")
    assert result2["inserted"] == 0
    assert result2["updated"] == 0
    assert result2["skipped"] == 4


def test_update_creates_history(db, tmp_path):
    run_project_import(db, PROJECTS_CSV, "projects.csv")

    # Modifica una riga nel CSV: cambia project_status di ITE00060655 → "Chiuso"
    import csv, io
    with open(PROJECTS_CSV) as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        if row["project_id"] == "ITE00060655.1.1":
            row["project_status"] = "Chiuso"

    modified = tmp_path / "projects_mod.csv"
    with open(modified, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    result = run_project_import(db, modified, "projects_mod.csv")
    assert result["updated"] == 1
    assert result["skipped"] == 3

    # Verifica history
    history = db.query(FactProjectHistory).filter(
        FactProjectHistory.project_id == "ITE00060655.1.1"
    ).all()
    assert len(history) == 1
    changed = json.loads(history[0].changed_fields)
    assert "project_status" in changed


def test_stale_marking(db, tmp_path):
    run_project_import(db, PROJECTS_CSV, "projects.csv")

    # CSV con solo 2 progetti (gli altri diventano stale)
    import csv
    with open(PROJECTS_CSV) as f:
        all_rows = list(csv.DictReader(f))
    partial_rows = [r for r in all_rows if r["project_id"] in ("ITE00041182.1.1", "ITE00067805.1.1")]

    partial = tmp_path / "partial.csv"
    with open(partial, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=all_rows[0].keys())
        writer.writeheader()
        writer.writerows(partial_rows)

    run_project_import(db, partial, "partial.csv")
    stale = db.query(FactProject).filter(FactProject.is_stale == 1).all()
    stale_ids = {p.project_id for p in stale}
    assert "ITE00065885.1.1" in stale_ids
    assert "ITE00060655.1.1" in stale_ids
    assert "ITE00041182.1.1" not in stale_ids


def test_import_record_in_db(db):
    run_project_import(db, PROJECTS_CSV, "projects.csv")
    imports = db.query(Import).all()
    assert len(imports) == 1
    assert imports[0].file_type == "project"
    assert imports[0].status == "success"
    assert imports[0].rows_inserted == 4


def test_preview_returns_diff(db):
    preview = preview_project_import(PROJECTS_CSV, db)
    assert preview["file_type"] == "project"
    assert preview["summary"]["insert"] == 4
    assert preview["summary"]["update"] == 0
    assert len(preview["diff"]) == 4
