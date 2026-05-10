#!/bin/bash
# PCFM — macOS launcher (doppio clic da Finder)
# Avvia il server in produzione e apre il browser.

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

VENV="$DIR/.venv"
PORT=8000

# ── Colori per output leggibile ────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}▸${NC} $*"; }
ok()      { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
fatal()   { echo -e "${RED}✗${NC} $*"; exit 1; }

echo ""
echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   PCFM — Project Code Forecast Mgr   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Prerequisiti ───────────────────────────────────────────────────────────────
[ -d "$VENV" ] || fatal "Virtualenv non trovato. Esegui prima: make install"
[ -f "$VENV/bin/uvicorn" ] || fatal "uvicorn non trovato. Esegui: make install"
[ -d "apps/web" ] || fatal "Directory apps/web non trovata."

# ── Controlla se la porta è già occupata ───────────────────────────────────────
if lsof -i ":$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
    warn "Porta $PORT già in uso — PCFM potrebbe essere già avviato."
    echo ""
    info "Apertura browser su http://localhost:$PORT ..."
    sleep 1
    open "http://localhost:$PORT"
    echo ""
    echo "Premi Ctrl+C per chiudere questa finestra."
    read -r -d '' _ 2>/dev/null || true
    exit 0
fi

# ── Migrazioni DB ──────────────────────────────────────────────────────────────
info "Migrazioni database..."
PYTHONPATH="$DIR/packages/domain:." "$VENV/bin/alembic" upgrade head
PYTHONPATH="$DIR/packages/domain:." "$VENV/bin/python" scripts/seed.py
ok "Database pronto."

# ── Build frontend (solo se dist mancante o obsoleto) ─────────────────────────
DIST="apps/web/dist/index.html"
REBUILD=false

if [ ! -f "$DIST" ]; then
    REBUILD=true
    info "Build frontend (prima volta)..."
elif [ "$(find apps/web/src -newer "$DIST" -name '*.tsx' -o -name '*.ts' -o -name '*.css' 2>/dev/null | head -1)" != "" ]; then
    REBUILD=true
    info "Sorgenti modificati — rebuild frontend..."
fi

if [ "$REBUILD" = true ]; then
    cd apps/web
    npm run build
    cd "$DIR"
    ok "Frontend buildato → apps/web/dist/"
else
    ok "Frontend build aggiornata, skip."
fi

# ── Avvio server ───────────────────────────────────────────────────────────────
info "Avvio server su http://localhost:$PORT ..."
sleep 1
open "http://localhost:$PORT"

echo ""
echo -e "${GREEN}PCFM in esecuzione su http://localhost:$PORT${NC}"
echo "Premi Ctrl+C per fermare il server."
echo ""

PYTHONPATH="$DIR/packages/domain:." \
    "$VENV/bin/uvicorn" apps.api.app.main:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --log-level warning
