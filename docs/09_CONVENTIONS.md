# Convenzioni PCFM

## Naming

| Ambito | Convenzione |
|---|---|
| Python: variabili, funzioni, moduli | `snake_case` |
| Python: classi, pydantic models | `PascalCase` |
| DB: tabelle, colonne | `snake_case` |
| TypeScript: variabili, funzioni | `camelCase` |
| TypeScript: componenti, tipi, interfacce | `PascalCase` |
| File Python | `snake_case.py` |
| File TypeScript/TSX | `PascalCase.tsx` (componenti), `camelCase.ts` (utility) |
| Git branch | `feat/wp2-schema`, `fix/import-week-parse` |
| Git commit | Conventional Commits (vedi sotto) |

## Date e Timezone

- Tutte le date nel DB: **ISO 8601** (`YYYY-MM-DD`), colonne SQLite di tipo `DATE`.
- Timestamp nel DB: `DATETIME` UTC.
- Visualizzazione in UI: fuso orario **Europe/Rome**.
- Il "mese" di una settimana a cavallo di mese: **il mese del lunedì** di quella settimana.
  - Es: settimana `"29 Mar - 04 Apr"` → week_start = `2026-03-29` (lunedì) → `month_id = "2026-03"`.
- Week ID: `week_start` ISO (`YYYY-MM-DD`), che è sempre un lunedì.
- Month ID: stringa `YYYY-MM`.

## Fiscal Year

- **Definizione**: FY chiude il 30 giugno. FY26 = 1 luglio 2025 – 30 giugno 2026.
- **Identificatore numerico**: anno solare del giorno di chiusura (30 giugno). FY26 → `2026`.
- **Mese fiscale**: luglio = 1, agosto = 2, ..., giugno = 12.
- **Normalizzazione FY da testo**: `"FY26"` → `2026`. Regex: `r"FY(\d{2})"` → `2000 + int(m.group(1))`.
- **Multi-FY su singolo codice**: un progetto può attraversare più FY. I caricamenti timesheet sono divisi per FY tramite `dim_fiscal_calendar`.

## Valuta

- Sempre **EUR**. Nessuna conversione di valuta.
- Colonne monetarie: `REAL` in SQLite, arrotondate a 2 decimali in output.
- **Discount**: mantenuto con **segno negativo** (non invertire).

## Import e Upsert

- `is_stale = true`: record presente in import precedenti ma assente nell'ultimo full-refresh.
- `last_seen_import_id`: ID dell'ultimo import che ha visto il record.
- Upsert: `ON CONFLICT (pk) DO UPDATE SET ...` solo se almeno un campo è cambiato.
- Hash per `fact_timesheet`: `sha256(resource_id + "|" + project_id + "|" + week_start)`.

## Conventional Commits

```
feat(wp3): add project import upsert logic
fix(import): handle week ranges spanning year boundary
docs(data-dict): add column 8 clarification
test(domain): add run_rate formula unit tests
chore(deps): bump openpyxl to 3.1.2
```

Prefissi ammessi: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `style`, `perf`.

## Struttura directory

```
/apps/api              FastAPI app
/apps/web              React + Vite app
/packages/domain       Logica dominio Python pura (formule, forecast)
/data                  GITIGNORED: pcfm.db, imports/, exports/, backups/
/samples               GITIGNORED: file Excel di esempio
/docs                  12 file .md (versionati)
/tests                 Fixtures CSV + test integrazione
/scripts               CLI di utilità (seed, reset-db, backup-now)
```

## Parsing "Week Range"

Formato input: `"DD Mon - DD Mon"` (es. `"29 Mar - 04 Apr"`).

Regole di parsing:
1. Split su ` - `.
2. Prima parte = start date, seconda parte = end date.
3. L'anno si desume dal campo `Month` (`YYYY-Mon`) dello stesso record.
4. Se il mese della seconda parte è diverso dal mese della prima (settimana a cavallo), l'anno della seconda parte è lo stesso della prima (o il successivo se si passa da dicembre a gennaio).
5. `week_id = week_start` (data del lunedì, `YYYY-MM-DD`).
6. Il `month_id` assegnato alla settimana = mese del lunedì (non del venerdì).

## FYMonthWeek_PAR

Formato: `YYYY-FM-FW` (es. `"2026-09-40"`).
- `YYYY` = anno del FY.
- `FM` = mese fiscale (Jul=01, Aug=02, ..., Jun=12).
- `FW` = settimana progressiva del FY (week 1 = prima settimana di luglio).

**Uso**: campo informativo / chiave di lookup. Non è la chiave primaria del timesheet (usiamo `week_start`).
