"""Test WP2: verifica che lo schema SQLite sia corretto dopo make migrate."""

import sqlite3
from pathlib import Path

import pytest

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "pcfm.db"

EXPECTED_TABLES = {
    "dim_fiscal_calendar",
    "dim_week",
    "dim_client",
    "dim_cost_center",
    "dim_resource",
    "dim_engagement_owner",
    "dim_assumption",
    "fact_project",
    "fact_project_history",
    "fact_timesheet",
    "forecast_override",
    "imports",
    "audit_log",
}

DEFAULT_ASSUMPTIONS = {
    "hours_per_man_day": 8.0,
    "working_days_per_month": 21.0,
    "fte_hours_per_year": 1700.0,
    "fy_start_month": 7.0,
    "backup_retention_years": 2.0,
}

DEFAULT_ASSUMPTION_STRINGS = {
    "forecast_window_default": "last_month",
}

EXPECTED_FISCAL_YEARS = [2023, 2024, 2025, 2026, 2027, 2028]


@pytest.fixture(scope="module")
def conn():
    if not DB_PATH.exists():
        pytest.skip("DB non trovato — eseguire 'make migrate' prima dei test")
    c = sqlite3.connect(DB_PATH)
    yield c
    c.close()


def test_all_tables_exist(conn):
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    tables = {r[0] for r in rows}
    missing = EXPECTED_TABLES - tables
    assert not missing, f"Tabelle mancanti: {missing}"


def test_dim_assumption_defaults(conn):
    rows = conn.execute("SELECT key, value_num FROM dim_assumption WHERE value_num IS NOT NULL").fetchall()
    actual = {k: v for k, v in rows}
    for key, expected in DEFAULT_ASSUMPTIONS.items():
        assert key in actual, f"Assunzione '{key}' mancante"
        assert actual[key] == pytest.approx(expected), f"'{key}': atteso {expected}, trovato {actual[key]}"


def test_dim_assumption_string_defaults(conn):
    rows = conn.execute("SELECT key, value_str FROM dim_assumption WHERE value_str IS NOT NULL").fetchall()
    actual = {k: v for k, v in rows}
    for key, expected in DEFAULT_ASSUMPTION_STRINGS.items():
        assert key in actual, f"Assunzione stringa '{key}' mancante"
        assert actual[key] == expected


def test_fiscal_calendar_populated(conn):
    rows = conn.execute("SELECT fy FROM dim_fiscal_calendar ORDER BY fy").fetchall()
    fys = [r[0] for r in rows]
    assert fys == EXPECTED_FISCAL_YEARS


def test_fiscal_calendar_fy26_dates(conn):
    row = conn.execute(
        "SELECT fy_start_date, fy_end_date, label FROM dim_fiscal_calendar WHERE fy = 2026"
    ).fetchone()
    assert row is not None
    start, end, label = row
    assert start == "2025-07-01"
    assert end == "2026-06-30"
    assert label == "FY26"


def test_fact_project_columns(conn):
    expected_cols = {
        "project_id", "project_title", "client_id", "project_status",
        "iow_hours_total", "iow_net_revenue", "is_stale", "bi_real_pct_todo",
        "hours_actual", "net_revenue_act", "discount",
    }
    info = conn.execute("PRAGMA table_info(fact_project)").fetchall()
    cols = {r[1] for r in info}
    missing = expected_cols - cols
    assert not missing, f"Colonne mancanti in fact_project: {missing}"


def test_fact_timesheet_columns(conn):
    expected_cols = {
        "timesheet_id", "project_id", "resource_id", "week_id", "fy",
        "hours_actual", "net_revenue_actual", "net_rate", "resource_cost_center",
        "is_stale",
    }
    info = conn.execute("PRAGMA table_info(fact_timesheet)").fetchall()
    cols = {r[1] for r in info}
    missing = expected_cols - cols
    assert not missing, f"Colonne mancanti in fact_timesheet: {missing}"


def test_forecast_override_unique_constraint(conn):
    # Verifica che esista l'indice unique su (project_id, month_id)
    indexes = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='forecast_override'"
    ).fetchall()
    index_names = {r[0] for r in indexes}
    assert "uq_override_project_month" in index_names


def test_migrate_idempotent():
    """make migrate può essere rieseguito senza errori."""
    import subprocess

    result = subprocess.run(
        [".venv/bin/alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
        cwd=Path(__file__).resolve().parents[1],
    )
    assert result.returncode == 0, f"alembic upgrade head fallito:\n{result.stderr}"
