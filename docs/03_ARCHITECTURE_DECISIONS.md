# Architecture Decision Records (ADR)

---

## ADR-001: Locale-First, nessun cloud

**Stato**: Accettato  
**Data**: 2026-05-10

**Contesto**: I dati di progetto (ore, ricavi, margin) sono sensibili. Il manager vuole pieno controllo.

**Decisione**: Nessun cloud, nessun servizio esterno. Tutto gira sulla macchina locale del manager. Dati in SQLite locale. Nessuna sincronizzazione remota in MVP.

**Conseguenze**:
- Backup manuale / automatico su disco locale.
- Multi-utente futuro (Fase 3) tramite condivisione del file `.db` su rete locale o VPN aziendale.
- Nessun SaaS, nessun costo infrastruttura.

---

## ADR-002: SQLite come database

**Stato**: Accettato  
**Data**: 2026-05-10

**Contesto**: Volume dati piccolo (max 20 progetti, timesheet settimanali su orizzonte 1-2 FY = ~5.000 righe). Un solo utente in MVP.

**Decisione**: SQLite (`./data/pcfm.db`). Nessun server database.

**Conseguenze**:
- Avvio immediato, zero configurazione.
- Backup = copia del file `.db`.
- Scalabilità verso PostgreSQL possibile in Fase 3 (SQLAlchemy astrae il dialetto).
- Limitazione: no concurrent writers. Accettabile per mono-utente. Con 5 utenti in Fase 3 si valuta read-replica o upgrade a PostgreSQL.

---

## ADR-003: Mono-repo con struttura apps / packages

**Stato**: Accettato  
**Data**: 2026-05-10

**Contesto**: Backend Python + Frontend React devono coesistere nello stesso repo per semplicità di sviluppo e deploy locale.

**Decisione**: Mono-repo con struttura:
- `/apps/api` — FastAPI
- `/apps/web` — React + Vite
- `/packages/domain` — Logica Python pura (formule, import rules), testabile senza HTTP

**Conseguenze**:
- `/packages/domain` è importato da `/apps/api` come package locale (editable install).
- Separazione netta tra logica di dominio e HTTP layer.
- Frontend e backend avviati insieme da `make start`.

---

## ADR-004: Auth pluggable — non implementata in MVP

**Stato**: Accettato  
**Data**: 2026-05-10

**Contesto**: MVP mono-utente. Fase 3 prevede max 5 utenti con ruoli `read-only` ed `editor`.

**Decisione**: In MVP non c'è autenticazione. L'API è accessibile solo da localhost. La struttura del codice (middleware FastAPI, campo `actor` in `audit_log`, `created_by` in `forecast_override`) è progettata per ospitare un layer auth futuro senza refactoring invasivo.

**Conseguenze**:
- Nessun JWT, nessun OAuth in MVP.
- In Fase 3: aggiungere middleware auth JWT o sessione senza modificare la logica di dominio.
- `actor` nei log = `"local"` in MVP.

---

## ADR-005: Soft-delete invece di DELETE fisica

**Stato**: Accettato  
**Data**: 2026-05-10

**Contesto**: L'utente importa sempre il dataset completo. Record che spariscono tra un import e l'altro (progetto chiuso, risorsa non più attiva) non devono essere persi.

**Decisione**: Nessuna DELETE fisica. I record non visti nell'ultimo import ricevono `is_stale = true` e `last_seen_import_id = <import corrente>`.

**Conseguenze**:
- Le query di default filtrano `is_stale = false`.
- L'utente può sempre vedere i record storici se vuole.
- Il DB cresce nel tempo ma i volumi sono piccoli (< 10.000 righe su 2 FY).

---

## ADR-006: Project ID estratto dal filename per il timesheet

**Stato**: Accettato  
**Data**: 2026-05-10

**Contesto**: Il file timesheet (tipo 8) non contiene il Project ID nelle sue colonne. Il nome del file è il Project ID (es. `ITE00065885.1.1.xlsx`).

**Decisione**: L'importer estrae il `project_id` dal filename rimuovendo l'estensione. Questo valore viene applicato a tutte le righe del file.

**Conseguenze**:
- Il nome del file è parte del contratto di import. L'utente non può rinominare i file arbitrariamente.
- La UI di import mostra il `project_id` estratto per conferma prima del caricamento.
- Se il file si chiama diversamente da un `project_id` valido, l'import avvisa ma può comunque procedere (l'utente conferma).

---

## ADR-007: Backup automatico pre-import

**Stato**: Accettato  
**Data**: 2026-05-10

**Contesto**: L'import è un'operazione distruttiva (modifica dati esistenti). Errori nell'import possono corrompere i dati.

**Decisione**: Prima di ogni import, PCFM crea automaticamente una copia del file `.db` in `./data/backups/pcfm_YYYYMMDD_HHMM.db`. Il percorso del backup è tracciato nella tabella `imports`.

**Conseguenze**:
- Rollback sempre possibile copiando il backup sopra il file `.db` corrente.
- La UI di import espone un pulsante "Rollback all'ultimo backup".
- I backup si accumulano: policy di retention da definire (suggerito: tenere ultimi 10).

---

## ADR-008: Upsert full-refresh-friendly e idempotente

**Stato**: Accettato  
**Data**: 2026-05-10

**Contesto**: L'utente esporta sempre tutto dal BI. Non esiste un export differenziale. L'import deve essere rieseguibile senza effetti collaterali.

**Decisione**: Ogni import è un full-refresh. Logic:
1. Per ogni record nel file: se esiste (per chiave business), aggiorna solo se almeno un campo è cambiato, altrimenti salta (skip).
2. I record non presenti nel file vengono marcati `is_stale = true`.
3. Se il file viene importato due volte senza variazioni: 0 insert, 0 update, N skip.

**Conseguenze**:
- Idempotenza garantita.
- Storico variazioni in `fact_project_history`.
- La tabella `imports` traccia i contatori per ogni import.
