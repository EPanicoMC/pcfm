# PCFM — Project Code Forecast Manager · Stato progetto per handoff

**Data aggiornamento:** 2026-05-11 (wp12d)  
**Stack:** FastAPI + SQLAlchemy + SQLite · React 18 + Vite + TailwindCSS · Python 3.10 · monorepo

---

## Architettura in breve

```
pcfm/
├── apps/
│   ├── api/app/          # FastAPI backend
│   │   ├── main.py       # entrypoint + SPA fallback
│   │   ├── models/       # SQLAlchemy ORM
│   │   ├── routers/      # projects.py, dashboard.py, imports.py
│   │   └── services/     # detail_service.py, forecast_service.py, timesheet_import_service.py, project_import_service.py
│   └── web/src/
│       ├── api/client.ts  # tutte le interfacce TypeScript + funzioni API
│       └── pages/
│           ├── Dashboard.tsx
│           ├── Projects.tsx      # ← PROSSIMA SCHERMATA DA FARE
│           └── ProjectDetail.tsx # ← APPENA COMPLETATA
├── packages/domain/domain/importers/
│   ├── timesheet_importer.py    # import File 8 (xlsx/csv timesheet)
│   └── project_importer.py      # import File 9 (xlsx/csv progetti)
├── samples/
│   ├── ITE00065885.1.1.xlsx     # timesheet campione (File 8) — 98 righe, NR €121.304,95
│   └── data (9).xlsx            # progetti campione (File 9)
├── tests/                        # 86 test, tutti verdi
├── launch.command                # double-click macOS launcher
├── Makefile                      # make install / build / start-prod
└── scripts/seed.py               # seed assumptions DB
```

---

## File 8 (Timesheet) — struttura

Colonne (20): `FYMonthWeek_PAR, FY, Month, Week Range, Job Title, Resource, Hours Actual, Gross Revenue, Discount, Wip Provision, Net Revenue Actual, Gross Rate, Net Rate, Resource Cost Center, Resource Cost Center Name, Resource OU, Resource BU, Resource Los, Legal Entity, Resource ID`

**Chiave hash per timesheet_id:** `(resource_id, project_id, fy_month_week)` — usa `FYMonthWeek_PAR` per distinguere settimane a cavallo di mese fiscale (es. settimana 40 appare come `2026-09-40` e `2026-10-40`).

**Righe da scartare:** grand total (Week Range = None), footer metadata, righe vuote.

**Formule importanti:**
- Net Revenue = Gross Revenue + Discount + Wip Provision
- Realizzo = Net Revenue / Gross Revenue × 100

---

## File 9 (Progetti) — struttura

Colonne (38): include `Project ID, Hours Actual, Gross Revenue, Real (%) To Do, Discount, Wip Provision, Net Revenue Act, Margin (%), Hours Total Value (IOW), Contract Value (IOW), Net Revenue (IOW), Engagement Manager, Engagement Partner, Legal Entity, Product Code, FY Closing, Project Status, ...`

**Formule:**
- `Real (%) To Do` = Net Revenue Act / Gross Revenue × 100  (= realizzo)
- `Net Revenue Act` = Gross Revenue + Discount + Wip Provision
- `Margin (%)` = (NR - Spese - Staff Cost) / NR × 100 (staff cost non nel file, calcolato internamente)
- `WIP` = Net Revenue Act + Billed Amount + Total Expenses

---

## DB Schema (SQLite via SQLAlchemy)

**Fact tables:**
- `fact_project` — dati progetto da File 9 (project_id PK, iow_contract_value, iow_net_revenue, iow_hours_total, net_revenue_act, hours_actual, margin_pct, bi_real_pct_todo, wip_provision, ...)
- `fact_timesheet` — righe timesheet da File 8 (timesheet_id SHA256 PK, project_id FK, resource_id FK, week_id FK, fy_month_week, hours_actual, net_revenue_actual, gross_revenue, discount, ...)

**Dimension tables:**
- `dim_week` (week_id = lunedì YYYY-MM-DD, week_end, month_id, fy, fy_month, fy_month_week)
- `dim_cost_center` (cc_code PK, cc_name, bu, ou, los, legal_entity)
- `dim_resource` (resource_id PK, resource_name, job_title, resource_cost_center, legal_entity)
- `dim_client` (client_id PK, client_name, client_group)
- `dim_fiscal_calendar` (fy PK, fy_start_date, fy_end_date)
- `import` — log importazioni (import_id, file_type, original_filename, project_id_extracted, status, rows_inserted, ...)

**Fiscal year PwC:** luglio → giugno. FY26 = lug 2025 – giu 2026.

---

## API endpoints

```
GET  /api/dashboard               → DashboardData
GET  /api/projects                → Project[]  (params: include_stale, status, fy)
GET  /api/projects/{id}           → Project + monthly_timesheet
GET  /api/projects/{id}/detail    → ProjectDetailView (KPI + BU/CC + weekly + forecast + realizzo/margine)
GET  /api/projects/{id}/forecast  → ProjectForecast (scenari, run rate, future months)
PUT  /api/projects/{id}/forecast/override/{month_id}
DEL  /api/projects/{id}/forecast/override/{month_id}
GET  /api/assumptions             → Assumption[]
PUT  /api/assumptions/{key}
GET  /api/import/history          → ImportRecord[]
POST /api/import/confirm          → importa file (auto-detect tipo 8 o 9)
```

---

## Schermata ProjectDetail — COMPLETATA

**KPI cards (riga 1):** Valore contratto · NR da produrre · NR effettivo (da fact_project) · Residuo NR  
**KPI strip (riga 2):** Realizzo TS (NR/Lordo da timesheet) · Realizzo F9 · Margine F9 · WIP Provision  
**Progress bars:** % NR consumato · % Ore consumate + FY breakdown chips  
**Forecast + Chart:** previsione saturazione (ultima sett + media 4w) + bar chart NR settimanale  
**Deep Dive (toggle):** scenario previsionale per risorsa — toggle Normale / Ferie −50% / Assenza, mostra NR/sett scenario vs baseline + data saturazione aggiornata. Salvataggio su localStorage per progetto.  
**BU/CC Breakdown:** tabella espandibile BU → CC, click per filtrare i caricamenti  
**Caricamenti settimanali:** tabella con filtri data (tutto / settimana / mese / range). Ogni riga espandibile ▸ mostra sub-tabella: Risorsa · CC · BU · Ore · Realizzo% · NR

---

## wp12d — Fix Previsioning + Widget Ultima Settimana (completata 2026-05-11)

**Fix fy_forecast (`/api/dashboard/fy-forecast`):**
- Residuo NR/ore e run rate calcolati **solo su codici aperti** — codici "In Chiusura" esclusi da capacity e proiezione futura
- Residuo usa `project_nr_actual` (File 9 autoritative) invece della somma timesheet, coerente con ProjectDetail

**Nuovo endpoint `/api/dashboard/last-week`:**
- Trova la settimana più recente con dati
- Aggrega ore per risorsa + progetto
- Calcola media 4 settimane precedenti per risorsa
- Flagga anomalie: `high` (>+25%) / `low` (<-25%) / `normal` / `new`

**Dashboard.tsx — LastWeekWidget:**
- Sezione collassabile in fondo all'Overview tab
- Tabella risorse: nome · BU · ore settimana · media 4w · Δ% · progetti
- Badge rosso anomalie; righe evidenziate per high/low
- "Mostra tutte" se > 8 risorse

**Note metodologiche previsioning:**
- Il run rate dal FY corrente non include codici chiusi → proiezione più accurata
- La data saturazione del previsioning parte da OGGI (non da last_week_end come ProjectDetail) — differenza attesa
- Il residuo ora usa File 9 NR actual quando disponibile → allineamento con la vista dettaglio

**Nota giroconti (da investigare):**
- Se alcuni clienti mostrano NR timesheet gonfiato rispetto alle aspettative, potrebbe essere dovuto a reclassifiche interne (giroconti)
- Possibile filtro futuro: escludere righe con BU/OU/LOS specifici che identificano movimenti interni

## Schermata Projects — DA FARE (prossimo obiettivo)

La pagina `/projects` (`Projects.tsx`) mostra la lista progetti. Il file esiste già ma va costruita o migliorata.  

**Obiettivi per la nuova chat:**
1. Lista progetti con filtri (status, FY, cliente, stale)
2. KPI per riga: % consumo NR, residuo €/ore, data saturazione, at-risk badge
3. Sorting cliccabile per colonna
4. Eventuale vista raggruppata per cliente/BU

---

## Come avviare in sviluppo

```bash
# Dalla root del progetto:
make install          # prima volta (crea .venv, npm install)
make start            # API su :8000 + Vite dev su :5173
# oppure double-click launch.command per produzione all-in-one
```

**Test:** `PYTHONPATH="packages/domain:." .venv/bin/pytest -q`  — 86 test, tutti verdi  
**Build frontend:** `cd apps/web && npm run build`

---

## Note importanti per il nuovo agente

- **Lingua risposte:** italiano (utente italiano)
- **Codice commenti:** italiano
- **File 9 viene caricato raramente** (solo per nuovi codici o aggiornamenti metadati). I calcoli di NR si basano sui timesheet (File 8). I KPI di margine/realizzo F9 compaiono in UI solo se il progetto è stato importato da File 9.
- **Realizzo** = NR effettivo / Gross Revenue. È teoricamente fisso per contratto ma varia leggermente per mix risorse.
- **Margine** include staff cost che NON è nel file — viene da BI interno PwC. `margin_pct` in `fact_project` è autoritative.
- **FY Breakdown** nei timesheet: già gestito correttamente — il backend raggruppa per `dim_week.fy` che viene dall'header FY del file xlsx.
- **Deep Dive:** salva in `localStorage` con chiave `pcfm_deepdive_{project_id}`. Non ha backend — è solo frontend.
- **Priority 2 già implementata:** il bottone Deep Dive è presente in `ForecastCard` e mostra `ForecastDeepdive`.
