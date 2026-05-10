# PCFM — Project Codes & Forecast Manager

Tool locale per il monitoraggio di codici progetto, forecast e provisioning mensile.

## Requisiti

- Python 3.11+
- Node.js 18+
- macOS / Linux

## Installazione

```bash
git clone <repo>
cd pcfm
make install
```

## Avvio

```bash
make start
```

Apre automaticamente `http://localhost:5173` nel browser.  
API disponibile su `http://localhost:8000` (Swagger: `http://localhost:8000/docs`).

## Primo utilizzo

1. Vai su **Import** nel menu laterale.
2. Trascina il file **data_9_.xlsx** (anagrafica progetti) nella drop zone.
3. Conferma l'anteprima diff.
4. Trascina il file timesheet (es. `ITE00065885.1.1.xlsx`).
5. Conferma. I dati sono ora disponibili nella dashboard.

## Comandi utili

| Comando | Descrizione |
|---|---|
| `make start` | Avvia tutto e apre il browser |
| `make test` | Esegui tutti i test |
| `make backup` | Backup manuale del DB |
| `make migrate` | Applica migrazioni DB |
| `make lint` | Linting completo |
| `make format` | Auto-format del codice |

## Struttura

```
apps/api/          FastAPI backend
apps/web/          React + Vite frontend
packages/domain/   Formule e logica dominio (Python puro)
data/              Database locale (GITIGNORED)
docs/              Documentazione tecnica
tests/             Test e fixture
scripts/           Utility CLI
```

## Dati

Il database è in `./data/pcfm.db` (SQLite).  
I backup automatici sono in `./data/backups/`.  
I dati sono **esclusivamente locali**: nessun dato esce dalla macchina.

## Documentazione

Vedi `/docs/` per i dettagli tecnici:
- `00_PRODUCT_BRIEF.md` — Panoramica prodotto
- `01_DATA_DICTIONARY.md` — Mappa colonne file Excel
- `02_DATA_MODEL.md` — Schema database
- `04_FORMULAS.md` — Formule forecast
- `06_UX_SPEC.md` — Specifiche UI
- `07_ROADMAP.md` — Roadmap WP1..WP10
