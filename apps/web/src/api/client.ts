const BASE = '/api'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? res.statusText)
  }
  return res.json() as Promise<T>
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Project {
  project_id: string
  project_title: string | null
  client_name: string | null
  client_group: string | null
  project_status: string | null
  engagement_manager: string | null
  engagement_partner: string | null
  iow_hours_total: number | null
  iow_net_revenue: number | null
  iow_contract_value: number | null
  hours_actual: number | null
  net_revenue_act: number | null
  bi_real_pct_todo: number | null
  wip_provision: number | null
  margin_pct: number | null
  fy_closing: number | null
  is_stale: number
  product_code: string | null
  legal_entity: string | null
  ts_hours: number
  ts_net_revenue: number
  pct_consumo: number | null
  residuo_ore: number | null
  residuo_eur: number | null
}

export interface MonthlyActual {
  month_id: string
  hours: number
  net_revenue: number
  is_partial?: boolean
}

export interface RunRate {
  hours: number | null
  net_revenue: number | null
  window: string
  months_used: number
  complete_months_available: number
}

export interface ResourceBreakdown {
  resource_id: string
  resource_name: string
  job_title: string | null
  hours: number
  net_revenue: number
  gross_revenue: number
  blended_net_rate: number | null
  pct_nr: number | null
}

export interface FutureMonth {
  month_id: string
  projected_nr: number | null
  is_override: boolean
}

export interface ForecastOverride {
  override_id: number
  month_id: string
  override_hours: number | null
  override_net_revenue: number | null
  note: string | null
}

export interface ProjectForecast {
  project_id: string
  project_title: string | null
  project_status: string | null
  client_name: string | null
  client_group: string | null
  engagement_manager: string | null
  fy: number
  ts_hours_total: number
  ts_net_revenue_total: number
  iow_hours_total: number | null
  iow_net_revenue: number | null
  iow_contract_value: number | null
  pct_consumo_nr: number | null
  pct_consumo_ore: number | null
  run_rate: RunRate
  residuo_ore: number | null
  residuo_eur: number | null
  mesi_residui_nr: number | null
  mesi_residui_ore: number | null
  data_esaurimento: string | null
  at_risk: boolean
  scenari_nr: { low: number | null; base: number | null; high: number | null }
  scenari_ore: { low: number | null; base: number | null; high: number | null }
  forecast_fy_net_revenue: number | null
  actual_ytd_net_revenue: number
  actual_ytd_hours: number
  future_months_detail: FutureMonth[]
  overrides: ForecastOverride[]
  monthly_actuals: MonthlyActual[]
  resources: ResourceBreakdown[]
}

export interface DashboardBuBreakdown {
  bu: string
  ts_hours: number
  ts_net_revenue: number
  pct_of_total: number
}

export interface DashboardFyBreakdown {
  fy: number
  project_count: number
  open_count: number
  closed_count: number
  iow_net_revenue: number
  ts_net_revenue: number
  ts_hours: number
  by_bu: DashboardBuBreakdown[]
}

export interface DashboardClientFy {
  fy: number
  ts_net_revenue: number
  ts_hours: number
  project_count: number
  by_bu: DashboardBuBreakdown[]
}

export interface DashboardClient {
  client_name: string
  client_group: string | null
  project_count: number
  open_count: number
  closed_count: number
  ts_hours: number
  ts_net_revenue: number
  iow_net_revenue: number
  residuo_eur: number
  pct_consumo: number | null
  at_risk_count: number
  by_fy: DashboardClientFy[]
  by_bu: DashboardBuBreakdown[]
}

// ── Previsione chiusura FY ─────────────────────────────────────────────────

export interface DashboardFyForecastBu {
  bu: string
  forecasted_nr: number
  pct_of_forecast: number
}

export interface DashboardFyForecastClient {
  client_name: string
  client_group: string | null
  ts_nr_ytd: number
  ts_hours_ytd: number
  run_rate_weekly_nr: number
  run_rate_weekly_hours: number
  projected_additional_nr: number
  projected_total_nr: number
  available_budget: number
  available_budget_hours: number
  weeks_to_exhaustion: number | null
  saturation_date: string | null
  exhaustion_type: 'hours' | 'nr' | 'ok'
  coverage_status: 'green' | 'amber' | 'red' | 'grey'
  by_bu_forecast: DashboardFyForecastBu[]
}

export interface DashboardFyForecast {
  fy: number
  fy_end: string
  today: string
  days_remaining: number
  weeks_remaining: number
  global: {
    ts_nr_ytd: number
    projected_additional_nr: number
    projected_total_nr: number
    available_budget: number
    coverage_status: 'green' | 'amber' | 'red' | 'grey'
  }
  clients: DashboardFyForecastClient[]
}

export interface DashboardData {
  fy: number
  today: string
  totals: {
    project_count: number
    open_count: number
    closed_count: number
    iow_hours_total: number
    iow_net_revenue_total: number
    ts_hours_total: number
    ts_net_revenue_total: number
    pct_consumo_globale: number | null
    residuo_ore_totale: number
    residuo_eur_totale: number
  }
  by_fy: DashboardFyBreakdown[]
  by_bu: DashboardBuBreakdown[]
  clients: DashboardClient[]
  at_risk_count: number
  at_risk_projects: {
    project_id: string
    project_title: string | null
    project_status: string | null
    client_name: string | null
    data_esaurimento: string | null
    giorni_residui: number | null
    residuo_ore: number | null
  }[]
}

// ── ProjectDetail types ────────────────────────────────────────────────────────

export interface WeeklyResource {
  resource_id: string
  resource_name: string
  cc_code: string
  cc_name: string
  bu: string
  hours: number
  net_revenue: number
  realization_pct: number | null
}

export interface WeeklyLoad {
  week_id: string
  week_end: string | null
  fy: number
  hours: number
  net_revenue: number
  gross_revenue: number
  discount: number
  resources_active: number
  has_activity: boolean
  resources: WeeklyResource[]
}

export interface DetailEntry {
  week_id: string
  week_end: string | null
  fy: number
  cc_code: string
  cc_name: string
  bu: string
  hours: number
  net_revenue: number
  gross_revenue: number
  discount: number
}

export interface CostCenterBreakdown {
  cc_code: string
  cc_name: string
  ou: string | null
  hours: number
  net_revenue: number
  pct_nr: number | null
  blended_rate: number | null
}

export interface BuBreakdown {
  bu: string
  hours: number
  net_revenue: number
  pct_nr: number | null
  blended_rate: number | null
  cost_centers: CostCenterBreakdown[]
}

export interface FyBreakdown {
  fy: number
  weeks: number
  hours: number
  net_revenue: number
  pct_of_ts: number | null
}

export interface WeeklyForecast {
  last_week_id: string | null
  last_week_end: string | null
  last_week_nr: number | null
  last_week_hours: number | null
  avg_4w_nr: number | null
  avg_4w_hours: number | null
  residuo_eur: number | null
  weeks_to_saturation_lw: number | null
  weeks_to_saturation_4w: number | null
  saturation_date_lw: string | null
  saturation_date_4w: string | null
}

export interface ProjectDetailView {
  project_id: string
  project_title: string | null
  client_name: string | null
  client_group: string | null
  engagement_manager: string | null
  engagement_partner: string | null
  project_status: string | null
  legal_entity: string | null
  fy_closing: number | null
  product_code: string | null
  iow_contract_value: number | null
  iow_net_revenue: number | null
  iow_hours_total: number | null
  project_nr_actual: number | null
  project_hours_actual: number | null
  pct_consumo_nr: number | null
  pct_consumo_ore: number | null
  residuo_eur: number | null
  residuo_ore: number | null
  ts_nr_total: number
  ts_hours_total: number
  ts_gross_total: number
  ts_discount_total: number
  ts_realization_pct: number | null
  bi_real_pct: number | null
  margin_pct: number | null
  wip_provision: number | null
  by_bu: BuBreakdown[]
  by_fy: FyBreakdown[]
  weekly: WeeklyLoad[]
  entries: DetailEntry[]
  forecast: WeeklyForecast
}

export interface Assumption {
  key: string
  value_num: number | null
  value_str: string | null
  description: string | null
  updated_at: string
}

export interface ImportRecord {
  import_id: number
  file_type: string
  original_filename: string
  project_id_extracted: string | null
  import_ts: string
  rows_inserted: number | null
  rows_updated: number | null
  rows_skipped: number | null
  rows_error: number | null
  status: string
  backup_path: string | null
}

// ── API functions ──────────────────────────────────────────────────────────────

export const api = {
  dashboard: (fy?: number) =>
    req<DashboardData>(`/dashboard${fy ? `?fy=${fy}` : ''}`),

  fyForecast: (fy?: number) =>
    req<DashboardFyForecast>(`/dashboard/fy-forecast${fy ? `?fy=${fy}` : ''}`),

  projects: (params?: { include_stale?: boolean; status?: string; fy?: number }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.fy) q.set('fy', String(params.fy))
    if (params?.include_stale) q.set('include_stale', 'true')
    return req<Project[]>(`/projects${q.toString() ? `?${q}` : ''}`)
  },

  project: (id: string) =>
    req<Project & { monthly_timesheet: MonthlyActual[] }>(`/projects/${encodeURIComponent(id)}`),

  projectDetail: (id: string) =>
    req<ProjectDetailView>(`/projects/${encodeURIComponent(id)}/detail`),

  forecast: (id: string, window?: string) =>
    req<ProjectForecast>(
      `/projects/${encodeURIComponent(id)}/forecast${window ? `?window=${window}` : ''}`
    ),

  setOverride: (
    projectId: string,
    monthId: string,
    body: { override_net_revenue?: number | null; note?: string | null }
  ) =>
    req<ForecastOverride>(
      `/projects/${encodeURIComponent(projectId)}/forecast/override/${monthId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    ),

  deleteOverride: (projectId: string, monthId: string) =>
    fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/forecast/override/${monthId}`, {
      method: 'DELETE',
    }),

  assumptions: () => req<Assumption[]>('/assumptions'),

  updateAssumption: (key: string, value_num: number) =>
    req<Assumption>(`/assumptions/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value_num }),
    }),

  importHistory: () => req<ImportRecord[]>('/import/history'),

  confirmImport: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return req<Record<string, unknown>>('/import/confirm', { method: 'POST', body: form })
  },
}
