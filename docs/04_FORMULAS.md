# Formule PCFM

> Tutte le formule sono implementate in `/packages/domain` (Python puro, testabile a sé).
> I parametri configurabili si leggono da `dim_assumption`.

---

## Parametri configurabili (dim_assumption)

| Chiave | Default | Descrizione |
|---|---|---|
| `hours_per_man_day` | 8 | Ore per un Man-Day. |
| `working_days_per_month` | 21 | Giorni lavorativi standard per mese. |
| `fte_hours_per_year` | 1700 | Ore annue per un FTE. |
| `fy_start_month` | 7 | Mese di inizio FY (luglio = 7). |
| `forecast_window_default` | `"last_month"` | Finestra default per il calcolo del run rate. Alternative: `"last_3_months"`, `"weighted"`. |

---

## Unità di misura

### Man-Day (MD)

```
MD = hours / hours_per_man_day
```

### FTE

```
FTE = hours_in_period / fte_hours_per_year
```

Usato per aggregazioni annuali. Per un mese: `FTE_mensile = hours_month / (fte_hours_per_year / 12)`.

---

## Blended Net Rate

Tariffa netta media ponderata su un perimetro (progetto, cliente, CC, BU, FY).

```
blended_net_rate(scope) = Σ(net_revenue_actual) / Σ(hours_actual)
```

Espressa in EUR/h. Il perimetro `scope` può essere qualsiasi combinazione di filtri applicati al timesheet.

---

## Run Rate

Velocità di consumo mensile. Calcolata sui dati storici timesheet aggregati per mese.

### Finestra `last_month`

```
run_rate_hours = media delle ore del mese più recente disponibile
run_rate_net_revenue = media del net_revenue del mese più recente
```

### Finestra `last_3_months`

```
run_rate_hours = media aritmetica delle ore degli ultimi 3 mesi con dati
run_rate_net_revenue = media aritmetica del net_revenue degli ultimi 3 mesi
```

### Finestra `weighted`

```
run_rate_hours = media ponderata con pesi [1, 2, 3] (il mese più recente ha peso 3)
run_rate_net_revenue = media ponderata analoga
```

Se i mesi storici sono < 3, si usano i mesi disponibili.

---

## Residuo

### Residuo Ore

```
residuo_ore(project) = iow_hours_total − Σ(timesheet.hours_actual)
```

Dove `Σ(timesheet.hours_actual)` filtra `is_stale = false`.

### Residuo EUR

```
residuo_eur(project) = iow_net_revenue − Σ(timesheet.net_revenue_actual)
```

---

## Mesi Residui

```
mesi_residui(project) = residuo_ore / run_rate_hours_month
```

Se `run_rate_hours_month = 0`, restituire `None` (nessun dato storico disponibile).

---

## Data Esaurimento

```
data_esaurimento(project) = today + relativedelta(months=ceil(mesi_residui))
```

Arrotondata all'**ultimo giorno del mese** risultante (es. se mesi_residui = 2.3 e oggi è maggio, la data = fine luglio).

```python
from dateutil.relativedelta import relativedelta
from calendar import monthrange

mesi = ceil(mesi_residui)
target = today + relativedelta(months=mesi)
last_day = monthrange(target.year, target.month)[1]
data_esaurimento = date(target.year, target.month, last_day)
```

---

## Forecast FY Close

Stima del totale netto per il FY corrente (o per un FY selezionato).

```
forecast_FY(scope, fy) = actual_YTD(scope, fy) + Σ run_rate_mesi_residui_FY
```

Dove:
- `actual_YTD` = somma di `net_revenue_actual` per il FY fino all'ultimo mese completo.
- `Σ run_rate_mesi_residui_FY` = somma del run rate mensile per ogni mese futuro del FY (da mese corrente a giugno).
- Se per un mese esiste un **override** (`forecast_override`), usa il valore override anziché il run rate calcolato.

Il `scope` può essere: singolo progetto, cliente, CC, BU, o totale.

---

## Scenari Low / Base / High

Calcolati sui mesi storici del run rate disponibili.

```
low  = percentile(25) delle ore mensili storiche
base = percentile(50) delle ore mensili storiche  [= mediana]
high = percentile(75) delle ore mensili storiche
```

I percentili si calcolano sulla distribuzione delle ore mensili reali nel periodo storico del progetto.

---

## Analisi Aggregata: Bottom-Up vs Top-Down

### Bottom-Up

```
forecast_BU(scope, fy) = Σ forecast_FY(progetto, fy) per ogni progetto nel scope
```

### Top-Down

```
forecast_TD(scope, fy) = calcolato con run_rate aggregato dello scope
```

### Reconciliation Gap

```
reconciliation_gap = forecast_TD − forecast_BU
```

Un gap significativo indica che il run rate aggregato non è spiegato dalla somma dei progetti (es. progetti con storico breve, codici nuovi, override mancanti).

---

## % Consumo

```
pct_consumo(project) = Σ(hours_actual) / iow_hours_total × 100
```

---

## Codici a Rischio

Un codice è "a rischio esaurimento ≤ 60gg" se:

```
data_esaurimento ≤ today + 60 giorni  AND  project_status ≠ "In Chiusura"
```
