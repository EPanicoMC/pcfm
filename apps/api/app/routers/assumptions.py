"""Endpoint per la lettura e modifica dei parametri di assunzione."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.dimensions import DimAssumption

router = APIRouter(prefix="/api/assumptions", tags=["assumptions"])


@router.get("")
def list_assumptions(db: Session = Depends(get_db)):
    """Lista tutti i parametri configurabili."""
    rows = db.query(DimAssumption).order_by(DimAssumption.key).all()
    return [
        {
            "key": r.key,
            "value_num": r.value_num,
            "value_str": r.value_str,
            "description": r.description,
            "updated_at": r.updated_at,
        }
        for r in rows
    ]


class AssumptionUpdate(BaseModel):
    value_num: float | None = None
    value_str: str | None = None


@router.put("/{key}")
def update_assumption(key: str, body: AssumptionUpdate, db: Session = Depends(get_db)):
    """Aggiorna il valore di un parametro esistente."""
    row = db.get(DimAssumption, key)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Parametro '{key}' non trovato")
    if body.value_num is not None:
        row.value_num = body.value_num
    if body.value_str is not None:
        row.value_str = body.value_str
    db.commit()
    return {"key": row.key, "value_num": row.value_num, "value_str": row.value_str}
