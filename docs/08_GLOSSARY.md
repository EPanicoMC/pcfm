# Glossario PCFM

## Termini di dominio

| Termine | Definizione |
|---|---|
| **FY** | Fiscal Year. Chiude il 30 giugno. FY26 = 1 luglio 2025 – 30 giugno 2026. L'identificatore numerico è l'anno solare del giorno di chiusura (es. FY26 → 2026). |
| **IOW** | "In other words" — suffix usato nel BI sorgente per indicare i valori contrattuali. `Hours Total Value (IOW)` = ore contratto; `Contract Value (IOW)` = valore € contratto; `Net Revenue (IOW)` = netto € contratto. |
| **MD** | Man-Day. Unità di misura del lavoro. `MD = Ore / hours_per_man_day` (default 8). |
| **FTE** | Full-Time Equivalent. `FTE = Ore annue / fte_hours_per_year` (default 1700). |
| **Blended Net Rate** | Tariffa netta media ponderata su un perimetro (progetto, cliente, CC). `= Σ(net_revenue) / Σ(hours)`. Espressa in EUR/h. |
| **Run Rate** | Velocità di consumo ore / ricavi in un periodo. Calcolata come media, mediana o media ponderata dei mesi nella finestra di analisi. |
| **Residuo Ore** | `= iow_hours_total − Σ(timesheet.hours_actual)`. Ore contratto ancora da erogare. |
| **Residuo EUR** | `= iow_net_revenue − Σ(timesheet.net_revenue_actual)`. Ricavo netto contratto ancora da riconoscere. |
| **Mesi Residui** | `= Residuo Ore / run_rate_hours_month`. Stima dei mesi necessari a completare il contratto al ritmo attuale. |
| **Data Esaurimento** | `= oggi + Mesi Residui` (arrotondata a fine mese). Data stimata di completamento del contratto. |
| **Forecast FY Close** | Stima di chiusura del FY corrente. `= YTD actual + Σ run_rate mensile per i mesi rimanenti del FY`. Gli override hanno priorità. |
| **Bottom-Up** | Forecast costruito sommando i forecast per singolo codice. |
| **Top-Down** | Forecast calcolato direttamente sull'aggregato (cliente, CC, BU). |
| **Reconciliation Gap** | `= Top-Down − Bottom-Up`. Scarto tra le due metodologie di forecast. |
| **Override** | Valore di forecast inserito manualmente dal manager per un mese specifico. Ha priorità sul valore calcolato. |
| **To Do (BI)** | Metrica del BI sorgente (file 9, colonna `Real (%) To Do`). Stima BI del residuo percentuale. Mostrata in PCFM solo per confronto — non calcolata da noi. |
| **Wip Provision (BI)** | Metrica del BI sorgente (file 9 e file 8, colonna `Wip Provision`). Accantonamento WIP stimato dal BI. Mostrata in PCFM solo per confronto. |
| **WIP** | Work in Progress. `= Net Revenue Act − Billed Fees`. Ricavo riconosciuto non ancora fatturato. |
| **is_stale** | Flag booleano su ogni record. `true` = il record era presente in import precedenti ma non nell'ultimo full-refresh. Il record non viene eliminato fisicamente. |
| **Full-Refresh** | Import completo: tutti i dati vengono ricevuti ad ogni caricamento. PCFM usa upsert idempotente + soft-delete per `is_stale`. |

## Abbreviazioni organizzative PwC

| Abbreviazione | Significato |
|---|---|
| **CC** | Cost Center (Centro di Costo). Identificato da codice numerico (es. `IT25000492`). |
| **BU** | Business Unit (es. `ADV_PVT`, `ADV_DT&CLOUD`). |
| **OU** | Organizational Unit (es. `P_CUSTOMER`, `C_ITPMO&AGIL`). |
| **LoS** | Line of Service (es. `ADVISORY`). |
| **LE** | Legal Entity (es. `PwC Business Services Srl`). |
| **Resource Cost Center** | CC di appartenenza della risorsa (da file 8). Usato come filtro primario. |
| **Engagement Manager CC** | CC del manager del progetto (file 9). Nel campione = `PVT_CUSTOMER` (placeholder BI). Non usato per filtri. |
| **Service Account** | Ragione sociale del cliente (es. `GIORGIO ARMANI SPA`). |
| **Gruppo Comm.** | Gruppo commerciale del cliente (es. `GIORGIO ARMANI`). |
| **Debtor Account** | Soggetto debitore del progetto (spesso coincide con Service Account). |
