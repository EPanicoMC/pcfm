from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Import(Base):
    __tablename__ = "imports"

    import_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    file_type: Mapped[str] = mapped_column(String, nullable=False)
    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    project_id_extracted: Mapped[str | None] = mapped_column(String, nullable=True)
    import_ts: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    rows_inserted: Mapped[int] = mapped_column(Integer, default=0)
    rows_updated: Mapped[int] = mapped_column(Integer, default=0)
    rows_skipped: Mapped[int] = mapped_column(Integer, default=0)
    rows_error: Mapped[int] = mapped_column(Integer, default=0)
    backup_path: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="in_progress")
    log_path: Mapped[str | None] = mapped_column(String, nullable=True)


class FactProject(Base):
    __tablename__ = "fact_project"

    project_id: Mapped[str] = mapped_column(String, primary_key=True)
    project_title: Mapped[str | None] = mapped_column(String, nullable=True)
    client_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("dim_client.client_id"), nullable=True)
    debtor_account: Mapped[str | None] = mapped_column(String, nullable=True)
    legal_entity: Mapped[str | None] = mapped_column(String, nullable=True)
    product_code: Mapped[str | None] = mapped_column(String, nullable=True)
    opportunity_name: Mapped[str | None] = mapped_column(String, nullable=True)
    chargeable: Mapped[str | None] = mapped_column(String, nullable=True)
    project_status: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    fy_closing: Mapped[int | None] = mapped_column(Integer, nullable=True)
    project_closing_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    engagement_manager: Mapped[str | None] = mapped_column(String, nullable=True)
    engagement_manager_cc: Mapped[str | None] = mapped_column(String, nullable=True)
    engagement_partner: Mapped[str | None] = mapped_column(String, nullable=True)
    engagement_partner_cc: Mapped[str | None] = mapped_column(String, nullable=True)
    hours_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    gross_revenue: Mapped[float | None] = mapped_column(Float, nullable=True)
    bi_real_pct_todo: Mapped[float | None] = mapped_column(Float, nullable=True)
    discount: Mapped[float | None] = mapped_column(Float, nullable=True)
    wip_provision: Mapped[float | None] = mapped_column(Float, nullable=True)
    net_revenue_act: Mapped[float | None] = mapped_column(Float, nullable=True)
    fees_as_expenses: Mapped[float | None] = mapped_column(Float, nullable=True)
    expenses_act: Mapped[float | None] = mapped_column(Float, nullable=True)
    lump_sum_act: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_expenses_act: Mapped[float | None] = mapped_column(Float, nullable=True)
    billed_fees: Mapped[float | None] = mapped_column(Float, nullable=True)
    billed_expenses: Mapped[float | None] = mapped_column(Float, nullable=True)
    billed_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    wip: Mapped[float | None] = mapped_column(Float, nullable=True)
    margin_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    iow_hours_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    iow_contract_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    iow_net_revenue: Mapped[float | None] = mapped_column(Float, nullable=True)
    iow_expenses: Mapped[float | None] = mapped_column(Float, nullable=True)
    iow_lump_sum: Mapped[float | None] = mapped_column(Float, nullable=True)
    bi_report_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_import_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("imports.import_id"), nullable=True)
    is_stale: Mapped[int] = mapped_column(Integer, default=0, index=True)
    last_seen_import_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("imports.import_id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    client: Mapped["DimClient | None"] = relationship(back_populates="projects")  # type: ignore[name-defined]
    history: Mapped[list["FactProjectHistory"]] = relationship(back_populates="project")
    timesheets: Mapped[list["FactTimesheet"]] = relationship(back_populates="project")
    overrides: Mapped[list["ForecastOverride"]] = relationship(back_populates="project")


class FactProjectHistory(Base):
    __tablename__ = "fact_project_history"

    history_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(String, ForeignKey("fact_project.project_id"), nullable=False, index=True)
    import_id: Mapped[int] = mapped_column(Integer, ForeignKey("imports.import_id"), nullable=False)
    snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)
    changed_fields: Mapped[str] = mapped_column(Text, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project: Mapped["FactProject"] = relationship(back_populates="history")


class FactTimesheet(Base):
    __tablename__ = "fact_timesheet"

    timesheet_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(String, ForeignKey("fact_project.project_id"), nullable=False, index=True)
    resource_id: Mapped[str] = mapped_column(String, ForeignKey("dim_resource.resource_id"), nullable=False, index=True)
    week_id: Mapped[str] = mapped_column(String(10), ForeignKey("dim_week.week_id"), nullable=False, index=True)
    fy: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    fy_month_week: Mapped[str | None] = mapped_column(String(12), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String, nullable=True)
    document_item_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    hours_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    gross_revenue: Mapped[float | None] = mapped_column(Float, nullable=True)
    discount: Mapped[float | None] = mapped_column(Float, nullable=True)
    wip_provision: Mapped[float | None] = mapped_column(Float, nullable=True)
    net_revenue_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    gross_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    net_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    resource_cost_center: Mapped[str | None] = mapped_column(
        String, ForeignKey("dim_cost_center.cc_code"), nullable=True, index=True
    )
    import_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("imports.import_id"), nullable=True)
    is_stale: Mapped[int] = mapped_column(Integer, default=0, index=True)
    last_seen_import_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("imports.import_id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project: Mapped["FactProject"] = relationship(back_populates="timesheets")
    resource: Mapped["DimResource"] = relationship(back_populates="timesheets")  # type: ignore[name-defined]
    week: Mapped["DimWeek"] = relationship(back_populates="timesheets")
    cost_center: Mapped["DimCostCenter | None"] = relationship(back_populates="timesheets")  # type: ignore[name-defined]

    __table_args__ = (
        Index("ix_timesheet_project_week", "project_id", "week_id"),
        Index("ix_timesheet_fy_cc", "fy", "resource_cost_center"),
    )


class ForecastOverride(Base):
    __tablename__ = "forecast_override"

    override_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(String, ForeignKey("fact_project.project_id"), nullable=False, index=True)
    month_id: Mapped[str] = mapped_column(String(7), nullable=False)
    override_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    override_net_revenue: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String, default="local")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project: Mapped["FactProject"] = relationship(back_populates="overrides")

    __table_args__ = (Index("uq_override_project_month", "project_id", "month_id", unique=True),)


class AuditLog(Base):
    __tablename__ = "audit_log"

    log_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[str] = mapped_column(String, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)
    field_name: Mapped[str | None] = mapped_column(String, nullable=True)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor: Mapped[str] = mapped_column(String, default="local")
    recorded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
