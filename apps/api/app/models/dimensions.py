from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class DimFiscalCalendar(Base):
    __tablename__ = "dim_fiscal_calendar"

    fy: Mapped[int] = mapped_column(Integer, primary_key=True)
    fy_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    fy_end_date: Mapped[date] = mapped_column(Date, nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)

    weeks: Mapped[list["DimWeek"]] = relationship(back_populates="fiscal_calendar")


class DimWeek(Base):
    __tablename__ = "dim_week"

    week_id: Mapped[str] = mapped_column(String(10), primary_key=True)
    week_end: Mapped[date] = mapped_column(Date, nullable=False)
    month_id: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    fy: Mapped[int] = mapped_column(Integer, ForeignKey("dim_fiscal_calendar.fy"), nullable=False)
    fy_month: Mapped[int] = mapped_column(Integer, nullable=False)
    fy_week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fy_month_week: Mapped[str | None] = mapped_column(String(12), nullable=True, index=True)

    fiscal_calendar: Mapped["DimFiscalCalendar"] = relationship(back_populates="weeks")
    timesheets: Mapped[list["FactTimesheet"]] = relationship(back_populates="week")  # type: ignore[name-defined]


class DimClient(Base):
    __tablename__ = "dim_client"

    client_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    client_group: Mapped[str | None] = mapped_column(String, nullable=True)

    projects: Mapped[list["FactProject"]] = relationship(back_populates="client")  # type: ignore[name-defined]


class DimCostCenter(Base):
    __tablename__ = "dim_cost_center"

    cc_code: Mapped[str] = mapped_column(String, primary_key=True)
    cc_name: Mapped[str] = mapped_column(String, nullable=False)
    bu: Mapped[str | None] = mapped_column(String, nullable=True)
    ou: Mapped[str | None] = mapped_column(String, nullable=True)
    los: Mapped[str | None] = mapped_column(String, nullable=True)
    legal_entity: Mapped[str | None] = mapped_column(String, nullable=True)

    resources: Mapped[list["DimResource"]] = relationship(back_populates="cost_center")
    timesheets: Mapped[list["FactTimesheet"]] = relationship(back_populates="cost_center")  # type: ignore[name-defined]


class DimResource(Base):
    __tablename__ = "dim_resource"

    resource_id: Mapped[str] = mapped_column(String, primary_key=True)
    resource_name: Mapped[str] = mapped_column(String, nullable=False)
    job_title: Mapped[str | None] = mapped_column(String, nullable=True)
    resource_cost_center: Mapped[str | None] = mapped_column(
        String, ForeignKey("dim_cost_center.cc_code"), nullable=True
    )
    legal_entity: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    cost_center: Mapped["DimCostCenter | None"] = relationship(back_populates="resources")
    timesheets: Mapped[list["FactTimesheet"]] = relationship(back_populates="resource")  # type: ignore[name-defined]


class DimEngagementOwner(Base):
    __tablename__ = "dim_engagement_owner"

    owner_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    role: Mapped[str | None] = mapped_column(String, nullable=True)


class DimAssumption(Base):
    __tablename__ = "dim_assumption"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value_num: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_str: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
