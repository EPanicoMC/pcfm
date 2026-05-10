# UX Spec — PCFM

> Specifiche UI per l'MVP. Componenti: React + AG Grid Community + Recharts + Tailwind.
> Navigazione: sidebar sinistra fissa con link alle sezioni.

---

## Filtri Globali (persistiti in URL query params)

Disponibili su tutte le sezioni tranne Import e Assunzioni:

| Filtro | Tipo | Default |
|---|---|---|
| `FY` | Select (multi) | FY corrente |
| `Resource Cost Center` | Select (multi) | Tutti |
| `BU` | Select (multi) | Tutti |
| `Cliente` | Select (multi) | Tutti |
| `Includi chiusi` | Toggle | **ON** (codici In Chiusura inclusi) |

I filtri si applicano ai dati mostrati in tutte le sezioni attive. Cambiarli aggiorna tutte le viste in tempo reale (via TanStack Query refetch).

---

## Sezione 1 — Home / Executive (MVP)

### Layout

Barra KPI in cima (4 card), poi 2 tabelle affiancate.

### KPI Cards (FY corrente, applicando filtri globali)

| KPI | Calcolo | Formato |
|---|---|---|
| Net Revenue YTD | `Σ net_revenue_actual` filtrando il FY corrente | EUR (es. €1.2M) |
| Forecast FY Close | `Σ forecast_FY per tutti i codici` | EUR |
| % Consumo Medio | Media di `pct_consumo` per codici aperti | % |
| Codici a Rischio ≤60gg | Count codici con `data_esaurimento ≤ oggi + 60gg` | Numero intero |

### Top 5 Clienti (per Net Revenue YTD)

Tabella: Cliente | Net Rev YTD | Forecast FY | % Consumo medio

### Top 5 Codici a Rischio

Tabella: Codice | Titolo | Data Esaurimento | Residuo Ore | Residuo EUR | Status

---

## Sezione 2 — Codici Progetto (MVP)

### Tabella principale (AG Grid)

Colonne:

| Colonna | Tipo | Note |
|---|---|---|
| Project ID | Testo | Cliccabile → dettaglio |
| Project Title | Testo | |
| Cliente | Testo | |
| Status | Badge | Verde = Aperto, Giallo = In Chiusura |
| FY | Numero | |
| Ore Consumate | Numero | `hours_actual` |
| Ore Contratto (IOW) | Numero | `iow_hours_total` |
| % Consumo | Barra progresso | `pct_consumo` |
| Residuo Ore | Numero | |
| Residuo EUR | Valuta | |
| Run Rate (h/mese) | Numero | Calcolato con finestra default |
| Mesi Residui | Numero | |
| Data Esaurimento | Data | Evidenziata in rosso se ≤ 60gg |
| Forecast FY Close | Valuta | |
| To Do (BI) | % | `bi_real_pct_todo` — as-is dal BI |
| Wip Provision (BI) | Valuta | `wip_provision` — as-is dal BI |
| is_stale | Badge | Visibile solo se attivo filtro "Includi stale" |

Features AG Grid:
- Ordinamento su tutte le colonne.
- Filtro testo libero per Project ID e Titolo.
- Export CSV.
- Row selection → apre dettaglio.

### Dettaglio Codice (pannello laterale o pagina dedicata)

**Anagrafica**:
- Project ID, Titolo, Cliente, Engagement Manager, Partner, Legal Entity, Product Code, Status, Opportunity Name.

**KPI economici**:
- IOW Hours / IOW Net Revenue / IOW Contract Value.
- Ore Actual / Net Revenue Act / Margin %.
- Wip Provision (BI) + To Do (BI) — sezione "Confronto con BI".

**Grafico ore mensili** (Recharts BarChart):
- X: mesi, Y: ore actual. Colori per Resource Cost Center.
- Overlay linea del run rate.

**Lista risorse** (tabella):
- Resource ID | Nome | Job Title | CC | Ore Tot | Net Revenue Tot | Net Rate medio.

**Link a Provisioning**: pulsante "Vai al Provisioning →".

---

## Sezione 3 — Provisioning (MVP — cuore del valore)

### Layout

Selettore codice + selettore finestra temporale in cima. KPI cards. Tabella editabile. Grafico.

### Selettori

- **Codice progetto**: autocomplete su `project_id` + `project_title`.
- **Finestra run rate**: radio/select — `Ultimo mese` | `Ultimi 3 mesi` | `Ponderata`.
- **Toggle FY View**: mostra cumulato fino al 30 giugno del FY selezionato.

### KPI Cards

| KPI | |
|---|---|
| Run Rate attuale (h/mese) | Dalla finestra selezionata |
| Run Rate attuale (EUR/mese) | |
| Residuo Ore | |
| Residuo EUR | |
| Mesi Residui | |
| Data Esaurimento stimata | |
| Forecast FY Close | |

### Tabella editabile mensile (AG Grid)

Colonne:

| Colonna | Editabile | Note |
|---|---|---|
| Mese | No | `YYYY-MM` |
| Ore Actual | No | Storico timesheet |
| Net Revenue Actual | No | Storico timesheet |
| Run Rate Ore (calcolato) | No | |
| Run Rate EUR (calcolato) | No | |
| Override Ore | **Sì** | Input numerico |
| Override EUR | **Sì** | Input numerico |
| Ore Forecast (effettivo) | No | `override_ore ?? run_rate_ore` |
| EUR Forecast (effettivo) | No | `override_eur ?? run_rate_eur` |
| Nota | **Sì** | Testo libero |

Modifiche: debounce 500ms → POST `/api/forecast-override`. Confirm automatica, no modal.  
Mesi futuri: righe con sfondo diverso (grigio chiaro).  
Override attivi: evidenziati in blu.

### Grafico Storico vs Forecast (Recharts ComposedChart)

- X: mesi (storico + futuri fino a fine FY).
- Barre: ore actual (storico) + ore forecast (future, colore diverso).
- Linee: run rate base / scenario low / scenario high.
- Punti: override (marcatori speciali).
- Toggle "EUR / Ore" per switchiare l'asse Y.

### Toggle FY View

Mostra cumulato da luglio a giugno. Aggiunge riga "Totale FY" in fondo alla tabella.

---

## Sezione 4 — Import (MVP)

### Layout

Drop zone + tabella import history + dettaglio import selezionato.

### Drop Zone

- Area drag & drop per file `.xlsx`.
- Accetta uno o più file contemporaneamente.
- Rileva automaticamente il tipo (file 9 o file 8).
- Per file 8: mostra il `project_id` estratto dal filename.

### Anteprima Diff (pre-conferma)

Tabella con una riga per record rilevato nel file:

| Colonna | |
|---|---|
| Project ID / Resource+Week | Chiave |
| Azione | `INSERT` (verde) / `UPDATE` (giallo) / `SKIP` (grigio) |
| Campi modificati | Lista dei campi che cambiano (solo per UPDATE) |

Pulsante "Conferma Import" → avvia l'import effettivo.  
Pulsante "Annulla" → scarta il file, nessuna modifica al DB.

### Storico Import (tabella)

| Colonna | |
|---|---|
| Data/Ora | |
| File | Nome originale |
| Tipo | Progetto / Timesheet |
| Project ID | Per timesheet |
| Insert / Update / Skip / Error | Contatori |
| Backup | Link al file backup |
| Stato | Success / Partial / Failed |

### Rollback

Pulsante "Rollback all'ultimo backup" → conferma modal → ripristina il backup.

---

## Sezione 5 — Assunzioni (MVP minimo)

Form semplice per i parametri in `dim_assumption`:

| Parametro | Input |
|---|---|
| Ore per Man-Day | Number input (default: 8) |
| Giorni lavorativi per mese | Number input (default: 21) |
| Ore FTE per anno | Number input (default: 1700) |
| Finestra forecast default | Select: Ultimo mese / Ultimi 3 mesi / Ponderata |

Salvataggio: pulsante "Salva" → PUT `/api/assumptions` → `audit_log`.  
Mostra timestamp ultima modifica.

---

## Sezione 6 — Clienti (Fase 2)

Panoramica per cliente: anagrafica, KPI aggregati, lista codici, forecast FY.

---

## Sezione 7 — Dashboard Pivot (Fase 2)

Pivot dinamica per dimensioni: CC × mese, cliente × FY, BU × status. Export Excel.

---

## Sezione 8 — Audit / Data Quality (Fase 2)

Log modifiche manuali, alert su dati mancanti, timeline import.
