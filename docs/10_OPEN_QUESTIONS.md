# Open Questions

> Aggiungi voci SOLO se trovi nuove ambiguità. Formato: problema → ASSUNZIONE PROVVISORIA + data.
> Chiudi le voci quando risolte (sposta in "Chiuse").

---

## Aperte

### OQ-001 — Significato di "Real (%) To Do" nel file 9

**Problema**: La colonna `Real (%) To Do` ha valore 32 per `ITE00041182.1.1`, un progetto con `hours_actual = 6182.5` e `iow_hours_total = 6720` (92% ore consumate). Il valore non corrisponde al residuo ore calcolabile da noi.

**ASSUNZIONE PROVVISORIA** (2026-05-10): È una metrica opaca del BI sorgente, forse basata su logiche di billing/WIP non disponibili nei nostri dati. La importiamo as-is nel campo `bi_real_pct_todo` e la mostriamo in UI come "To Do (BI)" senza interpretarla.

**Chiudere quando**: l'utente chiarisce il calcolo oppure conferma che va trattata come opaca.

---

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

### OQ-005 — Policy di retention dei backup

**Problema**: I backup si accumulano nel tempo. Non è stato definito quanti tenerne.

**ASSUNZIONE PROVVISORIA** (2026-05-10): Manteniamo gli ultimi 10 backup. Ad ogni nuovo backup, se il conteggio supera 10, eliminiamo il più vecchio. Implementato in `scripts/backup-now.py`.

**Chiudere quando**: l'utente conferma o indica un numero diverso.

---

### OQ-006 — `hours_actual = 0` nel timesheet

**Problema**: Il campione include righe con `hours_actual = 0`. Potrebbero essere righe di correzione o storno.

**ASSUNZIONE PROVVISORIA** (2026-05-10): Le righe con 0 ore vengono importate normalmente. Il calcolo del run rate esclude i mesi con 0 ore totali (per non abbassare artificialmente la media).

**Chiudere quando**: si chiarisce se le righe 0-ore hanno un significato specifico nel BI.

---

### OQ-007 — Nomi file timesheet in produzione

**Problema**: Il campione si chiama `data (8).xlsx`. In produzione, i file dovranno chiamarsi `ITE00065885.1.1.xlsx`. Non è chiaro se l'utente rinominerà i file manualmente prima dell'import.

**ASSUNZIONE PROVVISORIA** (2026-05-10): La UI di import mostrerà il `project_id` estratto dal filename e chiederà conferma. Se il filename non matcha il pattern `ITE\d+\.\d+\.\d+`, la UI mostrerà un warning e permetterà all'utente di correggere manualmente il `project_id` prima della conferma.

**Chiudere quando**: l'utente conferma come esporta e nomina i file dal BI.

---

## Chiuse

*(nessuna ancora)*
