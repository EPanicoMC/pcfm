# Valori attesi per test formule — derivati dalle fixture CSV
# NON modificare senza aggiornare anche i test corrispondenti

HOURS_PER_MD = 8
FTE_HOURS_YEAR = 1700

# ── Progetto ITE00065885.1.1 (A2A - F26) ─────────────────────────────────────

# MD per Cosimo Lo Iacono, settimana "29 Mar - 04 Apr" (4h)
COSIMO_WEEK1_MD = 0.5  # 4 / 8

# Blended net rate su tutte le 10 righe fixture
# Σ net_revenue = 181.12+944+504.96+252.48+362.24+944+504.96+504.96+1120+181.12 = 5499.84
# Σ hours = 4+8+8+4+8+8+8+8+8+4 = 68
FIXTURE_TOTAL_NET_REVENUE = 5499.84
FIXTURE_TOTAL_HOURS = 68
BLENDED_NET_RATE = round(FIXTURE_TOTAL_NET_REVENUE / FIXTURE_TOTAL_HOURS, 2)  # 80.88

# Ore mensili dai fixture (per run rate)
# Marzo 2026: 4+8+8+4 = 24h (settimana "29 Mar - 04 Apr" → month_id 2026-03)
# Aprile 2026: 8+8+8+8 = 32h (settimane 41, 42, 43 → month_id 2026-04)
# Maggio 2026: 8+4 = 12h (settimane 44, 45 → month_id 2026-05)
MONTHLY_HOURS = {"2026-03": 24.0, "2026-04": 32.0, "2026-05": 12.0}
MONTHLY_NET_REVENUE = {
    "2026-03": round(181.12 + 944.0 + 504.96 + 252.48, 2),  # 1882.56
    "2026-04": round(362.24 + 944.0 + 504.96 + 504.96, 2),  # 2316.16
    "2026-05": round(1120.0 + 181.12, 2),  # 1301.12
}

# Run rate last_month (ultimo mese = maggio 2026)
RUN_RATE_LAST_MONTH_HOURS = 12.0
RUN_RATE_LAST_MONTH_NET_REVENUE = 1301.12

# Run rate last_3_months (media aritmetica mar+apr+mag)
RUN_RATE_3M_HOURS = round((24.0 + 32.0 + 12.0) / 3, 4)  # 22.6667
RUN_RATE_3M_NET_REVENUE = round((1882.56 + 2316.16 + 1301.12) / 3, 2)  # 1833.28

# Residuo (basato su snapshot BI in fact_project)
IOW_HOURS_TOTAL = 3952.0
IOW_NET_REVENUE = 256381.67
HOURS_ACTUAL_SNAPSHOT = 1911.5
NET_REVENUE_ACT_SNAPSHOT = 121304.95

RESIDUO_ORE = round(IOW_HOURS_TOTAL - HOURS_ACTUAL_SNAPSHOT, 2)  # 2040.5
RESIDUO_EUR = round(IOW_NET_REVENUE - NET_REVENUE_ACT_SNAPSHOT, 2)  # 135076.72

# % Consumo
PCT_CONSUMO = round(HOURS_ACTUAL_SNAPSHOT / IOW_HOURS_TOTAL * 100, 2)  # 48.37

# ── Progetto ITE00041182.1.1 (ARMANI 2025) ───────────────────────────────────
ARMANI_2025_PCT_CONSUMO = round(6182.5 / 6720.0 * 100, 2)  # 92.0
ARMANI_2025_RESIDUO_ORE = round(6720.0 - 6182.5, 2)  # 537.5
ARMANI_2025_RESIDUO_EUR = round(445531.5 - 445694.6, 2)  # -163.1 (leggermente sforato)

# ── Progetto ITE00060655.1.1 (A2A F25, In Chiusura) ─────────────────────────
A2A_F25_PCT_CONSUMO = round(4332.0 / 4332.0 * 100, 2)  # 100.0 (ore esaurite)
