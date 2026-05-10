# Open Questions

> Aggiungi voci SOLO se trovi nuove ambiguità. Formato: problema → ASSUNZIONE PROVVISORIA + data.
> Chiudi le voci quando risolte (sposta in "Chiuse").

---

## Aperte

### OQ-002 — Formato "FYMonthWeek_PAR": significato del terzo campo

**Problema**: Il valore `"2026-09-40"` ha tre componenti. Il primo (2026) = anno FY, il secondo (09) = mese fiscale (luglio=01, ..., marzo=09) è verificato. Il terzo (40) = ?

**ASSUNZIONE PROVVISORIA** (2026-05-10): Il terzo campo è la settimana progressiva del FY (FY26 inizia luglio 2025, settimana 40 cade intorno a fine marzo 2026). Usiamo il campo solo come identificatore informativo; la chiave reale della settimana è `week_start`.

**Chiudere quando**: si verifica con più campioni o l'utente conferma.

---

### OQ-003 — Settimane che attraversano confine di anno solare

**Problema**: Il parsing di `"Week Range"` usa `year_hint` dal campo `Month`. Se una settimana va da dicembre a gennaio (es. `"30 Dec - 05 Jan"`), il `year_hint` potrebbe non essere sufficiente per determinare l'anno corretto di `week_end`.

**ASSUNZIONE PROVVISORIA** (2026-05-10): Se `end_mon < start_mon` (es. gennaio < dicembre), allora `end_year = start_year + 1`. Questa logica è implementata nella funzione `parse_week_range` documentata in `05_IMPORT_RULES.md`.

**Chiudere quando**: si testa con un campione a cavallo di anno e funziona correttamente.

---

### OQ-004 — Engagement Manager CC = "PVT_CUSTOMER" (placeholder)

**Problema**: Tutti i record nel campione hanno `Engagement Manager CC = "PVT_CUSTOMER"` e `Engagement Partner CC = "PVT_CUSTOMER"`. Non sembra un vero codice CC.

**ASSUNZIONE PROVVISORIA** (2026-05-10): È un placeholder del BI per i CC dei manager di cliente. Non usare per filtri. Storato nel DB ma escluso dai filter panel UI. Il filtro CC in UI usa solo `Resource Cost Center` dal file 8.

**Chiudere quando**: l'utente conferma o indica il corretto campo CC per manager/partner.

---

### OQ-006 — `hours_actual = 0` nel timesheet

**Problema**: Il campione include righe con `hours_actual = 0`. Potrebbero essere righe di correzione o storno.

**ASSUNZIONE PROVVISORIA** (2026-05-10): Le righe con 0 ore vengono importate normalmente. Il calcolo del run rate esclude i mesi con 0 ore totali (per non abbassare artificialmente la media).

**Chiudere quando**: si chiarisce se le righe 0-ore hanno un significato specifico nel BI.

---

## Chiuse

### OQ-001 — Significato di "Real (%) To Do" nel file 9 ✓

**Risolto** (2026-05-10): Trattare come metrica opaca del BI. Importata as-is in `bi_real_pct_todo`, mostrata in UI come "To Do (BI)" senza interpretazione.

---

### OQ-005 — Policy di retention dei backup ✓

**Risolto** (2026-05-10): Retention = **2 anni** (non numero fisso di file). I backup più vecchi di 2 anni vengono eliminati automaticamente dopo ogni nuovo backup.

---

### OQ-007 — Nomi file timesheet in produzione ✓

**Risolto** (2026-05-10): I file timesheet esportati dal BI hanno già il codice progetto come nome (es. `ITE00065885.1.1.xlsx`). Il pattern è garantito dalla sorgente. La UI non ha bisogno di permettere correzione manuale del `project_id` estratto dal filename.
