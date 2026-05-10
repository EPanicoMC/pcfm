"""Backup del file DB prima di ogni import."""

import shutil
from datetime import datetime, timezone
from pathlib import Path

from ..database import DB_PATH

BACKUP_DIR = DB_PATH.parent / "backups"
RETENTION_YEARS = 2


def backup_db() -> Path | None:
    """Crea un backup del DB. Restituisce il path del file creato, o None se il DB non esiste."""
    if not DB_PATH.exists():
        return None

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    dest = BACKUP_DIR / f"pcfm_{ts}.db"
    shutil.copy2(DB_PATH, dest)
    _purge_old(BACKUP_DIR)
    return dest


def _purge_old(backup_dir: Path) -> None:
    now = datetime.now(tz=timezone.utc)
    for f in backup_dir.glob("pcfm_*.db"):
        mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
        if (now - mtime).days / 365.25 > RETENTION_YEARS:
            f.unlink()
