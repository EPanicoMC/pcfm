"""Test WP4: import file 8 (timesheet) con project_id dal filename."""

from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from apps.api.app.database import Base
from apps.api.app.models import (  # registra tutti i model
    DimCostCenter, DimResource, DimWeek, FactProject, FactTimesheet, Import
)
from apps.api.app.services.timesheet_import_service import (
    preview_timesheet_import,
    run_timesheet_import,
)
from apps.api.app.services.project_import_service import run_project_import
from domain.importers.timesheet_importer import (
    extract_project_id_from_filename,
    is_timesheet_file,
    make_timesheet_id,
    normalize_fy,
    parse_csv,
    parse_week_range,
    parse_xlsx,
)

FIXTURES = Path(__file__).parent / "fixtures"
TIMESHEET_CSV = FIXTURES / "timesheet_ITE00065885_1_1.csv"
PROJECTS_CSV = FIXTURES / "projects.csv"
SAMPLES_DIR = Path(__file__).parents[1] / "samples"
TIMESHEET_XLSX = SAMPLES_DIR / "ITE00065885.1.1.xlsx"
PROJECT_ID = "ITE00065885.1.1"


# ── DB in-memory ───────────────────────────────────────────────────────────────

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


@pytest.fixture()
def db_with_project(db):
    """DB con il progetto ITE00065885.1.1 già importato."""
    run_project_import(db, PROJECTS_CSV, "projects.csv")
    return db


# ── Test utility functions ─────────────────────────────────────────────────────

def test_extract_project_id_from_filename():
    assert extract_project_id_from_filename("ITE00065885.1.1.xlsx") == "ITE00065885.1.1"
    assert extract_project_id_from_filename("ITE00065885.1.1") == "ITE00065885.1.1"
    assert extract_project_id_from_filename("data (8).xlsx") == "data (8)"


def test_normalize_fy():
    assert normalize_fy("FY26") == 2026
    assert normalize_fy("FY23") == 2023
    assert normalize_fy(None) is None


def test_make_timesheet_id_deterministic():
    id1 = make_timesheet_id("50093556", "ITE00065885.1.1", "2026-03-29")
    id2 = make_timesheet_id("50093556", "ITE00065885.1.1", "2026-03-29")
    assert id1 == id2
    assert len(id1) == 64  # sha256 hex


def test_make_timesheet_id_unique():
    id1 = make_timesheet_id("50093556", "ITE00065885.1.1", "2026-03-29")
    id2 = make_timesheet_id("50093556", "ITE00065885.1.1", "2026-04-05")
    assert id1 != id2


def test_parse_week_range_normal():
    start, end = parse_week_range("29 Mar - 04 Apr", 2026)
    assert start == date(2026, 3, 29)
    assert end == date(2026, 4, 4)


def test_parse_week_range_year_boundary():
    # Settimana che attraversa il confine di anno solare
    start, end = parse_week_range("30 Dec - 05 Jan", 2025)
    assert start == date(2025, 12, 30)
    assert end == date(2026, 1, 5)


def test_parse_week_range_same_month():
    start, end = parse_week_range("05 Apr - 11 Apr", 2026)
    assert start == date(2026, 4, 5)
    assert end == date(2026, 4, 11)
    # week_id = lunedì → month_id = 2026-04
    assert f"{start.year}-{start.month:02d}" == "2026-04"


def test_is_timesheet_file_true():
    assert is_timesheet_file(["FY", "Resource ID", "Week Range", "Hours Actual"]) is True


def test_is_timesheet_file_false():
    assert is_timesheet_file(["Project ID", "Net Revenue (IOW)"]) is False


# ── Test parsing CSV fixture ───────────────────────────────────────────────────

def test_parse_csv_returns_10_rows():
    result = parse_csv(TIMESHEET_CSV, PROJECT_ID)
    assert len(result.rows) == 10
    assert result.parse_errors == []
    assert result.file_type_confirmed is True


def test_parse_csv_project_id_set():
    result = parse_csv(TIMESHEET_CSV, PROJECT_ID)
    assert all(r.project_id == PROJECT_ID for r in result.rows)


def test_parse_csv_week_ids():
    result = parse_csv(TIMESHEET_CSV, PROJECT_ID)
    week_ids = {r.week_id for r in result.rows}
    assert "2026-03-29" in week_ids  # 29 Mar - 04 Apr
    assert "2026-04-05" in week_ids  # 05 Apr - 11 Apr
    assert "2026-05-03" in week_ids  # 03 May - 09 May


def test_parse_csv_month_rule():
    """La settimana '29 Mar - 04 Apr' deve avere month_id='2026-03' (regola: mese del lunedì)."""
    result = parse_csv(TIMESHEET_CSV, PROJECT_ID)
    mar_rows = [r for r in result.rows if r.week_id == "2026-03-29"]
    assert all(r.month_id == "2026-03" for r in mar_rows)


def test_parse_csv_numeric_fields():
    result = parse_csv(TIMESHEET_CSV, PROJECT_ID)
    cosimo_week1 = next(r for r in result.rows if r.resource_id == "50093556" and r.week_id == "2026-03-29")
    assert cosimo_week1.hours_actual == pytest.approx(4.0)
    assert cosimo_week1.net_revenue_actual == pytest.approx(181.12)
    assert cosimo_week1.gross_rate == pytest.approx(165.0)
    assert cosimo_week1.net_rate == pytest.approx(45.28)
    assert cosimo_week1.discount == pytest.approx(-478.88)


def test_parse_csv_cost_center():
    result = parse_csv(TIMESHEET_CSV, PROJECT_ID)
    ccs = {r.resource_cost_center for r in result.rows}
    assert "IT25000492" in ccs
    assert "IT25000131" in ccs


@pytest.mark.skipif(not TIMESHEET_XLSX.exists(), reason="file sample non disponibile")
def test_parse_xlsx_real_file():
    result = parse_xlsx(TIMESHEET_XLSX, PROJECT_ID)
    # 98 righe dati valide (con WeekRange + ResourceID), grand total e footer già filtrati
    assert len(result.rows) == 98
    assert result.parse_errors == []


# ── Test upsert completo ───────────────────────────────────────────────────────

def test_first_import_inserts_rows(db_with_project):
    result = run_timesheet_import(db_with_project, TIMESHEET_CSV, f"{PROJECT_ID}.csv")
    assert result["inserted"] == 10
    assert result["updated"] == 0
    assert result["skipped"] == 0
    assert result["status"] == "success"
    assert result["project_id"] == PROJECT_ID


def test_dim_cost_center_populated(db_with_project):
    run_timesheet_import(db_with_project, TIMESHEET_CSV, f"{PROJECT_ID}.csv")
    ccs = db_with_project.query(DimCostCenter).all()
    cc_codes = {c.cc_code for c in ccs}
    assert "IT25000492" in cc_codes
    assert "IT25000131" in cc_codes
    assert "IT25000684" in cc_codes


def test_dim_resource_populated(db_with_project):
    run_timesheet_import(db_with_project, TIMESHEET_CSV, f"{PROJECT_ID}.csv")
    resources = db_with_project.query(DimResource).all()
    resource_ids = {r.resource_id for r in resources}
    assert "50093556" in resource_ids  # Cosimo Lo Iacono
    assert "50094832" in resource_ids  # Alessandro Fonio


def test_dim_week_populated(db_with_project):
    run_timesheet_import(db_with_project, TIMESHEET_CSV, f"{PROJECT_ID}.csv")
    weeks = db_with_project.query(DimWeek).all()
    week_ids = {w.week_id for w in weeks}
    assert "2026-03-29" in week_ids
    assert "2026-04-05" in week_ids


def test_dim_week_month_id_rule(db_with_project):
    """Verifica regola 'mese del lunedì'."""
    run_timesheet_import(db_with_project, TIMESHEET_CSV, f"{PROJECT_ID}.csv")
    week = db_with_project.get(DimWeek, "2026-03-29")
    assert week is not None
    assert week.month_id == "2026-03"


def test_second_import_idempotent(db_with_project):
    run_timesheet_import(db_with_project, TIMESHEET_CSV, f"{PROJECT_ID}.csv")
    result2 = run_timesheet_import(db_with_project, TIMESHEET_CSV, f"{PROJECT_ID}.csv")
    assert result2["inserted"] == 0
    assert result2["skipped"] == 10


def test_import_record_saved(db_with_project):
    run_timesheet_import(db_with_project, TIMESHEET_CSV, f"{PROJECT_ID}.csv")
    imp = db_with_project.query(Import).filter(Import.file_type == "timesheet").first()
    assert imp is not None
    assert imp.project_id_extracted == PROJECT_ID
    assert imp.rows_inserted == 10


def test_stale_marking(db_with_project, tmp_path):
    run_timesheet_import(db_with_project, TIMESHEET_CSV, f"{PROJECT_ID}.csv")

    # Import parziale: solo 2 righe (week 2026-03-29, risorse 50093556 e 50094832)
    import csv
    with open(TIMESHEET_CSV) as f:
        all_rows = list(csv.DictReader(f))
    partial = [r for r in all_rows if r["week_range"] == "29 Mar - 04 Apr"
               and r["resource_id"] in ("50093556", "50094832")]

    partial_file = tmp_path / f"{PROJECT_ID}.csv"
    with open(partial_file, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=all_rows[0].keys())
        writer.writeheader()
        writer.writerows(partial)

    run_timesheet_import(db_with_project, partial_file, f"{PROJECT_ID}.csv")

    stale = db_with_project.query(FactTimesheet).filter(FactTimesheet.is_stale == 1).all()
    assert len(stale) == 8  # 10 - 2 = 8 diventano stale


def test_preview_returns_diff(db_with_project):
    preview = preview_timesheet_import(TIMESHEET_CSV, f"{PROJECT_ID}.csv", db_with_project)
    assert preview["file_type"] == "timesheet"
    assert preview["project_id"] == PROJECT_ID
    assert preview["summary"]["insert"] == 10


@pytest.mark.skipif(not TIMESHEET_XLSX.exists(), reason="file sample non disponibile")
def test_import_real_xlsx(db_with_project):
    result = run_timesheet_import(db_with_project, TIMESHEET_XLSX, "ITE00065885.1.1.xlsx")
    assert result["status"] == "success"
    assert result["project_id"] == "ITE00065885.1.1"
    # 98 righe valide, ogni (resource_id, fy_month_week) è unico → 98 insert
    assert result["inserted"] == 98
    assert result["updated"] == 0
    assert result["skipped"] == 0


@pytest.mark.skipif(not TIMESHEET_XLSX.exists(), reason="file sample non disponibile")
def test_import_real_xlsx_nr_total(db_with_project):
    """Verifica che la somma NR importata corrisponda al grand total del file."""
    run_timesheet_import(db_with_project, TIMESHEET_XLSX, "ITE00065885.1.1.xlsx")
    from apps.api.app.models.facts import FactTimesheet
    from sqlalchemy import func
    total_nr = db_with_project.query(
        func.sum(FactTimesheet.net_revenue_actual)
    ).filter(FactTimesheet.project_id == PROJECT_ID, FactTimesheet.is_stale == 0).scalar()
    assert total_nr == pytest.approx(121304.95, abs=1.0)
