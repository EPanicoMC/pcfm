"""Backup manuale del DB con policy di retention 2 anni."""

import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "pcfm.db"
BACKUP_DIR = Path(__file__).resolve().parents[1] / "data" / "backups"
RETENTION_YEARS = 2


def backup(db_path: Path = DB_PATH, backup_dir: Path = BACKUP_DIR) -> Path | None:
    if not db_path.exists():
        print(f"DB non trovato: {db_path}", file=sys.stderr)
        return None

    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M")
    dest = backup_dir / f"pcfm_{ts}.db"
    shutil.copy2(db_path, dest)
    print(f"Backup creato: {dest}")

    _purge_old_backups(backup_dir)
    return dest


def _purge_old_backups(backup_dir: Path) -> None:
    now = datetime.now(tz=timezone.utc)
    removed = 0
    for f in sorted(backup_dir.glob("pcfm_*.db")):
        mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
        age_years = (now - mtime).days / 365.25
        if age_years > RETENTION_YEARS:
            f.unlink()
            removed += 1
    if removed:
        print(f"Backup rimossi (> {RETENTION_YEARS} anni): {removed}")


if __name__ == "__main__":
    backup()
