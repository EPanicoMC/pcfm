# PCFM — Product Brief

## Descrizione sintetica

**PCFM (Project Codes & Forecast Manager)** è uno strumento locale per manager PwC che devono:
- monitorare l'avanzamento economico dei propri codici progetto,
- fare forecast e provisioning mensile,
- analizzare KPI per centro di costo, BU, cliente e fiscal year.

Il BI aziendale fornisce solo una previsione di netto globale. PCFM colma il gap permettendo analisi granulare e forecast bottom-up per singolo codice.

## Problema che risolve

| Problema | Soluzione PCFM |
|---|---|
| BI aziendale: solo netto globale | Forecast per codice, cliente, CC, BU |
| Export manuale ogni settimana | Import xlsx idempotente, full-refresh-friendly |
| Provisioning su fogli Excel sparsi | Tabella mensile editabile con override e audit |
| Nessuna storia per FY | DB SQLite locale con storico permanente |
| Tool cloud non autorizzati | 100% locale, nessun dato fuori dalla macchina |

## Utenti target

- **MVP (Fase 1)**: mono-utente — un manager senior.
- **Fase 3**: max 5 persone, ruoli `read-only` ed `editor`. Auth pluggable (non implementata in MVP).

## Perimetro funzionale (priorità MVP)

1. **Import** — caricamento file xlsx da BI (tipo 9: anagrafica progetti; tipo 8: timesheet settimanali).
2. **Dashboard Home** — KPI FY corrente, top risk, top clienti.
3. **Codici progetto** — tabella con % consumo, residuo, data esaurimento.
4. **Provisioning** — run rate, forecast FY, override mensile per codice.
5. **Assunzioni** — parametri configurabili (ore/MD, giorni lavorativi/mese, ecc.).

## Fuori perimetro MVP

- Gestione risorse e costi (non ci interessano).
- Dashboard pivot dinamica (Fase 2).
- Audit e data quality UI completa (Fase 2).
- Autenticazione multi-utente (Fase 3).

## Vincoli non negoziabili

- **Locale**: nessun cloud, nessun Firebase, nessun dato esterno.
- **SQLite**: file `./data/pcfm.db` sulla macchina del manager.
- **Backup automatico** prima di ogni import.
- **Soft-delete**: nessuna DELETE fisica, solo `is_stale = true`.
- **Idempotenza**: stesso file importato due volte = zero modifiche al DB.

## Stack tecnico deciso

| Layer | Tecnologia |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2, Alembic, pandas, openpyxl, pydantic v2 |
| DB | SQLite `./data/pcfm.db` |
| Frontend | React + Vite + TypeScript, AG Grid Community, Recharts, TanStack Query, Tailwind |
| Test | pytest (backend), vitest (frontend) |
| Avvio | `make start` → API + web → browser su http://localhost:5173 |
