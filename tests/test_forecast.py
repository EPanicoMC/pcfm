"""Test WP5: logica forecast (engine puro) e servizio DB."""

from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from apps.api.app.database import Base
from apps.api.app.models import DimCostCenter, DimResource, DimWeek, FactProject, FactTimesheet, Import
from apps.api.app.services.forecast_service import get_project_forecast, upsert_forecast_override, delete_forecast_override
from apps.api.app.services.project_import_service import run_project_import
from apps.api.app.services.timesheet_import_service import run_timesheet_import
from domain.forecast import (
    MonthlyPoint,
    calc_data_esaurimento,
    calc_forecast_fy,
    calc_mesi_residui,
    calc_residuo,
    calc_run_rate,
    calc_scenari,
    fy_month_ids,
    is_at_risk,
)

FIXTURES = Path(__file__).parent / "fixtures"
TIMESHEET_CSV = FIXTURES / "timesheet_ITE00065885_1_1.csv"
PROJECTS_CSV = FIXTURES / "projects.csv"
PROJECT_ID = "ITE00065885.1.1"


# ── DB fixture ─────────────────────────────────────────────────────────────────

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
def db_with_timesheet(db):
    run_project_import(db, PROJECTS_CSV, "projects.csv")
    run_timesheet_import(db, TIMESHEET_CSV, f"{PROJECT_ID}.csv")
    return db


# ── Test fy_month_ids ──────────────────────────────────────────────────────────

def test_fy_month_ids_fy26():
    months = fy_month_ids(2026)
    assert months[0] == "2025-07"
    assert months[-1] == "2026-06"
    assert len(months) == 12


def test_fy_month_ids_fy23():
    months = fy_month_ids(2023)
    assert months[0] == "2022-07"
    assert months[-1] == "2023-06"


# ── Test calc_run_rate ──────────────────────────────────────────────────────────

@pytest.fixture()
def three_months():
    return [
        MonthlyPoint("2026-01", hours=80.0, net_revenue=4000.0),
        MonthlyPoint("2026-02", hours=100.0, net_revenue=5000.0),
        MonthlyPoint("2026-03", hours=120.0, net_revenue=6000.0),
    ]


def test_run_rate_last_month(three_months):
    rr = calc_run_rate(three_months, "last_month")
    assert rr.hours == pytest.approx(120.0)
    assert rr.net_revenue == pytest.approx(6000.0)
    assert rr.months_used == 1


def test_run_rate_last_3_months(three_months):
    rr = calc_run_rate(three_months, "last_3_months")
    assert rr.hours == pytest.approx(100.0)        # (80+100+120)/3
    assert rr.net_revenue == pytest.approx(5000.0)  # (4000+5000+6000)/3
    assert rr.months_used == 3


def test_run_rate_weighted(three_months):
    # pesi: mar=3, feb=2, gen=1 → totale_peso=6
    rr = calc_run_rate(three_months, "weighted")
    expected_h = (120*3 + 100*2 + 80*1) / 6  # = 106.666...
    assert rr.hours == pytest.approx(expected_h, rel=1e-4)
    assert rr.months_used == 3


def test_run_rate_empty():
    rr = calc_run_rate([], "last_month")
    assert rr.hours is None
    assert rr.months_used == 0


def test_run_rate_fewer_than_3(three_months):
    rr = calc_run_rate(three_months[:1], "last_3_months")
    assert rr.months_used == 1
    assert rr.hours == pytest.approx(80.0)


def test_run_rate_invalid_window(three_months):
    with pytest.raises(ValueError, match="window non supportata"):
        calc_run_rate(three_months, "invalid")


# ── Test calc_residuo ──────────────────────────────────────────────────────────

def test_residuo_normal():
    residuo_ore, residuo_eur = calc_residuo(1000.0, 400.0, 50000.0, 20000.0)
    assert residuo_ore == pytest.approx(600.0)
    assert residuo_eur == pytest.approx(30000.0)


def test_residuo_none_budget():
    residuo_ore, residuo_eur = calc_residuo(None, 400.0, None, 20000.0)
    assert residuo_ore is None
    assert residuo_eur is None


def test_residuo_overrun():
    residuo_ore, _ = calc_residuo(100.0, 150.0, 5000.0, 7000.0)
    assert residuo_ore == pytest.approx(-50.0)


# ── Test calc_mesi_residui ─────────────────────────────────────────────────────

def test_mesi_residui_normal():
    r = calc_mesi_residui(300.0, 100.0)
    assert r == pytest.approx(3.0)


def test_mesi_residui_none_residuo():
    assert calc_mesi_residui(None, 100.0) is None


def test_mesi_residui_zero_run_rate():
    assert calc_mesi_residui(300.0, 0.0) is None


# ── Test calc_data_esaurimento ─────────────────────────────────────────────────

def test_data_esaurimento_normal():
    today = date(2026, 5, 10)
    result = calc_data_esaurimento(today, 2.3)
    # ceil(2.3) = 3 mesi → agosto 2026 → 31 agosto
    assert result == date(2026, 8, 31)


def test_data_esaurimento_exact():
    today = date(2026, 5, 10)
    result = calc_data_esaurimento(today, 2.0)
    # ceil(2.0) = 2 → luglio 2026 → 31 luglio
    assert result == date(2026, 7, 31)


def test_data_esaurimento_none():
    assert calc_data_esaurimento(date(2026, 5, 10), None) is None


def test_data_esaurimento_year_boundary():
    today = date(2026, 11, 1)
    result = calc_data_esaurimento(today, 3.0)
    # 3 mesi da nov → feb 2027 → 28 feb
    assert result == date(2027, 2, 28)


# ── Test calc_scenari ──────────────────────────────────────────────────────────

def test_scenari_normal(three_months):
    s = calc_scenari(three_months)
    assert s["low"] <= s["base"] <= s["high"]
    assert s["base"] == pytest.approx(100.0)  # mediana = 100


def test_scenari_single_point():
    pts = [MonthlyPoint("2026-01", 80.0, 4000.0)]
    s = calc_scenari(pts)
    assert s["low"] == s["base"] == s["high"] == pytest.approx(80.0)


def test_scenari_empty():
    s = calc_scenari([])
    assert s == {"low": None, "base": None, "high": None}


# ── Test calc_forecast_fy ──────────────────────────────────────────────────────

def test_forecast_fy_no_overrides():
    result = calc_forecast_fy(
        actual_ytd_net_revenue=30000.0,
        run_rate_net_revenue=5000.0,
        future_month_ids=["2026-05", "2026-06"],
        overrides={},
    )
    assert result == pytest.approx(40000.0)  # 30000 + 5000*2


def test_forecast_fy_with_override():
    result = calc_forecast_fy(
        actual_ytd_net_revenue=30000.0,
        run_rate_net_revenue=5000.0,
        future_month_ids=["2026-05", "2026-06"],
        overrides={"2026-05": 3000.0},  # mese 5 overrideato
    )
    assert result == pytest.approx(38000.0)  # 30000 + 3000 + 5000


def test_forecast_fy_no_data_returns_none():
    result = calc_forecast_fy(0.0, None, ["2026-05"], {})
    assert result is None


# ── Test is_at_risk ────────────────────────────────────────────────────────────
# Soglia default: 30 giorni (abbassata da 60)

def test_at_risk_within_30d():
    # 20 giorni → a rischio con soglia 30
    assert is_at_risk(date(2026, 5, 30), date(2026, 5, 10), "Active") is True


def test_at_risk_exact_30d():
    # esattamente 30 giorni → a rischio
    assert is_at_risk(date(2026, 6, 9), date(2026, 5, 10), "Active") is True


def test_not_at_risk_31d():
    # 51 giorni → NON a rischio con soglia 30 (era True con soglia 60)
    assert is_at_risk(date(2026, 6, 30), date(2026, 5, 10), "Active") is False


def test_not_at_risk_far():
    assert is_at_risk(date(2026, 12, 31), date(2026, 5, 10), "Active") is False


def test_not_at_risk_in_chiusura():
    assert is_at_risk(date(2026, 5, 20), date(2026, 5, 10), "In Chiusura") is False


def test_not_at_risk_no_date():
    assert is_at_risk(None, date(2026, 5, 10), "Active") is False


# ── Test servizio DB ───────────────────────────────────────────────────────────

def test_get_project_forecast_returns_keys(db_with_timesheet):
    result = get_project_forecast(db_with_timesheet, PROJECT_ID)
    assert result["project_id"] == PROJECT_ID
    assert "run_rate" in result
    assert "residuo_ore" in result
    assert "data_esaurimento" in result
    assert "scenari_nr" in result
    assert "scenari_ore" in result
    assert "forecast_fy_net_revenue" in result
    assert "monthly_actuals" in result


def test_get_project_forecast_has_actuals(db_with_timesheet):
    result = get_project_forecast(db_with_timesheet, PROJECT_ID)
    assert result["ts_hours_total"] > 0
    assert len(result["monthly_actuals"]) > 0


def test_get_project_forecast_not_found(db_with_timesheet):
    result = get_project_forecast(db_with_timesheet, "NONEXISTENT")
    assert "error" in result


def test_override_upsert_and_delete(db_with_timesheet):
    override = upsert_forecast_override(
        db_with_timesheet,
        project_id=PROJECT_ID,
        month_id="2026-05",
        override_hours=None,
        override_net_revenue=9999.0,
        note="test override",
    )
    assert override["override_net_revenue"] == pytest.approx(9999.0)

    # Forecast ora usa override
    result = get_project_forecast(db_with_timesheet, PROJECT_ID)
    assert any(o["month_id"] == "2026-05" for o in result["overrides"])

    # Delete
    deleted = delete_forecast_override(db_with_timesheet, PROJECT_ID, "2026-05")
    assert deleted is True

    # Double delete = False
    assert delete_forecast_override(db_with_timesheet, PROJECT_ID, "2026-05") is False


def test_override_upsert_idempotent(db_with_timesheet):
    upsert_forecast_override(db_with_timesheet, PROJECT_ID, "2026-06", None, 5000.0, None)
    updated = upsert_forecast_override(db_with_timesheet, PROJECT_ID, "2026-06", None, 7000.0, "aggiornato")
    assert updated["override_net_revenue"] == pytest.approx(7000.0)
    assert updated["note"] == "aggiornato"
