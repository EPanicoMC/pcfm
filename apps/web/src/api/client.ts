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

export interface DashboardData {
  fy: number
  today: string
  totals: {
    project_count: number
    iow_hours_total: number
    iow_net_revenue_total: number
    ts_hours_total: number
    ts_net_revenue_total: number
    pct_consumo_globale: number | null
    residuo_ore_totale: number
    residuo_eur_totale: number
  }
  at_risk_count: number
  at_risk_projects: {
    project_id: string
    project_title: string | null
    project_status: string | null
    data_esaurimento: string | null
    giorni_residui: number | null
    residuo_ore: number | null
  }[]
  top_clients_by_revenue: {
    client_name: string
    ts_hours: number
    ts_net_revenue: number
    project_count: number
  }[]
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

  projects: (params?: { include_stale?: boolean; status?: string; fy?: number }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.fy) q.set('fy', String(params.fy))
    if (params?.include_stale) q.set('include_stale', 'true')
    return req<Project[]>(`/projects${q.toString() ? `?${q}` : ''}`)
  },

  project: (id: string) =>
    req<Project & { monthly_timesheet: MonthlyActual[] }>(`/projects/${encodeURIComponent(id)}`),

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
