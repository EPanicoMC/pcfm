# Roadmap PCFM

---

## WP1 — Documentazione + Bootstrap Repository

**Obiettivo**: Fondamenta documentali e struttura repo. Zero codice applicativo.

**Deliverable**:
- 12 file `.md` in `/docs` (draft completo).
- Struttura cartelle (`/apps/api`, `/apps/web`, `/packages/domain`, `/data`, `/samples`, `/tests`, `/scripts`).
- `Makefile`, `README.md`, `.gitignore`, `pyproject.toml` (skeleton), `package.json` (skeleton).

**Criteri di accettazione**:
- [ ] Tutti i 12 `.md` esistono e sono compilati (non vuoti).
- [ ] `01_DATA_DICTIONARY.md` mappa ogni colonna di file 9 e file 8 con valori reali osservati.
- [ ] `10_OPEN_QUESTIONS.md` elenca tutte le ambiguità rilevate con assunzioni provvisorie.
- [ ] Struttura cartelle corretta: `find . -type d` mostra tutti i path richiesti.
- [ ] `.gitignore` copre `/data`, `/samples`, `.venv`, `node_modules`, `dist`, `.env`.
- [ ] Commit `docs(wp1): complete documentation draft` presente.

---

## WP2 — Schema SQLite + Alembic

**Dipendenze**: WP1  
**Obiettivo**: DB inizializzato e migrazioni funzionanti.

**Deliverable**:
- `pyproject.toml` completo con dipendenze Python.
- `/apps/api/alembic/` configurato.
- Migration `0001_initial_schema.py` con tutte le tabelle del data model.
- `dim_assumption` popolato con i valori default.
- Script `scripts/reset-db.sh` (drop + recreate).

**Criteri di accettazione**:
- [ ] `make migrate` esegue senza errori.
- [ ] `sqlite3 data/pcfm.db ".tables"` mostra tutte le 12 tabelle.
- [ ] `sqlite3 data/pcfm.db "SELECT * FROM dim_assumption"` mostra 5 righe default.
- [ ] Rieseguire `make migrate` è idempotente (Alembic non riapplica migrazioni già eseguite).
- [ ] `pytest tests/test_schema.py` verde (test di esistenza tabelle e colonne).

---

## WP3 — Import File 9 (Progetti)

**Dipendenze**: WP2  
**Obiettivo**: Importazione idempotente del file anagrafica progetti.

**Deliverable**:
- `/packages/domain/importers/project_importer.py`.
- API endpoint `POST /api/import` (multipart, file 9).
- Backup automatico pre-import.
- Upsert idempotente con history.
- Test pytest con fixture CSV.

**Criteri di accettazione**:
- [ ] `POST /api/import` con `data_9_.xlsx` → risposta JSON con `{inserted, updated, skipped, errors}`.
- [ ] Secondo import identico → `inserted=0`, `updated=0`, `skipped=N`.
- [ ] Terzo import con un campo modificato → `updated=1`, storia in `fact_project_history`.
- [ ] Backup creato in `./data/backups/` prima dell'import.
- [ ] `pytest tests/test_project_import.py` verde (usa fixture CSV, non gli xlsx).
- [ ] `dim_client` e `dim_engagement_owner` popolate.

---

## WP4 — Import File 8 (Timesheet) con project_id-da-filename

**Dipendenze**: WP3  
**Obiettivo**: Importazione timesheet settimanali con estrazione project_id dal filename.

**Deliverable**:
- `/packages/domain/importers/timesheet_importer.py`.
- Parsing "Week Range" → `week_start`, `week_end`, `month_id`.
- Popolamento `dim_week`, `dim_resource`, `dim_cost_center`.
- Upsert `fact_timesheet` su hash chiave.
- Test pytest con fixture CSV.

**Criteri di accettazione**:
- [ ] Import di `ITE00065885.1.1.xlsx` → `fact_timesheet` popolata con `project_id = "ITE00065885.1.1"`.
- [ ] `dim_week` contiene le 6 settimane del campione con `week_id`, `month_id`, `fy` corretti.
- [ ] `dim_resource` contiene 17 risorse distinte.
- [ ] `dim_cost_center` contiene 4 CC distinti.
- [ ] Settimana "29 Mar - 04 Apr" → `week_id = "2026-03-29"`, `month_id = "2026-03"`.
- [ ] Importo identico due volte → idempotente.
- [ ] `pytest tests/test_timesheet_import.py` verde.

---

## WP5 — Forecast & Provisioning (Domain Logic)

**Dipendenze**: WP4  
**Obiettivo**: Implementazione tutte le formule in `/packages/domain/formulas.py`.

**Deliverable**:
- `md()`, `fte()`, `blended_net_rate()`.
- `run_rate()` con finestre `last_month`, `last_3_months`, `weighted`.
- `residuo_ore()`, `residuo_eur()`, `mesi_residui()`, `data_esaurimento()`.
- `forecast_fy()` con supporto override.
- `pct_consumo()`.
- Scenari `low/base/high`.
- Test pytest con fixture numeriche deterministiche.

**Criteri di accettazione**:
- [ ] `pytest tests/test_formulas.py` verde (test unitari su ogni formula).
- [ ] `data_esaurimento` arrotondata a fine mese.
- [ ] `forecast_fy` usa override dove presenti e run rate altrove.
- [ ] Scenari low/base/high = p25/p50/p75 dei mesi storici.
- [ ] Con `residuo_ore = 0` o `run_rate = 0`, le funzioni restituiscono `None` senza eccezioni.

---

## WP6 — API HTTP (FastAPI)

**Dipendenze**: WP5  
**Obiettivo**: Tutti gli endpoint REST necessari al frontend MVP.

**Endpoint minimi**:
- `GET /api/health`
- `GET /api/projects` (lista con KPI calcolati, filtri query param)
- `GET /api/projects/{project_id}` (dettaglio + timesheet mensili)
- `GET /api/projects/{project_id}/forecast` (run rate, scenari, forecast FY)
- `POST /api/import` (multipart upload, preview diff)
- `POST /api/import/confirm/{import_id}` (conferma dopo preview)
- `POST /api/import/rollback` (rollback all'ultimo backup)
- `GET /api/imports` (storico)
- `GET /api/assumptions`
- `PUT /api/assumptions`
- `PUT /api/forecast-override` (upsert override mensile)
- `GET /api/dashboard/home` (KPI home + top 5 clienti + top 5 rischio)

**Criteri di accettazione**:
- [ ] `make start-api` avvia FastAPI su porta 8000.
- [ ] `GET /api/health` → `{"status": "ok"}`.
- [ ] `GET /api/projects` risponde con lista paginata con campi calcolati.
- [ ] `pytest tests/test_api.py` verde (almeno happy path per ogni endpoint).
- [ ] Swagger UI accessibile su `http://localhost:8000/docs`.

---

## WP7 — Frontend MVP (React)

**Dipendenze**: WP6  
**Obiettivo**: UI funzionante per le 5 sezioni MVP.

**Deliverable**:
- Setup Vite + TypeScript + Tailwind + TanStack Query + AG Grid + Recharts.
- Sezione 1: Home KPI + tabelle top 5.
- Sezione 2: Tabella codici + dettaglio codice.
- Sezione 3: Provisioning con tabella editabile + grafico.
- Sezione 4: Import con drop zone + anteprima diff + storico.
- Sezione 5: Assunzioni form.
- Filtri globali persistiti in URL.

**Criteri di accettazione**:
- [ ] `make start-web` avvia Vite su porta 5173.
- [ ] `make start` avvia tutto e apre il browser.
- [ ] Home mostra KPI corretti con dati da fixture.
- [ ] Import: upload file 9 → anteprima → conferma → tabella codici aggiornata.
- [ ] Provisioning: seleziono un codice → vedo run rate + tabella mensile editabile → posso inserire override → si salva.
- [ ] `vitest run` verde.
- [ ] Nessun errore console in golden path.

---

## WP8 — Override Forecast + Audit

**Dipendenze**: WP7  
**Obiettivo**: Override manuali robusti con tracciamento completo.

**Deliverable**:
- `forecast_override`: upsert, delete override.
- `audit_log`: ogni modifica tracciata.
- UI: override evidenziati, nota editabile, reset all'override.

**Criteri di accettazione**:
- [ ] Insert override → `audit_log` ha record con `action="insert"`.
- [ ] Update override → `audit_log` ha record con `old_value` e `new_value`.
- [ ] Reset override (elimina manuale) → `audit_log` traccia `action="delete"`.
- [ ] `forecast_fy` usa il valore override quando presente per il mese target.
- [ ] `pytest tests/test_override.py` verde.

---

## WP9 — Polish + Backup + README

**Dipendenze**: WP8  
**Obiettivo**: Tool pronto per uso quotidiano del manager.

**Deliverable**:
- `make backup` → crea backup manuale.
- `scripts/backup-now.py` utilizzabile da CLI.
- Policy retention backup (mantieni ultimi 10).
- `README.md` completo: installazione, avvio, uso base.
- `make lint` e `make format` funzionanti.
- Gestione errori UI (toast per errori import, loading states).

**Criteri di accettazione**:
- [ ] `make backup` crea file in `./data/backups/`.
- [ ] `make start` apre il browser automaticamente.
- [ ] `make lint` verde (ruff per Python, eslint per TS).
- [ ] `make test` esegue tutti i test (backend + frontend) e sono tutti verdi.
- [ ] Un nuovo utente può installare e avviare il tool seguendo solo il README.

---

## WP10 — Hardening Fase 2

**Dipendenze**: WP9  
**Obiettivo**: Feature avanzate per uso team e analisi più profonde.

**Deliverable**:
- Sezione 6 (Clienti): panoramica per cliente.
- Sezione 7 (Pivot): dashboard pivot dinamica multi-dimensionale.
- Sezione 8 (Audit/Data Quality): log modifiche, alert su dati mancanti.
- Gestione scenari multipli (low/base/high visibili in UI).
- Export Excel/CSV.
- Preparazione architettura auth (middleware pluggable).

**Criteri di accettazione**:
- [ ] Pivot funzionante su almeno: CC × mese, cliente × FY.
- [ ] Export CSV funzionante su tutte le tabelle.
- [ ] Alert su codici senza timesheet negli ultimi 30 giorni.
- [ ] Documenti ADR aggiornati per decisioni prese in WP10.
