# Data Model — SQLite

> Tutte le tabelle sono in `./data/pcfm.db`.
> Indici minimi indicati. Tutti i timestamp sono UTC.

---

## Dimensioni

### `dim_fiscal_calendar`

| Colonna | Tipo | Note |
|---|---|---|
| `fy` | INTEGER PK | Anno del FY (es. 2026 per FY26). |
| `fy_start_date` | DATE | Primo giorno del FY (es. 2025-07-01 per FY26). |
| `fy_end_date` | DATE | Ultimo giorno del FY (es. 2026-06-30 per FY26). |
| `label` | TEXT | Es. `"FY26"`. |

### `dim_week`

| Colonna | Tipo | Note |
|---|---|---|
| `week_id` | TEXT PK | ISO date del lunedì (es. `"2026-03-29"`). |
| `week_end` | DATE | Data della domenica. |
| `month_id` | TEXT | `YYYY-MM` del lunedì (regola: mese del lunedì). |
| `fy` | INTEGER FK → `dim_fiscal_calendar.fy` | |
| `fy_month` | INTEGER | Mese fiscale (1=Jul, 12=Jun). |
| `fy_week` | INTEGER | Settimana progressiva del FY. |
| `fy_month_week` | TEXT | Chiave `FYMonthWeek_PAR` dal BI (es. `"2026-09-40"`). |

### `dim_client`

| Colonna | Tipo | Note |
|---|---|---|
| `client_id` | INTEGER PK autoincrement | |
| `client_name` | TEXT UNIQUE | Ragione sociale (es. `"GIORGIO ARMANI SPA"`). |
| `client_group` | TEXT | Gruppo commerciale (es. `"GIORGIO ARMANI"`). |

### `dim_cost_center`

| Colonna | Tipo | Note |
|---|---|---|
| `cc_code` | TEXT PK | Codice CC (es. `"IT25000492"`). |
| `cc_name` | TEXT | Nome breve (es. `"PVT_CUSTOMER"`). |
| `bu` | TEXT | Business Unit (es. `"ADV_PVT"`). |
| `ou` | TEXT | Organizational Unit (es. `"P_CUSTOMER"`). |
| `los` | TEXT | Line of Service (es. `"ADVISORY"`). |
| `legal_entity` | TEXT | Entità legale (es. `"PwC Business Services Srl"`). |

### `dim_resource`

| Colonna | Tipo | Note |
|---|---|---|
| `resource_id` | TEXT PK | ID anagrafico (es. `"50093556"`). |
| `resource_name` | TEXT | Nome completo (es. `"Cosimo Lo Iacono"`). |
| `job_title` | TEXT | Livello al momento dell'ultimo import. |
| `resource_cost_center` | TEXT FK → `dim_cost_center.cc_code` | |
| `legal_entity` | TEXT | |
| `updated_at` | DATETIME | Timestamp ultimo aggiornamento. |

### `dim_engagement_owner`

| Colonna | Tipo | Note |
|---|---|---|
| `owner_id` | INTEGER PK autoincrement | |
| `name` | TEXT UNIQUE | Es. `"Enrico Panico"`. |
| `role` | TEXT | `"manager"` o `"partner"`. |

### `dim_assumption`

| Colonna | Tipo | Note |
|---|---|---|
| `key` | TEXT PK | Chiave parametro (es. `"hours_per_man_day"`). |
| `value` | REAL | Valore numerico. |
| `description` | TEXT | Descrizione umana. |
| `updated_at` | DATETIME | |

**Valori default**:
| key | value |
|---|---|
| `hours_per_man_day` | 8 |
| `working_days_per_month` | 21 |
| `fte_hours_per_year` | 1700 |
| `fy_start_month` | 7 |
| `forecast_window_default` | — (stringa, usa colonna apposita) |

---

## Fatti

### `fact_project`

Snapshot più recente dell'anagrafica e KPI economici cumulati per progetto (da file 9).

| Colonna | Tipo | Note |
|---|---|---|
| `project_id` | TEXT PK | Es. `"ITE00065885.1.1"`. |
| `project_title` | TEXT | |
| `client_id` | INTEGER FK → `dim_client.client_id` | |
| `debtor_account` | TEXT | |
| `legal_entity` | TEXT | |
| `product_code` | TEXT | |
| `opportunity_name` | TEXT | |
| `chargeable` | TEXT | `"Y"`. |
| `project_status` | TEXT | `"Aperto"`, `"In Chiusura"`. |
| `fy_closing` | INTEGER \| NULL | FY di chiusura pianificata. |
| `project_closing_date` | DATE \| NULL | |
| `engagement_manager` | TEXT | |
| `engagement_manager_cc` | TEXT \| NULL | |
| `engagement_partner` | TEXT | |
| `engagement_partner_cc` | TEXT \| NULL | |
| `hours_actual` | REAL | Ore cumulate da timesheet (snapshot BI). |
| `gross_revenue` | REAL | |
| `bi_real_pct_todo` | REAL \| NULL | `Real (%) To Do` dal BI — mostrato as-is. |
| `discount` | REAL | Negativo. |
| `wip_provision` | REAL \| NULL | |
| `net_revenue_act` | REAL | |
| `fees_as_expenses` | REAL | |
| `expenses_act` | REAL | |
| `lump_sum_act` | REAL | |
| `total_expenses_act` | REAL | |
| `billed_fees` | REAL | |
| `billed_expenses` | REAL | |
| `billed_amount` | REAL | |
| `wip` | REAL | |
| `margin_pct` | REAL | |
| `iow_hours_total` | REAL | Monte ore contrattuale. |
| `iow_contract_value` | REAL | |
| `iow_net_revenue` | REAL | Valore netto contrattuale. |
| `iow_expenses` | REAL | |
| `iow_lump_sum` | REAL | |
| `bi_report_url` | TEXT \| NULL | URL report PowerBI. |
| `last_import_id` | INTEGER FK → `imports.import_id` | Import che ha generato questo snapshot. |
| `is_stale` | INTEGER | `0` = attivo, `1` = non visto nell'ultimo import. |
| `last_seen_import_id` | INTEGER FK → `imports.import_id` | Ultimo import che ha visto questo record. |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

**Indici**: `project_id` (PK), `project_status`, `chargeable`, `is_stale`.

### `fact_project_history`

Storico delle variazioni di `fact_project`. Ogni update su `fact_project` genera un record qui.

| Colonna | Tipo | Note |
|---|---|---|
| `history_id` | INTEGER PK autoincrement | |
| `project_id` | TEXT FK → `fact_project.project_id` | |
| `import_id` | INTEGER FK → `imports.import_id` | |
| `snapshot_json` | TEXT | JSON del record prima della modifica. |
| `changed_fields` | TEXT | JSON array dei campi modificati. |
| `recorded_at` | DATETIME | |

### `fact_timesheet`

Una riga per risorsa × progetto × settimana.

| Colonna | Tipo | Note |
|---|---|---|
| `timesheet_id` | TEXT PK | `sha256(resource_id + "\|" + project_id + "\|" + week_id)`. |
| `project_id` | TEXT FK → `fact_project.project_id` | |
| `resource_id` | TEXT FK → `dim_resource.resource_id` | |
| `week_id` | TEXT FK → `dim_week.week_id` | Data lunedì (es. `"2026-03-29"`). |
| `fy` | INTEGER | |
| `fy_month_week` | TEXT | Es. `"2026-09-40"`. |
| `job_title` | TEXT | Livello al momento del caricamento. |
| `document_item_text` | TEXT \| NULL | |
| `hours_actual` | REAL | |
| `gross_revenue` | REAL | |
| `discount` | REAL | |
| `wip_provision` | REAL \| NULL | |
| `net_revenue_actual` | REAL | |
| `gross_rate` | REAL | |
| `net_rate` | REAL | |
| `resource_cost_center` | TEXT FK → `dim_cost_center.cc_code` | |
| `import_id` | INTEGER FK → `imports.import_id` | |
| `is_stale` | INTEGER | `0` / `1`. |
| `last_seen_import_id` | INTEGER | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

**Indici**: `project_id`, `resource_id`, `week_id`, `fy`, `resource_cost_center`, `is_stale`.

---

## Tabelle operative

### `forecast_override`

Override manuali del forecast mensile per progetto.

| Colonna | Tipo | Note |
|---|---|---|
| `override_id` | INTEGER PK autoincrement | |
| `project_id` | TEXT FK → `fact_project.project_id` | |
| `month_id` | TEXT | `YYYY-MM` del mese target. |
| `override_hours` | REAL \| NULL | Ore previste per il mese (override). |
| `override_net_revenue` | REAL \| NULL | Netto previsto per il mese (override). |
| `note` | TEXT \| NULL | Nota libera del manager. |
| `created_by` | TEXT | `"local"` in MVP. |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

**Unique**: `(project_id, month_id)`.

### `imports`

Registro di ogni operazione di import.

| Colonna | Tipo | Note |
|---|---|---|
| `import_id` | INTEGER PK autoincrement | |
| `file_type` | TEXT | `"project"` (file 9) o `"timesheet"` (file 8). |
| `original_filename` | TEXT | Nome file originale. |
| `project_id_extracted` | TEXT \| NULL | Per file 8: project_id estratto dal filename. |
| `import_ts` | DATETIME | Timestamp import (UTC). |
| `rows_inserted` | INTEGER | |
| `rows_updated` | INTEGER | |
| `rows_skipped` | INTEGER | |
| `rows_error` | INTEGER | |
| `backup_path` | TEXT \| NULL | Percorso del backup `.db` creato prima di questo import. |
| `status` | TEXT | `"success"`, `"partial"`, `"failed"`. |
| `log_path` | TEXT \| NULL | Percorso file log dettagliato. |

### `audit_log`

Log di tutte le modifiche manuali (override, assunzioni, ecc.).

| Colonna | Tipo | Note |
|---|---|---|
| `log_id` | INTEGER PK autoincrement | |
| `entity_type` | TEXT | `"forecast_override"`, `"dim_assumption"`, ecc. |
| `entity_id` | TEXT | Chiave del record modificato. |
| `action` | TEXT | `"insert"`, `"update"`, `"delete"`. |
| `field_name` | TEXT \| NULL | Campo specifico modificato (per update). |
| `old_value` | TEXT \| NULL | Valore precedente (JSON). |
| `new_value` | TEXT \| NULL | Nuovo valore (JSON). |
| `actor` | TEXT | `"local"` in MVP. |
| `recorded_at` | DATETIME | |
