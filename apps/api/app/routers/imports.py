"""Router per import file Excel: preview e conferma."""

import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.facts import Import
from ..services.project_import_service import preview_project_import, run_project_import

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/preview")
async def preview_import(
    file: Annotated[UploadFile, File()],
    db: Session = Depends(get_db),
):
    """Carica un file e restituisce l'anteprima diff senza modificare il DB.

    Da usare per mostrare all'utente cosa verrà inserito/aggiornato/saltato
    prima della conferma definitiva.
    """
    content = await file.read()
    suffix = Path(file.filename or "upload.xlsx").suffix.lower()

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        result = preview_project_import(tmp_path, db)
    finally:
        tmp_path.unlink(missing_ok=True)

    result["original_filename"] = file.filename
    return result


@router.post("/confirm")
async def confirm_import(
    file: Annotated[UploadFile, File()],
    db: Session = Depends(get_db),
):
    """Esegue l'import effettivo dopo conferma dell'utente.

    Crea backup del DB, applica upsert, segna stale i record assenti.
    """
    content = await file.read()
    filename = file.filename or "upload.xlsx"
    suffix = Path(filename).suffix.lower()

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        result = run_project_import(db, tmp_path, original_filename=filename)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        tmp_path.unlink(missing_ok=True)

    return result


@router.get("/history")
def list_imports(db: Session = Depends(get_db), limit: int = 20):
    """Storico degli import eseguiti."""
    imports = (
        db.query(Import)
        .order_by(Import.import_ts.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "import_id": i.import_id,
            "file_type": i.file_type,
            "original_filename": i.original_filename,
            "project_id_extracted": i.project_id_extracted,
            "import_ts": i.import_ts,
            "rows_inserted": i.rows_inserted,
            "rows_updated": i.rows_updated,
            "rows_skipped": i.rows_skipped,
            "rows_error": i.rows_error,
            "status": i.status,
            "backup_path": i.backup_path,
        }
        for i in imports
    ]
