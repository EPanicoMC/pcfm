# Import Rules

---

## Tipi di file e rilevamento automatico

| Tipo | Condizione di detect | Note |
|---|---|---|
| **File 9** (Progetti) | Colonne contengono `"Project ID"` AND `"Net Revenue (IOW)"` | 1 riga per progetto, cumulata |
| **File 8** (Timesheet) | Colonne contengono `"Resource ID"` AND `"Week Range"` | N righe per risorsa × settimana |

Il detect avviene leggendo la prima riga (header) del foglio `Export` del file xlsx.

---

## File 9 — Import Progetti

### Estrazione project_id

Il `project_id` è nella colonna `Project ID` (indice 5).

### Righe da ignorare

- Riga 0: header.
- Righe con `len(row) < 21` oppure `row[5] is None`: sono note filtro BI in fondo al file — skip silenzioso.
- Righe con `row[0] is not None` (colonna `Total` valorizzata): subtotali BI — skip.

### Normalizzazioni

| Campo | Normalizzazione |
|---|---|
| Stringhe | `.strip()` su tutti i campi testuali |
| `Discount` | Non invertire il segno (già negativo) |
| `FY Closing Project` | Già intero o `None` |
| `Project Closing Date` | Convertire da `datetime` Excel a `date` Python |
| `Margin (%)` | Arrotondare a 4 decimali |
| `Real (%) To Do` | Arrotondare a 4 decimali |
| Valori monetari | Arrotondare a 2 decimali |

### Upsert logic

```
chiave business: project_id
```

1. **Insert**: se `project_id` non esiste in `fact_project`.
2. **Update**: se esiste e almeno un campo è cambiato → aggiorna `fact_project`, crea record in `fact_project_history`.
3. **Skip**: se esiste e nessun campo è cambiato.
4. **Stale**: dopo il loop, marca `is_stale = true` per tutti i `project_id` non visti in questo import.

### Dimensioni popolate automaticamente

- `dim_client`: upsert su `client_name` (normalizzato).
- `dim_engagement_owner`: upsert su `name` per manager e partner.

---

## File 8 — Import Timesheet

### Estrazione project_id dal filename

```python
project_id = Path(filename).stem  # rimuove estensione
# Es: "ITE00065885.1.1.xlsx" → "ITE00065885.1.1"
```

La UI mostra il `project_id` estratto **prima** della conferma import. Se non esiste in `fact_project`, mostrare avviso (ma permettere l'import — il progetto potrebbe essere caricato dopo).

### Righe da ignorare

- Riga 0: header.
- Righe con `len(row) < 21` oppure `row[0] is None` (campo `FYMonthWeek_PAR`): note filtro — skip.

### Normalizzazioni

| Campo | Normalizzazione |
|---|---|
| `FY` | `"FY26"` → `2026` (regex `r"FY(\d{2})"` → `2000 + int`) |
| `Week Range` | Parsare in `week_start` e `week_end` (vedi sotto) |
| `Document Item Text` | `None` se stringa vuota |
| `Discount`, `Wip Provision` | `None` se cella vuota |
| Valori numerici | Arrotondare a 2 decimali |
| Stringhe | `.strip()` |

### Parsing "Week Range"

Formato: `"DD Mon - DD Mon"` (es. `"29 Mar - 04 Apr"`).

```python
import re
from datetime import date

MONTHS = {'Jan':1,'Feb':2,'Mar':3,'Apr':4,'May':5,'Jun':6,
          'Jul':7,'Aug':8,'Sep':9,'Oct':10,'Nov':11,'Dec':12}

def parse_week_range(week_range: str, year_hint: int) -> tuple[date, date]:
    # "29 Mar - 04 Apr"
    parts = week_range.split(' - ')
    start_day, start_mon = int(parts[0].split()[0]), MONTHS[parts[0].split()[1]]
    end_day, end_mon = int(parts[1].split()[0]), MONTHS[parts[1].split()[1]]
    start_year = year_hint
    end_year = year_hint if end_mon >= start_mon else year_hint + 1
    return date(start_year, start_mon, start_day), date(end_year, end_mon, end_day)
```

`year_hint` = anno desunto dalla colonna `Month` (`"2026-Mar"` → 2026).

### Calcolo week_id e month_id

```python
week_id = week_start.isoformat()      # "2026-03-29"
month_id = f"{week_start.year}-{week_start.month:02d}"  # "2026-03"
```

**Regola mese a cavallo**: il mese assegnato è sempre quello del lunedì (= week_start).

### Upsert logic

```
chiave business: sha256(resource_id + "|" + project_id + "|" + week_id)
```

Stessa logica di insert/update/skip/stale del file 9.

### Dimensioni popolate automaticamente

- `dim_resource`: upsert su `resource_id`. I campi `resource_name`, `job_title`, `resource_cost_center`, `legal_entity` vengono aggiornati all'ultimo import visto (job_title può cambiare nel tempo).
- `dim_cost_center`: upsert su `cc_code`.
- `dim_week`: insert se la settimana non esiste (deterministica da `week_start`).

---

## Backup Pre-Import

Prima di qualsiasi modifica al DB:

```python
import shutil
from datetime import datetime

backup_name = f"pcfm_{datetime.utcnow().strftime('%Y%m%d_%H%M')}.db"
shutil.copy2("./data/pcfm.db", f"./data/backups/{backup_name}")
```

Il percorso del backup è salvato in `imports.backup_path`.

---

## Flusso import completo (server-side)

```
1. Ricevi file multipart
2. Rileva tipo (file 9 o file 8)
3. Crea backup del DB
4. Crea record in imports (status = "in_progress")
5. Leggi header + righe valide
6. Per file 8: estrai project_id dal filename
7. Mostra anteprima diff all'utente (insert/update/skip per riga)
8. Attendi conferma esplicita dall'utente
9. Esegui upsert transazionale
10. Marca is_stale i record assenti
11. Aggiorna imports (status, contatori)
12. Restituisci riepilogo
```

---

## Rollback

```
1. Trova il backup dell'import target (da imports.backup_path)
2. Copia il file backup su ./data/pcfm.db (sovrascrittura)
3. Registra il rollback in audit_log
```

Il rollback è disponibile solo per l'ultimo backup. Per backup precedenti, operazione manuale.

---

## Idempotenza

Lo stesso file importato N volte produce esattamente lo stesso stato del DB a partire dalla seconda importazione: `rows_inserted = 0`, `rows_updated = 0`, `rows_skipped = N`.
