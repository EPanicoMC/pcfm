"""Endpoint per gestione allocazioni FTE target per risorsa × cliente."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import engine, get_db
from ..models.allocations import ResourceAllocation

# Crea la tabella al primo import se non esiste ancora
ResourceAllocation.__table__.create(bind=engine, checkfirst=True)

router = APIRouter(prefix="/api/allocations", tags=["allocations"])


class AllocationItem(BaseModel):
    resource_name: str
    client_name: str
    fte_target_pct: float
    note: str | None = None


@router.get("")
def get_allocations(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    """Restituisce tutte le allocazioni FTE target configurate."""
    rows = db.query(ResourceAllocation).order_by(
        ResourceAllocation.resource_name, ResourceAllocation.client_name
    ).all()
    return [
        {
            "id": r.id,
            "resource_name": r.resource_name,
            "client_name": r.client_name,
            "fte_target_pct": r.fte_target_pct,
            "note": r.note,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


@router.put("")
def save_allocations(
    items: list[AllocationItem],
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """
    Sostituisce l'intera tabella delle allocazioni con i dati forniti.
    Usa upsert per chiave (resource_name, client_name), poi elimina le righe
    non presenti nell'input corrente.
    """
    # Costruisci set delle chiavi nell'input
    input_keys = {(item.resource_name, item.client_name) for item in items}

    # Upsert: aggiorna o inserisce ogni riga
    for item in items:
        existing = (
            db.query(ResourceAllocation)
            .filter_by(resource_name=item.resource_name, client_name=item.client_name)
            .first()
        )
        if existing:
            existing.fte_target_pct = item.fte_target_pct
            existing.note = item.note
            existing.updated_at = datetime.utcnow()
        else:
            db.add(ResourceAllocation(
                resource_name=item.resource_name,
                client_name=item.client_name,
                fte_target_pct=item.fte_target_pct,
                note=item.note,
            ))

    # Elimina righe non più presenti nell'input
    all_rows = db.query(ResourceAllocation).all()
    for row in all_rows:
        if (row.resource_name, row.client_name) not in input_keys:
            db.delete(row)

    db.commit()

    # Rilegge e restituisce lo stato aggiornato
    rows = db.query(ResourceAllocation).order_by(
        ResourceAllocation.resource_name, ResourceAllocation.client_name
    ).all()
    return [
        {
            "id": r.id,
            "resource_name": r.resource_name,
            "client_name": r.client_name,
            "fte_target_pct": r.fte_target_pct,
            "note": r.note,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]
