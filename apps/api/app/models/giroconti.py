from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class GirocontoTag(Base):
    """Settimane di un progetto marcate come giroconto (reclassifica interna).

    Escluse dal calcolo del run rate nel previsioning FY.
    La granularità è project_id + week_id: tutta la produzione di quella
    settimana su quel codice viene ignorata ai fini previsivi.
    """

    __tablename__ = "giroconto_tag"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(String, nullable=False)
    week_id: Mapped[str] = mapped_column(String, nullable=False)   # lunedì YYYY-MM-DD
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    __table_args__ = (UniqueConstraint("project_id", "week_id", name="uq_giroconto_proj_week"),)
