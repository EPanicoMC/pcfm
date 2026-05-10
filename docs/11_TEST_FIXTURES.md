# Test Fixtures

> Estratto di righe dai file sample in formato CSV.
> I test NON devono mai leggere i file `.xlsx` originali in `/samples/`.
> I file CSV corrispondenti sono in `/tests/fixtures/`.

---

## Fixture file 9 — Progetti (`tests/fixtures/projects.csv`)

4 righe estratte da `data (9).xlsx` (tutti i progetti presenti nel campione).

```csv
project_id,project_title,service_account,client_group,hours_actual,gross_revenue,bi_real_pct_todo,discount,wip_provision,net_revenue_act,fees_as_expenses,expenses_act,lump_sum_act,total_expenses_act,billed_fees,billed_expenses,billed_amount,wip,margin_pct,iow_hours_total,iow_contract_value,iow_net_revenue,iow_expenses,iow_lump_sum,engagement_manager,engagement_manager_cc,engagement_partner,engagement_partner_cc,debtor_account,legal_entity,product_code,opportunity_name,chargeable,fy_closing,project_closing_date,project_status
ITE00041182.1.1,.ARMANI - MARKETING OPERATIONAL SERVICES 2025,GIORGIO ARMANI SPA,GIORGIO ARMANI,6182.5,1391120.0,32.0,-951534.4,6109.0,445694.6,0.0,14098.0,13187.57,27285.57,-473950.0,0.0,-473950.0,-969.83,20.5504,6720.0,473950.0,445531.5,14200.0,14218.5,Enrico Panico,PVT_CUSTOMER,Fabio Castignetti,PVT_CUSTOMER,GIORGIO ARMANI SPA,IT25 - PwC Business Services Srl,F960,ARMANI - MARKETING OPERATIONAL SERVICES 2025,Y,,, Aperto
ITE00067805.1.1,ARMANI - MARKETING OPERATIONAL SERVICES 2026,GIORGIO ARMANI SPA,GIORGIO ARMANI,1148.0,241220.0,33.4608,-160506.04,,80713.96,0.0,0.0,2421.42,2421.42,-51300.0,0.0,-51300.0,31835.38,27.4078,6072.0,447300.0,424181.0,10000.0,13119.0,Enrico Panico,PVT_CUSTOMER,Fabio Castignetti,PVT_CUSTOMER,GIORGIO ARMANI SPA,IT25 - PwC Business Services Srl,F960,ARMANI - MARKETING OPERATIONAL SERVICES 2026,Y,,,Aperto
ITE00065885.1.1,A2A - F26,A2A ENERGIA SPA,A2A,1911.5,442025.0,27.4424,-320720.05,,121304.95,0.0,182.5,3639.15,3821.65,-264311.0,0.0,-264311.0,-139184.4,4.0233,3952.0,264311.0,256381.67,0.0,7929.33,Enrico Panico,PVT_CUSTOMER,Massimo Ferriani,PVT_CUSTOMER,A2A ENERGIA SPA,IT25 - PwC Business Services Srl,F960,A2A - F26,Y,,,Aperto
ITE00060655.1.1,A2A - F25,A2A ENERGIA SPA,A2A,4332.0,1021590.0,27.4441,-741228.74,470.9,280832.16,0.0,0.0,8410.84,8410.84,-289243.0,0.0,-289243.0,0.0,6.8112,4332.0,289243.0,280832.16,0.0,8410.84,Enrico Panico,PVT_CUSTOMER,Massimo Ferriani,PVT_CUSTOMER,A2A ENERGIA SPA,IT25 - PwC Business Services Srl,F960,A2A - F25,Y,,,In Chiusura
```

---

## Fixture file 8 — Timesheet (`tests/fixtures/timesheet_ITE00065885_1_1.csv`)

10 righe estratte da `data (8).xlsx` (project_id estratto dal filename = `ITE00065885.1.1`).  
Coprono 3 settimane diverse e 3 CC diversi.

```csv
fy_month_week,fy,month_label,week_range,job_title,resource_name,document_item_text,hours_actual,gross_revenue,discount,wip_provision,net_revenue_actual,gross_rate,net_rate,resource_cost_center,resource_cost_center_name,resource_ou,resource_bu,resource_los,legal_entity,resource_id
2026-09-40,FY26,2026-Mar,29 Mar - 04 Apr,Associate,Cosimo Lo Iacono,,4.0,660.0,-478.88,,181.12,165.0,45.28,IT25000492,PVT_CUSTOMER,P_CUSTOMER,ADV_PVT,ADVISORY,PwC Business Services Srl,50093556
2026-09-40,FY26,2026-Mar,29 Mar - 04 Apr,Director,Alessandro Fonio,,8.0,3440.0,-2496.0,,944.0,430.0,118.0,IT25000492,PVT_CUSTOMER,P_CUSTOMER,ADV_PVT,ADVISORY,PwC Business Services Srl,50094832
2026-09-40,FY26,2026-Mar,29 Mar - 04 Apr,Senior Associate,Alberto Galvan,,8.0,1840.0,-1335.04,,504.96,230.0,63.12,IT25000492,PVT_CUSTOMER,P_CUSTOMER,ADV_PVT,ADVISORY,PwC Business Services Srl,50098138
2026-09-40,FY26,2026-Mar,29 Mar - 04 Apr,Senior Associate,Mihaela Denisa Ioance,,4.0,920.0,-667.52,,252.48,230.0,63.12,IT25000131,DTC_IT PMO&AGILE,C_ITPMO&AGIL,ADV_DT&CLOUD,ADVISORY,PwC Business Services Srl,50097928
2026-10-41,FY26,2026-Apr,05 Apr - 11 Apr,Associate,Cosimo Lo Iacono,,8.0,1320.0,-957.76,,362.24,165.0,45.28,IT25000492,PVT_CUSTOMER,P_CUSTOMER,ADV_PVT,ADVISORY,PwC Business Services Srl,50093556
2026-10-41,FY26,2026-Apr,05 Apr - 11 Apr,Director,Alessandro Fonio,,8.0,3440.0,-2496.0,,944.0,430.0,118.0,IT25000492,PVT_CUSTOMER,P_CUSTOMER,ADV_PVT,ADVISORY,PwC Business Services Srl,50094832
2026-10-42,FY26,2026-Apr,12 Apr - 18 Apr,Manager,Monica Gardella,,8.0,1840.0,-1335.04,,504.96,230.0,63.12,IT25000492,PVT_CUSTOMER,P_CUSTOMER,ADV_PVT,ADVISORY,PwC Business Services Srl,50096580
2026-10-43,FY26,2026-Apr,19 Apr - 25 Apr,Senior Associate,Diego Modonutti,,8.0,1840.0,-1335.04,,504.96,230.0,63.12,IT25000492,PVT_CUSTOMER,P_CUSTOMER,ADV_PVT,ADVISORY,PwC Business Services Srl,50093077
2026-11-44,FY26,2026-May,26 Apr - 02 May,Partner,Fabio Castignetti,,8.0,4080.0,-2960.0,,1120.0,510.0,140.0,IT25000492,PVT_CUSTOMER,P_STR CNS,ADV_PVT,ADVISORY,PwC Business Services Srl,50094832
2026-11-45,FY26,2026-May,03 May - 09 May,Associate,Cosimo Lo Iacono,,4.0,660.0,-478.88,,181.12,165.0,45.28,IT25000684,DTC_CLOUDENGINEERING,C_CLOUD,ADV_DT&CLOUD,ADVISORY,PwC Business Services Srl,50093556
```

---

## Valori attesi per test formule (`tests/fixtures/formula_expectations.py`)

```python
# Input: progetto ITE00065885.1.1 con dati fixture sopra

HOURS_PER_MD = 8
FTE_HOURS_YEAR = 1700

# MD per risorsa Cosimo Lo Iacono, settimana 29 Mar - 04 Apr
# hours = 4 → MD = 4 / 8 = 0.5
COSIMO_WEEK1_MD = 0.5

# Blended net rate per il progetto ITE00065885.1.1 su tutte le righe fixture
# Σnet_revenue = 181.12 + 944 + 504.96 + 252.48 + 362.24 + 944 + 504.96 + 504.96 + 1120 + 181.12 = 5499.84
# Σhours = 4 + 8 + 8 + 4 + 8 + 8 + 8 + 8 + 8 + 4 = 68
# blended_net_rate = 5499.84 / 68 ≈ 80.88 EUR/h
BLENDED_NET_RATE = round(5499.84 / 68, 2)  # 80.88

# Residuo ore per ITE00065885.1.1
# iow_hours_total = 3952, hours_actual (snapshot BI) = 1911.5
# residuo_ore = 3952 - 1911.5 = 2040.5
RESIDUO_ORE = 2040.5

# Residuo EUR
# iow_net_revenue = 256381.67, net_revenue_act (snapshot BI) = 121304.95
# residuo_eur = 256381.67 - 121304.95 = 135076.72
RESIDUO_EUR = round(256381.67 - 121304.95, 2)  # 135076.72

# % Consumo
# pct_consumo = 1911.5 / 3952 * 100 ≈ 48.37%
PCT_CONSUMO = round(1911.5 / 3952 * 100, 2)  # 48.37
```

---

## Note ai test

1. I file CSV in `/tests/fixtures/` sono l'**unica** fonte dati per i test automatici. Non leggere mai i file `.xlsx` nei test.
2. I test di import devono usare `tests/fixtures/projects.csv` e `tests/fixtures/timesheet_ITE00065885_1_1.csv`.
3. I test di formule usano `tests/fixtures/formula_expectations.py` con valori hard-coded.
4. I test di API usano un DB SQLite in-memory popolato con le fixture.
