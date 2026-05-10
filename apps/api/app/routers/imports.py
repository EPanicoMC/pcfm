"""Router per import file Excel: preview e conferma. Auto-detect tipo file."""

import tempfile
from pathlib import Path
from typing import Annotated

import openpyxl
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.facts import Import
from ..services.project_import_service import preview_project_import, run_project_import
from ..services.timesheet_import_service import (
    preview_timesheet_import,
    run_timesheet_import,
)

router = APIRouter(prefix="/api/import", tags=["import"])


def _detect_file_type(path: Path) -> str:
    """Ritorna 'project', 'timesheet' o 'unknown' leggendo l'header del file."""
    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb.active
        header_row = next(ws.iter_rows(values_only=True), None)
        wb.close()
        if header_row is None:
            return "unknown"
        headers = [str(h).strip() if h is not None else "" for h in header_row]
        if "Project ID" in headers and "Net Revenue (IOW)" in headers:
            return "project"
        if "Resource ID" in headers and "Week Range" in headers:
            return "timesheet"
    except Exception:
        pass
    return "unknown"


async def _save_upload(file: UploadFile) -> tuple[Path, str]:
    """Salva il file caricato in un temp file, ritorna (path, filename)."""
    content = await file.read()
    filename = file.filename or "upload.xlsx"
    suffix = Path(filename).suffix.lower() or ".xlsx"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    tmp.write(content)
    tmp.close()
    return Path(tmp.name), filename


@router.post("/preview")
async def preview_import(
    file: Annotated[UploadFile, File()],
    db: Session = Depends(get_db),
):
    """Anteprima diff senza modifiche al DB. Auto-detecta tipo file."""
    tmp_path, filename = await _save_upload(file)
    try:
        file_type = _detect_file_type(tmp_path)
        if file_type == "project":
            result = preview_project_import(tmp_path, db)
        elif file_type == "timesheet":
            result = preview_timesheet_import(tmp_path, filename, db)
        else:
            raise HTTPException(status_code=422, detail="Tipo file non riconosciuto. Atteso file 9 (progetti) o file 8 (timesheet).")
    finally:
        tmp_path.unlink(missing_ok=True)

    result["original_filename"] = filename
    return result


@router.post("/confirm")
async def confirm_import(
    file: Annotated[UploadFile, File()],
    db: Session = Depends(get_db),
):
    """Import effettivo con backup automatico. Auto-detecta tipo file."""
    tmp_path, filename = await _save_upload(file)
    try:
        file_type = _detect_file_type(tmp_path)
        if file_type == "project":
            result = run_project_import(db, tmp_path, original_filename=filename)
        elif file_type == "timesheet":
            result = run_timesheet_import(db, tmp_path, original_filename=filename)
        else:
            raise HTTPException(status_code=422, detail="Tipo file non riconosciuto.")
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
