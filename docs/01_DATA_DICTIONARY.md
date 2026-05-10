# Data Dictionary

> Mappa fedele alle colonne reali degli file Excel esportati dal BI.
> Ultima ispezione: file `data (9).xlsx` (4 righe dati) e `data (8).xlsx` (156 righe dati).

---

## FILE 9 — Anagrafica e KPI economici cumulati per progetto

**Formato**: 1 riga per Project ID. Ogni export è cumulato dalla partenza del progetto al momento dell'export.  
**Trigger detect**: colonne contengono `Project ID` + `Net Revenue (IOW)`.  
**Riga 1**: header. Ultime righe (con len < 21): filtri applicati dal BI — ignorare.

| # | Nome colonna originale | Campo DB target | Tipo Python | Note |
|---|---|---|---|---|
| 0 | `Total` | — | — | Sempre `None` nelle righe dati; marcatore subtotale BI. **SKIP**. |
| 1 | `Print ` | `bi_report_url` | `str \| None` | URL PowerBI report per la riga. Trailing space nel nome colonna. Storato ma non analizzato. |
| 2 | `Service Account` | `client_name` | `str` | Ragione sociale cliente (es. `GIORGIO ARMANI SPA`). |
| 3 | `Gruppo Comm. Serv. Account` | `client_group` | `str` | Gruppo commerciale (es. `GIORGIO ARMANI`). |
| 4 | `Project Title` | `project_title` | `str` | Nome esteso del progetto. Può avere prefisso `.` (es. `.ARMANI - ...`). |
| 5 | `Project ID` | `project_id` | `str` | **Chiave business primaria**. Formato: `ITExxxxxxx.x.x`. |
| 6 | `Hours Actual` | `hours_actual` | `float` | Ore totali caricate a timesheet dalla partenza del progetto. |
| 7 | `Gross Revenue` | `gross_revenue` | `float` | Ricavo lordo cumulato (EUR). |
| 8 | `Real (%) To Do` | `bi_real_pct_todo` | `float \| None` | % residuo stimato dal BI. Metrica opaca del BI sorgente — mostrata as-is per confronto, non calcolata. |
| 9 | `Discount` | `discount` | `float` | Sconto applicato (EUR, **valore negativo** per convenzione). Non invertire segno. |
| 10 | `Wip Provision` | `wip_provision` | `float \| None` | Accantonamento WIP stimato dal BI (EUR). Può essere `None`. |
| 11 | `Net Revenue Act` | `net_revenue_act` | `float` | Netto cumulato riconosciuto (EUR). Formula BI: `Gross Revenue + Discount + Wip Provision`. |
| 12 | `Fees As Expenses` | `fees_as_expenses` | `float` | Spese trattenute come fee (EUR). |
| 13 | `Expenses` | `expenses_act` | `float` | Spese vive cumulato (EUR). |
| 14 | `Lump Sum` | `lump_sum_act` | `float` | Quota lump sum cumulato (EUR). |
| 15 | `Total Expenses` | `total_expenses_act` | `float` | `= Fees As Expenses + Expenses + Lump Sum`. |
| 16 | `Billed Fees` | `billed_fees` | `float` | Fee fatturate cumulato (EUR, valore negativo = credito vs cliente). |
| 17 | `Billed Expenses` | `billed_expenses` | `float` | Spese fatturate cumulato (EUR). |
| 18 | `Billed Amount` | `billed_amount` | `float` | Totale fatturato cumulato (EUR). |
| 19 | `WIP` | `wip` | `float` | Work in Progress = `Net Revenue Act − Billed Fees`. |
| 20 | `Margin (%)` | `margin_pct` | `float` | Margine % cumulato come da BI. |
| 21 | `Hours Total Value (IOW)` | `iow_hours_total` | `float` | **Monte ore contrattuale** (ore totali del contratto). |
| 22 | `Contract Value (IOW)` | `iow_contract_value` | `float` | Valore € contrattuale lordo. |
| 23 | `Net Revenue (IOW)` | `iow_net_revenue` | `float` | **Valore netto contrattuale** (EUR). Metrica primaria residuo. |
| 24 | `Expenses (IOW)` | `iow_expenses` | `float` | Spese contratto (EUR). |
| 25 | `Lump Sum (IOW)` | `iow_lump_sum` | `float` | Lump sum contratto (EUR). |
| 26 | `Engagement Manager` | `engagement_manager` | `str` | Nome del manager responsabile. |
| 27 | `Engagement Manager CC` | `engagement_manager_cc` | `str \| None` | CC del manager. Nel campione = `PVT_CUSTOMER` (placeholder BI). Non usare per filtri. |
| 28 | `Engagement Partner` | `engagement_partner` | `str` | Nome del partner responsabile. |
| 29 | `Engagement Partner CC` | `engagement_partner_cc` | `str \| None` | CC del partner. Nel campione = `PVT_CUSTOMER` (placeholder). Non usare per filtri. |
| 30 | `Debtor Account` | `debtor_account` | `str` | Soggetto debitore (spesso = Service Account). |
| 31 | `LE (Project)` | `legal_entity` | `str` | Legal entity del progetto (es. `IT25 - PwC Business Services Srl`). |
| 32 | `Product Code` | `product_code` | `str \| None` | Codice prodotto (es. `F960`). |
| 33 | `Opportunity Name` | `opportunity_name` | `str \| None` | Nome opportunità Salesforce di origine. |
| 34 | `Chargeable` | `chargeable` | `str` | `Y` = chargeable. Nel campione sempre `Y`. Ignorare i casi `N` (non si presentano). |
| 35 | `FY Closing Project` | `fy_closing` | `int \| None` | FY di chiusura pianificata. `None` se non definita (tutti i campioni = `None`). |
| 36 | `Project Closing Date` | `project_closing_date` | `date \| None` | Data chiusura progetto. `None` se non definita. |
| 37 | `Project Status` | `project_status` | `str` | `Aperto` o `In Chiusura`. Valori osservati nel campione. |

**Valori unici osservati nel campione (4 righe)**:
- `Project Status`: `Aperto`, `In Chiusura`
- `Product Code`: `F960`
- `Legal Entity`: `IT25 - PwC Business Services Srl`
- `Chargeable`: `Y`

---

## FILE 8 — Caricamenti timesheet settimanali per risorsa × progetto × settimana

**Formato**: N righe per settimana, 1 riga per risorsa. Il file copre un singolo Project ID.  
**Project ID**: **estratto dal nome del file** (senza estensione). Es: `ITE00065885.1.1.xlsx` → `project_id = "ITE00065885.1.1"`.  
**Trigger detect**: colonne contengono `Resource ID` + `Week Range`.  
**Righe da ignorare**: ultime righe con `len < 21` o `FYMonthWeek_PAR is None` (note filtri BI).

Il file di esempio `data (8).xlsx` corrisponde al progetto `ITE00065885.1.1` (A2A - F26), come indicato dalla nota filtro in fondo al file.

| # | Nome colonna originale | Campo DB target | Tipo Python | Note |
|---|---|---|---|---|
| 0 | `FYMonthWeek_PAR` | `fy_month_week` | `str` | Identificatore fiscale della settimana. Formato: `YYYY-FM-FW` dove `YYYY` = anno del FY, `FM` = mese fiscale (Jul=01, Jun=12), `FW` = settimana progressiva del FY. Es: `2026-09-40`. |
| 1 | `FY` | `fy` | `str → int` | Anno fiscale in formato `FYxx` (es. `FY26`). Normalizzare → `2026`. |
| 2 | `Month` | `month_label` | `str` | Mese in formato `YYYY-Mon` (es. `2026-Mar`). |
| 3 | `Week Range` | `week_start` / `week_end` | `str → date` | Intervallo della settimana. Formato: `"DD Mon - DD Mon"` (es. `"29 Mar - 04 Apr"`). Parsare in `week_start` (lunedì) e `week_end` (domenica). L'anno si deduce da `FY` e `Month`. |
| 4 | `Job Title` | `job_title` | `str` | Livello della risorsa. Valori: `Associate`, `Senior Associate`, `Manager`, `Director`, `Partner`. |
| 5 | `Resource` | `resource_name` | `str` | Nome completo della risorsa. |
| 6 | `Document Item Text` | `document_item_text` | `str \| None` | Testo libero opzionale. Spesso stringa vuota `""`. |
| 7 | `Hours Actual` | `hours_actual` | `float` | Ore caricate nella settimana per questa risorsa × progetto. |
| 8 | `Gross Revenue` | `gross_revenue` | `float` | Ricavo lordo settimana (EUR). |
| 9 | `Discount` | `discount` | `float` | Sconto (EUR, negativo). |
| 10 | `Wip Provision` | `wip_provision` | `float \| None` | WIP Provision BI (EUR). Quasi sempre `None` nel campione. |
| 11 | `Net Revenue Actual` | `net_revenue_actual` | `float` | Ricavo netto settimana (EUR). `= Gross Revenue + Discount + Wip Provision`. |
| 12 | `Gross Rate` | `gross_rate` | `float` | Tariffa lorda oraria (EUR/h). |
| 13 | `Net Rate` | `net_rate` | `float` | Tariffa netta oraria (EUR/h). Metrica chiave. |
| 14 | `Resource Cost Center` | `resource_cost_center` | `str` | Codice CC della risorsa (es. `IT25000492`). **Usato come filtro primario in UI**. |
| 15 | `Resource Cost Center Name` | `resource_cost_center_name` | `str` | Nome CC della risorsa (es. `PVT_CUSTOMER`). |
| 16 | `Resource OU` | `resource_ou` | `str` | Organizational Unit (es. `P_CUSTOMER`). |
| 17 | `Resource BU` | `resource_bu` | `str` | Business Unit (es. `ADV_PVT`). |
| 18 | `Resource Los` | `resource_los` | `str` | Line of Service (es. `ADVISORY`). |
| 19 | `Legal Entity` | `legal_entity` | `str` | Entità legale della risorsa (es. `PwC Business Services Srl`). |
| 20 | `Resource ID` | `resource_id` | `str` | ID anagrafico della risorsa (es. `50093556`). **Chiave business della risorsa**. |

**Valori unici osservati nel campione (156 righe, progetto ITE00065885.1.1)**:
- `FY`: `FY26`
- `Month`: `2026-Mar`, `2026-Apr`, `2026-May`
- `Week Range`: `"29 Mar - 04 Apr"`, `"05 Apr - 11 Apr"`, `"12 Apr - 18 Apr"`, `"19 Apr - 25 Apr"`, `"26 Apr - 02 May"`, `"03 May - 09 May"`
- `Job Title`: `Associate`, `Senior Associate`, `Manager`, `Director`, `Partner`
- `Resource Cost Center`: `IT25000492` (PVT_CUSTOMER), `IT25000131` (DTC_IT PMO&AGILE), `IT25000487` (PVT_GENERAL), `IT25000684` (DTC_CLOUDENGINEERING)
- `Resource BU`: `ADV_PVT`, `ADV_DT&CLOUD`
- `Legal Entity`: `PwC Business Services Srl`
- `Hours Actual`: min=0, max=48 (0 incluso — righe con 0 ore vanno comunque importate se presenti)
- `Gross Rate`: 165–510 EUR/h
- `Net Rate`: 45–140 EUR/h

**Nota**: La colonna `Wip Provision` (col 10) è `None` per quasi tutte le righe nel campione.
