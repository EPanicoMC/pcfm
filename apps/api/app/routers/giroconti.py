"""Endpoint per taggare settimane come giroconto (reclassifiche interne).

I giroconti vengono esclusi dal calcolo del run rate nel previsioning FY.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import engine, get_db
from ..models.giroconti import GirocontoTag

GirocontoTag.__table__.create(bind=engine, checkfirst=True)

router = APIRouter(prefix="/api/giroconti", tags=["giroconti"])


class GirocontoIn(BaseModel):
    note: str | None = None


def _serialize(g: GirocontoTag) -> dict[str, Any]:
    return {
        "id": g.id,
        "project_id": g.project_id,
        "week_id": g.week_id,
        "note": g.note,
        "created_at": g.created_at.isoformat() if g.created_at else None,
    }


@router.get("")
def list_giroconti(project_id: str | None = None, db: Session = Depends(get_db)):
    """Lista tutti i giroconti, opzionalmente filtrati per progetto."""
    q = db.query(GirocontoTag)
    if project_id:
        q = q.filter(GirocontoTag.project_id == project_id)
    return [_serialize(g) for g in q.order_by(GirocontoTag.project_id, GirocontoTag.week_id).all()]


@router.post("/{project_id}/{week_id}")
def tag_giroconto(
    project_id: str,
    week_id: str,
    body: GirocontoIn,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Marca una settimana di un progetto come giroconto."""
    existing = (
        db.query(GirocontoTag)
        .filter_by(project_id=project_id, week_id=week_id)
        .first()
    )
    if existing:
        existing.note = body.note
    else:
        existing = GirocontoTag(project_id=project_id, week_id=week_id, note=body.note)
        db.add(existing)
    db.commit()
    db.refresh(existing)
    return _serialize(existing)


@router.delete("/{project_id}/{week_id}", status_code=204)
def untag_giroconto(project_id: str, week_id: str, db: Session = Depends(get_db)):
    """Rimuove il tag giroconto da una settimana."""
    row = db.query(GirocontoTag).filter_by(project_id=project_id, week_id=week_id).first()
    if not row:
        raise HTTPException(404, "Tag non trovato")
    db.delete(row)
    db.commit()
