import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import {
  api,
  DashboardClient,
  DashboardClientFy,
  DashboardBuBreakdown,
  DashboardFyBreakdown,
  DashboardFyForecastClient,
  DashboardFyForecastBu,
  LastWeekResource,
  LastWeekSummary,
  ResourceFte,
  ResourceFteSummary,
  ResourceAllocation,
} from '../api/client'

// ── Formattatori ─────────────────────────────────────────────────────────────

function fmtEur(n: number | null | undefined, compact = false) {
  if (n == null) return '—'
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`
    if (Math.abs(n) >= 1_000) return `€${(n / 1_000).toFixed(0)}k`
    return `€${Math.round(n)}`
  }
  return new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)
}

function fmtN(n: number | null | undefined, dec = 0) {
  if (n == null) return '—'
  return n.toLocaleString('it-IT', { maximumFractionDigits: dec })
}

// ── Semaforo copertura budget ─────────────────────────────────────────────────

type CoverageStatus = 'green' | 'amber' | 'red' | 'grey'

function Semaforo({ status, size = 'md' }: { status: CoverageStatus; size?: 'sm' | 'md' | 'lg' }) {
  const dot: Record<CoverageStatus, string> = {
    green: 'bg-green-500',
    amber: 'bg-amber-400',
    red: 'bg-red-500',
    grey: 'bg-slate-300',
  }
  const label: Record<CoverageStatus, string> = {
    green: 'Coperto',
    amber: 'Parziale',
    red: 'Scoperto',
    grey: 'N/D',
  }
  const sz = size === 'sm' ? 'w-2 h-2' : size === 'lg' ? 'w-4 h-4' : 'w-3 h-3'
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`${sz} rounded-full inline-block flex-shrink-0 ${dot[status]}`} />
      {size !== 'sm' && (
        <span className={`text-xs font-medium ${
          status === 'green' ? 'text-green-700' :
          status === 'amber' ? 'text-amber-700' :
          status === 'red' ? 'text-red-700' : 'text-slate-400'
        }`}>{label[status]}</span>
      )}
    </span>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiBox({
  label, value, sub, accent = 'default',
}: { label: string; value: string | number | null; sub?: string; accent?: 'default' | 'red' | 'green' | 'amber' }) {
  const border = { default: 'border-blue-500', red: 'border-red-500', green: 'border-green-500', amber: 'border-amber-500' }[accent]
  return (
    <div className={`bg-white rounded-lg border border-slate-200 border-l-4 ${border} p-4 shadow-sm`}>
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1">{value ?? '—'}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Mini progress bar ─────────────────────────────────────────────────────────

function MiniBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-slate-400 text-xs">—</span>
  const capped = Math.min(Math.max(pct, 0), 100)
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-blue-500'
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${capped}%` }} />
      </div>
      <span className="text-xs w-10 text-right font-medium text-slate-600">{pct.toFixed(1)}%</span>
    </div>
  )
}

// ── Client card (cliccabile) ──────────────────────────────────────────────────

function ClientCard({
  client, selected, fyData, onSelect,
}: {
  client: DashboardClient
  selected: boolean
  fyData: DashboardClientFy | null  // dati per FY selezionato (null = tutti)
  onSelect: () => void
}) {
  const nr = fyData ? fyData.ts_net_revenue : client.ts_net_revenue
  const pct = fyData
    ? (client.iow_net_revenue ? nr / client.iow_net_revenue * 100 : null)
    : client.pct_consumo
  const hasRisk = client.at_risk_count > 0
  return (
    <button
      onClick={onSelect}
      className={`flex-shrink-0 w-52 rounded-xl border-2 p-3 text-left transition-all shadow-sm hover:shadow-md ${
        selected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'
      }`}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <p className="text-sm font-semibold text-slate-800 leading-tight line-clamp-2">{client.client_name}</p>
        {hasRisk && (
          <span className="flex-shrink-0 text-xs bg-red-100 text-red-600 font-semibold rounded-full px-1.5 py-0.5">
            ⚠ {client.at_risk_count}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-2">{client.open_count} ap. · {client.closed_count} ch.</p>
      <p className="text-base font-bold text-slate-700">{fmtEur(nr, true)}</p>
      <p className="text-xs text-slate-400">Budget: {fmtEur(client.iow_net_revenue, true)}</p>
      <div className="mt-2"><MiniBar pct={pct} /></div>
    </button>
  )
}

// ── FY Chart ─────────────────────────────────────────────────────────────────

function FyTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-700 mb-1">FY{String(label).slice(2)}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmtEur(p.value, true)}</p>
      ))}
    </div>
  )
}

function FyChart({
  data, selectedFy,
}: { data: DashboardFyBreakdown[]; selectedFy: number | null }) {
  const chartData = data.filter((d) => d.fy > 0).map((d) => ({
    fy: d.fy, label: `FY${String(d.fy).slice(2)}`,
    budget: d.iow_net_revenue, actual: d.ts_net_revenue,
  }))
  if (!chartData.length) return <p className="text-slate-400 text-sm text-center py-8">Nessun dato FY.</p>
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => fmtEur(v, true)} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={56} />
        <Tooltip content={<FyTooltip />} />
        <Bar dataKey="budget" name="Budget IOW" fill="#cbd5e1" radius={[3, 3, 0, 0]} maxBarSize={48} />
        <Bar dataKey="actual" name="NR Actual" radius={[3, 3, 0, 0]} maxBarSize={48}>
          {chartData.map((entry) => {
            const isSelected = selectedFy === entry.fy
            const pct = entry.budget > 0 ? entry.actual / entry.budget : 0
            const base = pct > 0.9 ? '#ef4444' : pct > 0.7 ? '#f59e0b' : '#3b82f6'
            return <Cell key={entry.fy} fill={base} opacity={selectedFy && !isSelected ? 0.35 : 1} />
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── BU breakdown ─────────────────────────────────────────────────────────────

function BuBreakdown({ data }: { data: DashboardBuBreakdown[] }) {
  if (!data.length) return <p className="text-slate-400 text-sm">Nessun dato BU.</p>
  return (
    <div className="space-y-4">
      {data.map((bu) => (
        <div key={bu.bu}>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="font-medium text-slate-700 truncate max-w-[160px]">{bu.bu}</span>
            <span className="text-slate-400 flex-shrink-0 ml-2">{fmtEur(bu.ts_net_revenue, true)} · {bu.pct_of_total.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(bu.pct_of_total, 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tab selector ──────────────────────────────────────────────────────────────

type Tab = 'overview' | 'previsioning' | 'risorse'

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'previsioning', label: 'Previsioning FY' },
    { id: 'risorse', label: 'Risorse / FTE' },
  ]
  return (
    <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
            active === t.id
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Riga forecast cliente (espandibile) ───────────────────────────────────────

// Genera le settimane future dal prossimo lunedì fino alla fine FY
function buildFutureWeeks(fyEndStr: string, runRateNr: number) {
  const fyEnd = new Date(fyEndStr)
  const today = new Date()
  // Trova il prossimo lunedì
  const dow = today.getDay()
  const daysToNextMon = dow === 0 ? 1 : dow === 1 ? 7 : 8 - dow
  const start = new Date(today)
  start.setDate(today.getDate() + daysToNextMon)

  const weeks: { week_id: string; label: string; nr: number }[] = []
  const cur = new Date(start)
  while (cur <= fyEnd && weeks.length < 12) {
    const fri = new Date(cur)
    fri.setDate(cur.getDate() + 4)
    weeks.push({
      week_id: cur.toISOString().split('T')[0],
      label: fri.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }),
      nr: runRateNr,
    })
    cur.setDate(cur.getDate() + 7)
  }
  return weeks
}

function ForecastClientRow({
  c, isLast, fyEnd,
}: {
  c: DashboardFyForecastClient
  isLast: boolean
  weeksRemaining: number
  fyEnd: string
}) {
  const [expanded, setExpanded] = useState(false)
  const borderBottom = isLast ? '' : 'border-b border-slate-100'

  const satDate = c.saturation_date
    ? new Date(c.saturation_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
    : null
  const coverageLabel = c.weeks_to_exhaustion != null
    ? `${c.weeks_to_exhaustion.toFixed(1)} sett${satDate ? ` (fino al ${satDate})` : ''}`
    : null
  const exhaustionLabel: Record<string, string> = {
    hours: 'ore esaurite',
    nr: 'budget NR esaurito',
    ok: '',
  }

  // Settimane future proiettate
  const futureWeeks = expanded && c.run_rate_weekly_nr > 0
    ? buildFutureWeeks(fyEnd, c.run_rate_weekly_nr)
    : []

  // Ultime 6 settimane storiche (base run rate)
  const historicalWeeks = c.actual_weeks_fy?.slice(0, 6) ?? []

  return (
    <>
      <tr
        className={`hover:bg-slate-50 transition-colors cursor-pointer ${borderBottom}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 w-3">{expanded ? '▾' : '▸'}</span>
            <div>
              <p className="text-sm font-semibold text-slate-800">{c.client_name}</p>
              {c.client_group && <p className="text-xs text-slate-400">{c.client_group}</p>}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          <p className="text-sm font-semibold text-slate-700">{fmtEur(c.ts_nr_ytd, true)}</p>
          <p className="text-xs text-slate-400">{fmtN(c.ts_hours_ytd, 0)}h</p>
        </td>
        <td className="px-4 py-3 text-right text-sm text-slate-600">
          {fmtEur(c.run_rate_weekly_nr, true)}<span className="text-xs text-slate-400">/sett</span>
        </td>
        <td className="px-4 py-3 text-right">
          <p className="text-sm font-semibold text-blue-600">+{fmtEur(c.projected_additional_nr, true)}</p>
        </td>
        <td className="px-4 py-3 text-right">
          <p className="text-sm font-bold text-slate-800">{fmtEur(c.projected_total_nr)}</p>
        </td>
        <td className="px-4 py-3 text-right">
          <p className={`text-sm font-semibold ${c.available_budget < 0 ? 'text-red-600' : 'text-slate-700'}`}>
            {fmtEur(c.available_budget, true)}
          </p>
          {c.available_budget_hours > 0 && (
            <p className="text-xs text-slate-400">{fmtN(c.available_budget_hours, 0)} ore res.</p>
          )}
        </td>
        <td className="px-4 py-3">
          <Semaforo status={c.coverage_status} />
          {coverageLabel && c.coverage_status !== 'green' && (
            <p className={`text-xs mt-0.5 ${c.coverage_status === 'red' ? 'text-red-500' : 'text-amber-600'}`}>
              {coverageLabel}
            </p>
          )}
          {c.exhaustion_type !== 'ok' && c.coverage_status !== 'green' && (
            <p className="text-xs text-slate-400">{exhaustionLabel[c.exhaustion_type]}</p>
          )}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={7} className={`bg-slate-50 px-8 py-4 ${borderBottom}`}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* BU→CC breakdown previsto (come richiesto dallo screenshot) */}
              {c.by_bu_forecast.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Breakdown BU previsto</p>
                  <div className="space-y-2.5">
                    {c.by_bu_forecast.map((bu: DashboardFyForecastBu) => (
                      <div key={bu.bu}>
                        {/* Riga Business Unit */}
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="font-semibold text-slate-700">{bu.bu}</span>
                          <span className="text-slate-600 font-medium">
                            {fmtEur(bu.forecasted_nr, true)} · {bu.pct_of_forecast.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${bu.pct_of_forecast}%` }} />
                        </div>
                        {/* Sub-righe Centro di Costo (sempre espanse se presenti) */}
                        <div className="pl-3 space-y-1.5 border-l-2 border-slate-100 ml-1 mt-1">
                          {bu.by_cc.map((cc) => (
                            <div key={cc.cc_code} className="flex justify-between items-start text-xs">
                              <div>
                                <p className="text-slate-700 font-medium leading-tight">{cc.cc_name}</p>
                                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  {cc.cc_code} {cc.ou ? `· ${cc.ou}` : ''}
                                </p>
                              </div>
                              <div className="text-right flex-shrink-0 ml-2">
                                <p className="text-slate-600">{fmtEur(cc.forecasted_nr, true)}</p>
                                <p className="text-[10px] text-slate-400">{cc.pct_of_bu.toFixed(0)}% BU</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Piano settimane: storico + proiezione */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Piano settimanale
                </p>
                <div className="flex flex-wrap gap-1">
                  {/* Settimane storiche (ultime 6, dal più vecchio) */}
                  {[...historicalWeeks].reverse().map((w) => {
                    const label = w.week_id
                      ? new Date(w.week_id).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
                      : w.week_id
                    return (
                      <div key={`h-${w.week_id}`}
                        className="bg-slate-200 rounded px-2 py-1 text-center min-w-[60px]"
                        title={`Settimana ${w.week_id}`}
                      >
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className="text-xs font-semibold text-slate-700">{fmtEur(w.nr, true)}</p>
                      </div>
                    )
                  })}
                  {/* Separatore oggi */}
                  <div className="flex items-center px-1">
                    <div className="w-px h-8 bg-blue-400" />
                    <span className="text-xs text-blue-500 ml-0.5 -mt-1">oggi</span>
                  </div>
                  {/* Settimane future proiettate */}
                  {futureWeeks.map((w) => (
                    <div key={`f-${w.week_id}`}
                      className="bg-blue-50 border border-blue-200 rounded px-2 py-1 text-center min-w-[60px]"
                    >
                      <p className="text-xs text-blue-400">{w.label}</p>
                      <p className="text-xs font-semibold text-blue-700">{fmtEur(w.nr, true)}</p>
                    </div>
                  ))}
                  {futureWeeks.length === 0 && c.run_rate_weekly_nr === 0 && (
                    <p className="text-xs text-slate-400 italic">Nessuna attività prevista (run rate = 0)</p>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Grigio = storico · Blu = proiettato ({fmtEur(c.run_rate_weekly_nr, true)}/sett)
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Widget ultima settimana ───────────────────────────────────────────────────

function FlagBadge({ flag, dev }: { flag: LastWeekResource['flag']; dev: number | null }) {
  if (flag === 'new') return <span className="text-xs text-slate-400 italic">nuovo</span>
  if (flag === 'normal') return <span className="text-xs text-green-600 font-medium">✓</span>
  const isHigh = flag === 'high'
  return (
    <span className={`text-xs font-semibold ${isHigh ? 'text-orange-600' : 'text-red-600'}`}>
      {isHigh ? '▲' : '▼'} {dev != null ? `${Math.abs(dev).toFixed(0)}%` : ''}
    </span>
  )
}

function LastWeekWidget() {
  const [expanded, setExpanded] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-last-week'],
    queryFn: () => api.lastWeek(),
  })

  if (isLoading) return null
  if (!data || !data.week_id) return null

  const weekLabel = data.week_end
    ? new Date(data.week_end).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
    : data.week_id

  const anomalies = data.resources.filter((r) => r.flag === 'high' || r.flag === 'low')
  const displayResources = showAll ? data.resources : data.resources.slice(0, 8)

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      {/* Header cliccabile */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors rounded-xl"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">Caricamenti ultima settimana</span>
          <span className="text-xs text-slate-400 font-normal">· settimana {weekLabel}</span>
          <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 font-medium">
            {data.total_resources} risorse · {fmtN(data.total_hours, 0)}h totali
          </span>
          {anomalies.length > 0 && (
            <span className="text-xs bg-red-50 text-red-600 rounded-full px-2 py-0.5 font-semibold">
              ⚠ {anomalies.length} anomali{anomalies.length === 1 ? 'a' : 'e'}
            </span>
          )}
        </div>
        <span className="text-slate-400 text-xs">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 uppercase tracking-wide">
                <th className="text-left px-4 py-2 font-medium">Risorsa</th>
                <th className="text-left px-4 py-2 font-medium">BU</th>
                <th className="text-right px-4 py-2 font-medium">Ore sett.</th>
                <th className="text-right px-4 py-2 font-medium">Media 4w</th>
                <th className="text-right px-4 py-2 font-medium">FTE stim.</th>
                <th className="text-center px-4 py-2 font-medium">Δ vs media</th>
                <th className="text-left px-4 py-2 font-medium">Progetti</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayResources.map((r) => {
                const isAnomaly = r.flag === 'high' || r.flag === 'low'
                // FTE stimato dalla media 4w (avg_4w / 40h settimanali standard)
                const fte = r.avg_4w_hours != null ? (r.avg_4w_hours / 40) : null
                return (
                  <tr key={r.resource_id} className={isAnomaly ? 'bg-red-50/40' : 'hover:bg-slate-50'}>
                    <td className="px-4 py-2 font-medium text-slate-700">{r.resource_name}</td>
                    <td className="px-4 py-2 text-slate-500">{r.bu}</td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-800">
                      {fmtN(r.hours_last_week, 1)}h
                    </td>
                    <td className="px-4 py-2 text-right text-slate-400">
                      {r.avg_4w_hours != null ? `${fmtN(r.avg_4w_hours, 1)}h` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500">
                      {fte != null ? `${fte.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <FlagBadge flag={r.flag} dev={r.deviation_pct} />
                    </td>
                    <td className="px-4 py-2 text-slate-400 max-w-[280px] truncate">
                      {r.projects.map((p) => `${p.project_id} (${p.hours}h)`).join(' · ')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {data.resources.length > 8 && (
            <div className="px-4 py-2 border-t border-slate-100 text-center">
              <button
                onClick={() => setShowAll((v) => !v)}
                className="text-xs text-blue-600 hover:underline"
              >
                {showAll ? `Mostra meno` : `Mostra tutte le ${data.resources.length} risorse`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab Previsioning ──────────────────────────────────────────────────────────

function PrevisioningTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-fy-forecast'],
    queryFn: () => api.fyForecast(),
  })

  if (isLoading) return <div className="p-8 text-slate-500">Calcolo previsione...</div>
  if (error) return <div className="p-8 text-red-600">Errore: {(error as Error).message}</div>
  if (!data) return null

  const { global: g, clients, fy, fy_end, weeks_remaining, days_remaining } = data

  const fyEndFormatted = new Date(fy_end).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const residuoAccent = g.available_budget < g.projected_additional_nr ? 'red' : 'green'

  return (
    <div className="space-y-5">
      {/* Header previsioning */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-blue-100 text-sm font-medium">Previsione chiusura</p>
            <h2 className="text-xl font-bold">FY{String(fy).slice(2)} · {fyEndFormatted}</h2>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-blue-200 text-xs">Giorni rimanenti</p>
              <p className="text-2xl font-bold">{days_remaining}</p>
            </div>
            <div className="text-center">
              <p className="text-blue-200 text-xs">Settimane</p>
              <p className="text-2xl font-bold">{weeks_remaining.toFixed(1)}</p>
            </div>
            <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
              <Semaforo status={g.coverage_status} size="lg" />
              <span className="text-sm font-semibold text-white">
                {{green: 'Budget ok', amber: 'Budget parziale', red: 'Budget insufficiente', grey: 'Nessuna prod.'}[g.coverage_status]}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI globali previsioning */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiBox
          label="NR prodotto YTD"
          value={fmtEur(g.ts_nr_ytd)}
          sub={`FY${String(fy).slice(2)} corrente`}
        />
        <KpiBox
          label="NR previsto aggiunta"
          value={`+${fmtEur(g.projected_additional_nr)}`}
          sub={`${weeks_remaining.toFixed(1)} sett × run rate`}
          accent="default"
        />
        <KpiBox
          label="Totale previsto FY"
          value={fmtEur(g.projected_total_nr)}
          sub="al 30 giugno"
          accent={g.coverage_status === 'red' ? 'red' : g.coverage_status === 'amber' ? 'amber' : 'green'}
        />
        <KpiBox
          label="Budget residuo"
          value={fmtEur(g.available_budget)}
          sub={g.available_budget >= g.projected_additional_nr ? '✓ Copre il previsto' : '⚠ Insufficiente'}
          accent={residuoAccent}
        />
      </div>

      {/* Nota metodologica */}
      <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-4 py-2.5 border border-slate-200">
        <span className="text-slate-400 mt-0.5">ℹ</span>
        <span>
          Run rate calcolato sulla media delle ultime 4 settimane con dati nel FY{String(fy).slice(2)}.
          Budget residuo = IOW NR – NR consumato (all-time). Il semaforo indica se il budget copre la produzione prevista.
          BU breakdown basato sul mix FY{String(fy).slice(2)}.
        </span>
      </div>

      {/* Tabella per cliente */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3">Cliente</th>
              <th className="text-right px-4 py-3">NR YTD</th>
              <th className="text-right px-4 py-3">Run Rate</th>
              <th className="text-right px-4 py-3">+ Previsto</th>
              <th className="text-right px-4 py-3">Totale FY</th>
              <th className="text-right px-4 py-3">Budget residuo</th>
              <th className="px-4 py-3">Stato</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Nessun dato disponibile per la previsione.
                </td>
              </tr>
            )}
            {clients.map((c, i) => (
              <ForecastClientRow
                key={c.client_name}
                c={c}
                isLast={i === clients.length - 1}
                weeksRemaining={weeks_remaining}
                fyEnd={fy_end}
              />
            ))}
          </tbody>
          {clients.length > 1 && (
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-sm">
                <td className="px-4 py-3 text-slate-600">Totale portfolio</td>
                <td className="px-4 py-3 text-right text-slate-800">{fmtEur(g.ts_nr_ytd, true)}</td>
                <td className="px-4 py-3 text-right text-slate-500">
                  {fmtEur(clients.reduce((s, c) => s + c.run_rate_weekly_nr, 0), true)}/sett
                </td>
                <td className="px-4 py-3 text-right text-blue-600">+{fmtEur(g.projected_additional_nr, true)}</td>
                <td className="px-4 py-3 text-right text-slate-800">{fmtEur(g.projected_total_nr)}</td>
                <td className={`px-4 py-3 text-right ${g.available_budget < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                  {fmtEur(g.available_budget, true)}
                </td>
                <td className="px-4 py-3"><Semaforo status={g.coverage_status} /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ── Tab Risorse / FTE ─────────────────────────────────────────────────────────

// Palette colori per distribuzione progetti (max 5 barre)
const PROJECT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444']

function ResourceRow({ r }: { r: ResourceFte }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <tr
        className="hover:bg-slate-50 cursor-pointer border-b border-slate-100"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-xs w-3">{expanded ? '▾' : '▸'}</span>
            <span className="font-medium text-slate-800 text-sm">{r.resource_name}</span>
          </div>
        </td>
        <td className="px-4 py-2.5 text-xs text-slate-500">{r.bu}</td>
        <td className="px-4 py-2.5 text-right text-sm text-slate-700 font-medium">{fmtN(r.total_hours, 0)}h</td>
        <td className="px-4 py-2.5 text-right text-xs text-slate-500">{r.active_weeks} sett.</td>
        <td className="px-4 py-2.5 text-right">
          <span className={`text-sm font-bold ${r.fte >= 0.8 ? 'text-green-700' : r.fte >= 0.5 ? 'text-amber-600' : 'text-slate-500'}`}>
            {r.fte.toFixed(2)}
          </span>
          <span className="text-xs text-slate-400 ml-0.5">FTE</span>
        </td>
        <td className="px-4 py-2.5 text-right text-sm text-slate-600">{r.days_per_month.toFixed(1)} gg</td>
        <td className="px-4 py-2.5">
          {/* Barra distribuzione progetto segmentata */}
          <div className="flex h-3 rounded overflow-hidden w-32 gap-px">
            {r.projects.slice(0, 5).map((p, i) => (
              <div
                key={p.project_id}
                style={{ width: `${p.pct_of_time}%`, backgroundColor: PROJECT_COLORS[i] }}
                title={`${p.project_id}: ${p.pct_of_time.toFixed(0)}%`}
              />
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[160px]">
            {r.projects.slice(0, 2).map((p) =>
              `${p.project_id.slice(-12)} ${p.pct_of_time.toFixed(0)}%`
            ).join(' · ')}
            {r.projects.length > 2 && ` +${r.projects.length - 2}`}
          </p>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-slate-50 border-b border-slate-100 px-8 py-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Dettaglio per progetto · FTE calcolato su {r.active_weeks} settimane attive
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 text-left">
                  <th className="pb-1 font-medium">Codice</th>
                  <th className="pb-1 font-medium">Titolo</th>
                  <th className="pb-1 font-medium text-right">Ore</th>
                  <th className="pb-1 font-medium text-right">FTE su cod.</th>
                  <th className="pb-1 font-medium text-right">Gg/mese</th>
                  <th className="pb-1 font-medium text-right">% tempo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.projects.map((p, i) => (
                  <tr key={p.project_id}>
                    <td className="py-1.5">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                        style={{ backgroundColor: PROJECT_COLORS[i] ?? '#94a3b8' }} />
                      <span className="font-mono text-slate-700">{p.project_id}</span>
                    </td>
                    <td className="py-1.5 text-slate-500 max-w-[200px] truncate">{p.project_title ?? '—'}</td>
                    <td className="py-1.5 text-right font-medium text-slate-700">{fmtN(p.hours, 1)}h</td>
                    <td className="py-1.5 text-right font-bold text-blue-700">{p.fte.toFixed(2)}</td>
                    <td className="py-1.5 text-right text-slate-600">{(p.fte * 20).toFixed(1)} gg</td>
                    <td className="py-1.5 text-right text-slate-500">{p.pct_of_time.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Pannello form allocazioni target ─────────────────────────────────────────

function AllocationFormPanel({
  rows,
  loading,
  dirty,
  saving,
  onAdd,
  onUpdate,
  onRemove,
  onSave,
  fteData,
  onPrecompile,
}: {
  rows: ResourceAllocation[]
  loading: boolean
  dirty: boolean
  saving: boolean
  onAdd: () => void
  onUpdate: (i: number, field: keyof ResourceAllocation, value: unknown) => void
  onRemove: (i: number) => void
  onSave: () => void
  fteData: ResourceFteSummary | undefined
  onPrecompile: (suggestions: ResourceAllocation[]) => void
}) {
  const [showFte, setShowFte] = useState(false)
  const [precompiling, setPrecompiling] = useState(false)

  const { data: projectsData } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => api.projects(),
    staleTime: 60_000,
  })

  const knownResources = useMemo(
    () => (fteData ? [...new Set(fteData.resources.map((r) => r.resource_name))].sort() : []),
    [fteData]
  )

  const knownClients = useMemo(() => {
    const clients = new Set<string>()
    rows.forEach((r) => r.client_name && clients.add(r.client_name))
    return [...clients].sort()
  }, [rows])

  // Genera suggerimenti da storico FTE + project list (project_id → client_name)
  const handlePrecompile = () => {
    if (!fteData || !projectsData) return
    setPrecompiling(true)
    const projToClient: Record<string, string> = {}
    for (const p of projectsData) {
      if (p.client_name) projToClient[p.project_id] = p.client_name
    }
    // Per ogni risorsa: aggrega ore per cliente, calcola % effettiva
    const suggestions: ResourceAllocation[] = []
    for (const res of fteData.resources) {
      const clientHours: Record<string, number> = {}
      for (const p of res.projects) {
        const cn = projToClient[p.project_id]
        if (cn) clientHours[cn] = (clientHours[cn] ?? 0) + p.hours
      }
      const totalH = Object.values(clientHours).reduce((s, h) => s + h, 0)
      if (totalH === 0) continue
      for (const [clientName, hours] of Object.entries(clientHours)) {
        const pct = Math.round((hours / totalH) * 100)
        if (pct < 5) continue  // ignora contributi minimi
        suggestions.push({
          resource_name: res.resource_name,
          client_name: clientName,
          fte_target_pct: pct,
          note: 'Pre-compilato da storico FY corrente',
        })
      }
    }
    onPrecompile(suggestions)
    setPrecompiling(false)
  }

  // Riepilogo % per risorsa (somma su tutti i clienti)
  const totalByResource = useMemo(
    () =>
      rows.reduce<Record<string, number>>((acc, r) => {
        if (r.resource_name) acc[r.resource_name] = (acc[r.resource_name] ?? 0) + r.fte_target_pct
        return acc
      }, {}),
    [rows]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Allocazioni target</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Indica la % di carico attesa per ogni risorsa gestita su ogni cliente · usato per il monitoraggio
          </p>
        </div>
        <div className="flex gap-2">
          {dirty && (
            <button
              onClick={onSave}
              disabled={saving}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Salvataggio...' : 'Salva'}
            </button>
          )}
          {rows.length === 0 && fteData && (
            <button
              onClick={handlePrecompile}
              disabled={precompiling}
              title="Suggerisce le coppie risorsa × cliente in base allo storico FY corrente"
              className="px-3 py-1.5 border border-blue-200 rounded-lg text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"
            >
              {precompiling ? '...' : '⟳ Pre-compila da storico'}
            </button>
          )}
          <button
            onClick={onAdd}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:border-blue-300"
          >
            + Aggiungi
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-slate-400 text-center">Caricamento...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-400 uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Risorsa</th>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-center px-4 py-3 font-medium">% target</th>
                <th className="text-left px-4 py-3 font-medium">Note</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Nessuna allocazione configurata · clicca "+ Aggiungi" per iniziare
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2">
                    <input
                      list={`res-list-${i}`}
                      value={row.resource_name}
                      onChange={(e) => onUpdate(i, 'resource_name', e.target.value)}
                      placeholder="Nome risorsa..."
                      className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
                    />
                    <datalist id={`res-list-${i}`}>
                      {knownResources.map((n) => <option key={n} value={n} />)}
                    </datalist>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      list={`cli-list-${i}`}
                      value={row.client_name}
                      onChange={(e) => onUpdate(i, 'client_name', e.target.value)}
                      placeholder="Cliente..."
                      className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
                    />
                    <datalist id={`cli-list-${i}`}>
                      {knownClients.map((n) => <option key={n} value={n} />)}
                    </datalist>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex items-center gap-1 justify-center">
                      <input
                        type="number"
                        min={0}
                        max={200}
                        step={5}
                        value={row.fte_target_pct}
                        onChange={(e) => onUpdate(i, 'fte_target_pct', parseFloat(e.target.value) || 0)}
                        className="w-20 border border-slate-200 rounded px-2 py-1 text-sm text-center focus:outline-none focus:border-blue-400"
                      />
                      <span className="text-slate-400 text-xs">%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={row.note ?? ''}
                      onChange={(e) => onUpdate(i, 'note', e.target.value || null)}
                      placeholder="Opzionale..."
                      className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => onRemove(i)}
                      className="text-slate-300 hover:text-red-500 text-lg leading-none"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Riepilogo % totale per risorsa */}
      {Object.keys(totalByResource).length > 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Totale % per risorsa
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(totalByResource)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, total]) => (
                <span
                  key={name}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    total > 110
                      ? 'bg-red-100 text-red-700'
                      : total < 90
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {name} — {total}%
                </span>
              ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Verde 90–110% · Arancio &lt;90% · Rosso &gt;110%
          </p>
        </div>
      )}

      {/* Controcheck FTE storico collassabile */}
      {fteData && (
        <div>
          <button
            onClick={() => setShowFte((v) => !v)}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-600"
          >
            <span>{showFte ? '▾' : '▸'}</span>
            Distribuzione FTE storica da timesheet (solo controcheck)
          </button>
          {showFte && (
            <div className="mt-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Risorsa</th>
                    <th className="text-left px-4 py-3 font-medium">BU</th>
                    <th className="text-right px-4 py-3 font-medium">Ore FY</th>
                    <th className="text-right px-4 py-3 font-medium">Sett. att.</th>
                    <th className="text-right px-4 py-3 font-medium">FTE</th>
                    <th className="text-right px-4 py-3 font-medium">Gg/mese</th>
                    <th className="px-4 py-3 font-medium">Distribuzione</th>
                  </tr>
                </thead>
                <tbody>
                  {fteData.resources.map((r) => (
                    <ResourceRow key={r.resource_id} r={r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Pannello monitoraggio vs target ──────────────────────────────────────────

function MonitoringPanel({
  allocations,
  lwData,
}: {
  allocations: ResourceAllocation[]
  lwData: LastWeekSummary | undefined
}) {
  // Raggruppa allocazioni per resource_name
  const targetByResource = useMemo(() => {
    const map: Record<string, { client_name: string; fte_target_pct: number }[]> = {}
    for (const a of allocations) {
      if (a.resource_name) {
        ;(map[a.resource_name] ??= []).push({ client_name: a.client_name, fte_target_pct: a.fte_target_pct })
      }
    }
    return map
  }, [allocations])

  if (!lwData) return <div className="p-8 text-slate-400 text-center">Caricamento dati ultima settimana...</div>

  const managedNames = new Set(Object.keys(targetByResource))
  const managedResources = lwData.resources.filter((r) => managedNames.has(r.resource_name))
  const unmanagedResources = lwData.resources.filter((r) => !managedNames.has(r.resource_name))

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-slate-700">
          Monitoraggio — settimana {lwData.week_id ?? '—'}
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Ore effettive vs target settimanale (% target × 40h)
        </p>
      </div>

      {allocations.length === 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 text-center">
          <p className="text-slate-500 text-sm">Nessuna allocazione configurata.</p>
          <p className="text-xs text-slate-400 mt-1">
            Vai su "Allocazioni target" per aggiungere le risorse che gestisci.
          </p>
        </div>
      )}

      {/* Risorse gestite */}
      {managedResources.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Risorse gestite</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-100">
                <th className="text-left px-4 py-2 font-medium">Risorsa</th>
                <th className="text-right px-4 py-2 font-medium">Ore eff.</th>
                <th className="text-right px-4 py-2 font-medium">Target sett.</th>
                <th className="text-right px-4 py-2 font-medium">Δ%</th>
                <th className="px-4 py-2 font-medium">Allocazione</th>
              </tr>
            </thead>
            <tbody>
              {managedResources.map((r) => {
                const targets = targetByResource[r.resource_name] ?? []
                const totalPct = targets.reduce((s, t) => s + t.fte_target_pct, 0)
                const expectedHours = (totalPct / 100) * 40
                const delta = expectedHours > 0
                  ? ((r.hours_last_week - expectedHours) / expectedHours) * 100
                  : null
                const isHigh = delta !== null && delta > 25
                const isLow = delta !== null && delta < -25
                return (
                  <tr
                    key={r.resource_id}
                    className={`border-b border-slate-100 ${isHigh ? 'bg-amber-50' : isLow ? 'bg-red-50' : ''}`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-slate-800">{r.resource_name}</span>
                      <span className="text-xs text-slate-400 ml-1.5">{r.bu}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-700">
                      {r.hours_last_week.toFixed(1)}h
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500">
                      {expectedHours.toFixed(1)}h
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {delta !== null ? (
                        <span
                          className={`font-bold ${
                            isHigh ? 'text-amber-600' : isLow ? 'text-red-600' : 'text-green-600'
                          }`}
                        >
                          {delta > 0 ? '+' : ''}
                          {delta.toFixed(0)}%
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {targets.map((t) => (
                          <span
                            key={t.client_name}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs"
                          >
                            {t.client_name} {t.fte_target_pct}%
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {allocations.length > 0 && managedResources.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
          Nessuna delle risorse gestite ha caricato nell'ultima settimana.
        </div>
      )}

      {/* Risorse non gestite */}
      {unmanagedResources.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Altre risorse (deviazione su media 4w)
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-100">
                <th className="text-left px-4 py-2 font-medium">Risorsa</th>
                <th className="text-right px-4 py-2 font-medium">Ore eff.</th>
                <th className="text-right px-4 py-2 font-medium">Media 4w</th>
                <th className="text-right px-4 py-2 font-medium">Δ%</th>
                <th className="px-4 py-2 font-medium">Progetti</th>
              </tr>
            </thead>
            <tbody>
              {unmanagedResources.map((r) => (
                <tr key={r.resource_id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2">
                    <span className="text-slate-700">{r.resource_name}</span>
                    <span className="text-xs text-slate-400 ml-1.5">{r.bu}</span>
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.hours_last_week.toFixed(1)}h</td>
                  <td className="px-4 py-2 text-right text-slate-400">
                    {r.avg_4w_hours?.toFixed(1) ?? '—'}h
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.deviation_pct !== null ? (
                      <span
                        className={`text-xs font-medium ${
                          r.flag === 'high'
                            ? 'text-amber-600'
                            : r.flag === 'low'
                            ? 'text-red-600'
                            : 'text-slate-500'
                        }`}
                      >
                        {r.deviation_pct > 0 ? '+' : ''}
                        {r.deviation_pct}%
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">nuovo</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-400">
                    {r.projects.slice(0, 2).map((p) => p.project_id.slice(-8)).join(' · ')}
                    {r.projects.length > 2 && ` +${r.projects.length - 2}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab principale Risorse ────────────────────────────────────────────────────

function ResourceFteTab() {
  const [subTab, setSubTab] = useState<'allocazioni' | 'monitoraggio'>('allocazioni')
  const queryClient = useQueryClient()

  const { data: allocData, isLoading: allocLoading } = useQuery({
    queryKey: ['allocations'],
    queryFn: () => api.allocations(),
  })

  const { data: lwData } = useQuery({
    queryKey: ['last-week'],
    queryFn: () => api.lastWeek(),
  })

  const { data: fteData } = useQuery({
    queryKey: ['dashboard-resources'],
    queryFn: () => api.resources(),
  })

  const [rows, setRows] = useState<ResourceAllocation[]>([])
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (allocData) setRows(allocData)
  }, [allocData])

  const saveMut = useMutation({
    mutationFn: () =>
      api.saveAllocations(
        rows.map((r) => ({
          resource_name: r.resource_name,
          client_name: r.client_name,
          fte_target_pct: r.fte_target_pct,
          note: r.note,
        }))
      ),
    onSuccess: (newData) => {
      queryClient.setQueryData(['allocations'], newData)
      setDirty(false)
    },
  })

  const addRow = () => {
    setRows((prev) => [...prev, { resource_name: '', client_name: '', fte_target_pct: 100, note: null }])
    setDirty(true)
  }

  const updateRow = (i: number, field: keyof ResourceAllocation, value: unknown) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))
    setDirty(true)
  }

  const removeRow = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
    setDirty(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['allocazioni', 'monitoraggio'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              subTab === t
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'
            }`}
          >
            {t === 'allocazioni' ? 'Allocazioni target' : 'Monitoraggio'}
          </button>
        ))}
      </div>

      {subTab === 'allocazioni' && (
        <AllocationFormPanel
          rows={rows}
          loading={allocLoading}
          dirty={dirty}
          saving={saveMut.isPending}
          onAdd={addRow}
          onUpdate={updateRow}
          onRemove={removeRow}
          onSave={() => saveMut.mutate()}
          fteData={fteData}
          onPrecompile={(suggestions) => {
            setRows(suggestions)
            setDirty(true)
          }}
        />
      )}

      {subTab === 'monitoraggio' && (
        <MonitoringPanel allocations={rows} lwData={lwData} />
      )}
    </div>
  )
}

// ── Dashboard principale ──────────────────────────────────────────────────────

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [selectedClient, setSelectedClient] = useState<string | null>(null)
  const [selectedFy, setSelectedFy] = useState<number | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.dashboard(),
  })

  const activeClient = useMemo(
    () => data?.clients.find((c) => c.client_name === selectedClient) ?? null,
    [data, selectedClient]
  )

  // KPI aggregati in base a selezione FY e/o cliente
  const displayTotals = useMemo(() => {
    if (!data) return null
    if (selectedFy) {
      const fyRow = data.by_fy.find((f) => f.fy === selectedFy)
      if (fyRow) {
        const openCount = activeClient
          ? (activeClient.by_fy.find((f) => f.fy === selectedFy)?.project_count ?? 0)
          : fyRow.project_count
        const nrForClient = activeClient
          ? (activeClient.by_fy.find((f) => f.fy === selectedFy)?.ts_net_revenue ?? 0)
          : fyRow.ts_net_revenue
        return {
          project_count: openCount,
          open_count: fyRow.open_count,
          closed_count: fyRow.closed_count,
          ts_net_revenue_total: nrForClient,
          iow_net_revenue_total: activeClient ? activeClient.iow_net_revenue : fyRow.iow_net_revenue,
          pct_consumo_globale: fyRow.iow_net_revenue
            ? Math.round(nrForClient / fyRow.iow_net_revenue * 1000) / 10 : null,
          residuo_eur_totale: fyRow.iow_net_revenue - nrForClient,
          residuo_ore_totale: null as number | null,
          ts_hours_total: activeClient
            ? (activeClient.by_fy.find((f) => f.fy === selectedFy)?.ts_hours ?? 0)
            : fyRow.ts_hours,
        }
      }
    }
    if (activeClient) {
      return {
        project_count: activeClient.project_count,
        open_count: activeClient.open_count,
        closed_count: activeClient.closed_count,
        ts_net_revenue_total: activeClient.ts_net_revenue,
        iow_net_revenue_total: activeClient.iow_net_revenue,
        pct_consumo_globale: activeClient.pct_consumo,
        residuo_eur_totale: activeClient.residuo_eur,
        residuo_ore_totale: null as number | null,
        ts_hours_total: activeClient.ts_hours,
      }
    }
    return data.totals
  }, [data, selectedFy, activeClient])

  const activeByFy = useMemo((): DashboardFyBreakdown[] => {
    if (!data) return []
    if (activeClient) {
      return activeClient.by_fy.map((f) => ({
        fy: f.fy,
        project_count: f.project_count,
        open_count: 0,
        closed_count: 0,
        iow_net_revenue: 0,
        ts_net_revenue: f.ts_net_revenue,
        ts_hours: f.ts_hours,
        by_bu: f.by_bu,
      }))
    }
    return data.by_fy
  }, [data, activeClient])

  const activeByBu = useMemo((): import('../api/client').DashboardBuBreakdown[] => {
    if (!data) return []
    if (activeClient && selectedFy) {
      return activeClient.by_fy.find((f) => f.fy === selectedFy)?.by_bu ?? activeClient.by_bu
    }
    if (activeClient) return activeClient.by_bu
    if (selectedFy) return data.by_fy.find((f) => f.fy === selectedFy)?.by_bu ?? data.by_bu
    return data.by_bu
  }, [data, activeClient, selectedFy])

  const activeAtRisk = useMemo(() => {
    if (!data) return []
    if (!activeClient) return data.at_risk_projects
    return data.at_risk_projects.filter((p) => p.client_name === activeClient.client_name)
  }, [data, activeClient])

  // Client cards: se FY selezionato, mostra solo clienti con attività in quel FY
  const displayClients = useMemo((): DashboardClient[] => {
    if (!data) return []
    if (!selectedFy) return data.clients
    return data.clients.filter((c) => c.by_fy.some((f) => f.fy === selectedFy))
  }, [data, selectedFy])

  if (isLoading) return <div className="p-8 text-slate-500">Caricamento...</div>
  if (error) return <div className="p-8 text-red-600">Errore: {(error as Error).message}</div>
  if (!data || !displayTotals) return null

  const residuoAccent = (displayTotals.residuo_eur_totale ?? 0) < 0 ? 'red' : 'green'
  const fyOptions = data.by_fy.filter((f) => f.fy > 0).map((f) => f.fy)

  return (
    <div className="p-6 space-y-5">

      {/* Header + tab bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-slate-800">Dashboard Portfolio</h1>
          <span className="text-slate-500 text-sm">FY{String(data.fy).slice(2)}</span>
          {selectedClient && (
            <>
              <span className="text-slate-300">›</span>
              <span className="text-blue-600 font-medium text-sm">{selectedClient}</span>
              <button onClick={() => setSelectedClient(null)} className="text-xs text-slate-400 hover:text-slate-600 underline">
                (tutti)
              </button>
            </>
          )}
        </div>
        <TabBar active={activeTab} onChange={(t) => setActiveTab(t)} />
      </div>

      {/* ════════════════════════ TAB OVERVIEW ════════════════════════ */}
      {activeTab === 'overview' && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiBox
              label="Codici"
              value={`${displayTotals.project_count} tot`}
              sub={`${displayTotals.open_count} aperti · ${displayTotals.closed_count} in chiusura`}
            />
            <KpiBox
              label="NR Actual"
              value={fmtEur(displayTotals.ts_net_revenue_total)}
              sub={`Budget: ${fmtEur(displayTotals.iow_net_revenue_total)}`}
            />
            <KpiBox
              label="% Consumo NR"
              value={displayTotals.pct_consumo_globale != null ? `${displayTotals.pct_consumo_globale}%` : '—'}
              accent={(displayTotals.pct_consumo_globale ?? 0) > 90 ? 'red' : (displayTotals.pct_consumo_globale ?? 0) > 70 ? 'amber' : 'default'}
              sub={displayTotals.ts_hours_total ? `${fmtN(displayTotals.ts_hours_total, 0)} ore lavorate` : undefined}
            />
            <KpiBox
              label="Residuo NR"
              value={fmtEur(displayTotals.residuo_eur_totale)}
              accent={residuoAccent}
              sub={displayTotals.residuo_ore_totale != null ? `${fmtN(displayTotals.residuo_ore_totale, 0)} ore residue` : undefined}
            />
          </div>

          {/* Filtro FY + selector clienti */}
          <section>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Filtra FY</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setSelectedFy(null)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                    !selectedFy ? 'bg-slate-700 text-white border-slate-700' : 'border-slate-300 text-slate-600 hover:border-slate-400'
                  }`}
                >
                  Tutti
                </button>
                {fyOptions.map((fy) => {
                  const fyRow = data.by_fy.find((f) => f.fy === fy)!
                  return (
                    <button
                      key={fy}
                      onClick={() => setSelectedFy(selectedFy === fy ? null : fy)}
                      className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                        selectedFy === fy
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-slate-300 text-slate-600 hover:border-blue-400'
                      }`}
                    >
                      FY{String(fy).slice(2)}
                      {fyRow.open_count > 0 && (
                        <span className="ml-1 text-green-300">·{fyRow.open_count}↑</span>
                      )}
                      {fyRow.closed_count > 0 && (
                        <span className="ml-0.5 text-slate-300">{fyRow.closed_count}↓</span>
                      )}
                    </button>
                  )
                })}
              </div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide ml-2">Clienti</span>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1">
              {/* Tutti */}
              <button
                onClick={() => setSelectedClient(null)}
                className={`flex-shrink-0 w-36 rounded-xl border-2 p-3 text-left transition-all shadow-sm hover:shadow-md ${
                  !selectedClient ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'
                }`}
              >
                <p className="text-sm font-semibold text-slate-800 mb-1">Tutti i clienti</p>
                <p className="text-base font-bold text-slate-700">
                  {fmtEur(
                    selectedFy
                      ? data.by_fy.find((f) => f.fy === selectedFy)?.ts_net_revenue
                      : data.totals.ts_net_revenue_total,
                    true
                  )}
                </p>
                <p className="text-xs text-slate-400">{displayClients.length} clienti</p>
                <p className="text-xs text-slate-400 mt-1">
                  {data.totals.open_count} ap. · {data.totals.closed_count} ch.
                </p>
              </button>

              {displayClients.map((c) => (
                <ClientCard
                  key={c.client_name}
                  client={c}
                  selected={selectedClient === c.client_name}
                  fyData={selectedFy ? (c.by_fy.find((f) => f.fy === selectedFy) ?? null) : null}
                  onSelect={() => setSelectedClient(c.client_name === selectedClient ? null : c.client_name)}
                />
              ))}
            </div>
          </section>

          {/* Pannelli principali */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_300px] gap-4">

            {/* FY Chart */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">
                Produzione NR per FY
                {selectedClient && <span className="text-blue-500 ml-1">· {selectedClient}</span>}
              </h2>
              <FyChart data={activeByFy} selectedFy={selectedFy} />
              {activeByFy.filter((d) => d.fy > 0).length > 0 && (
                <table className="w-full text-xs mt-3 border-t border-slate-100">
                  <thead>
                    <tr className="text-slate-400 text-left">
                      <th className="py-1.5 font-medium">FY</th>
                      {!selectedClient && <th className="py-1.5 font-medium text-right">Codici</th>}
                      {!selectedClient && <th className="py-1.5 font-medium text-right">Budget IOW</th>}
                      <th className="py-1.5 font-medium text-right">NR Actual</th>
                      <th className="py-1.5 font-medium text-right">Ore</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {activeByFy.filter((d) => d.fy > 0).map((d) => (
                      <tr
                        key={d.fy}
                        className={selectedFy === d.fy ? 'bg-blue-50' : ''}
                        onClick={() => setSelectedFy(selectedFy === d.fy ? null : d.fy)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="py-1.5 font-semibold text-slate-700">FY{String(d.fy).slice(2)}</td>
                        {!selectedClient && (
                          <td className="py-1.5 text-right text-slate-500">
                            {d.project_count > 0
                              ? <span>{d.project_count} <span className="text-green-600">({d.open_count}↑{d.closed_count}↓)</span></span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                        )}
                        {!selectedClient && (
                          <td className="py-1.5 text-right text-slate-500">
                            {d.iow_net_revenue > 0 ? fmtEur(d.iow_net_revenue, true) : <span className="text-slate-300">—</span>}
                          </td>
                        )}
                        <td className="py-1.5 text-right font-medium text-slate-700">{fmtEur(d.ts_net_revenue, true)}</td>
                        <td className="py-1.5 text-right text-slate-400">{fmtN(d.ts_hours, 0)}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* BU Breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">
                Breakdown per BU
                {selectedFy && <span className="text-blue-500 ml-1">· FY{String(selectedFy).slice(2)}</span>}
                {selectedClient && <span className="text-blue-500 ml-1">· {selectedClient}</span>}
              </h2>
              <BuBreakdown data={activeByBu} />
              {activeByBu.length > 0 && (
                <table className="w-full text-xs mt-4 border-t border-slate-100">
                  <thead>
                    <tr className="text-slate-400 text-left">
                      <th className="py-1 font-medium">BU</th>
                      <th className="py-1 font-medium text-right">NR</th>
                      <th className="py-1 font-medium text-right">Ore</th>
                      <th className="py-1 font-medium text-right">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {activeByBu.map((bu) => (
                      <tr key={bu.bu}>
                        <td className="py-1 font-medium text-slate-700 truncate max-w-[120px]">{bu.bu}</td>
                        <td className="py-1 text-right text-slate-700">{fmtEur(bu.ts_net_revenue, true)}</td>
                        <td className="py-1 text-right text-slate-400">{fmtN(bu.ts_hours, 0)}h</td>
                        <td className="py-1 text-right text-slate-500">{bu.pct_of_total.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* At-risk + riepilogo cliente */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                A rischio ({activeAtRisk.length})
              </h2>
              {activeAtRisk.length === 0 ? (
                <p className="text-slate-400 text-sm">Nessun codice a rischio esaurimento ≤ 30gg.</p>
              ) : (
                <div className="space-y-2">
                  {activeAtRisk.map((p) => (
                    <Link
                      key={p.project_id}
                      to={`/projects/${encodeURIComponent(p.project_id)}`}
                      className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{p.project_id}</p>
                        {!selectedClient && <p className="text-xs text-slate-400 truncate">{p.client_name}</p>}
                        <p className="text-xs text-slate-400 truncate">{p.project_title}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className={`text-sm font-bold ${(p.giorni_residui ?? 999) <= 30 ? 'text-red-600' : 'text-amber-600'}`}>
                          {p.giorni_residui != null ? `${p.giorni_residui}gg` : '—'}
                        </p>
                        <p className="text-xs text-slate-400">{p.data_esaurimento ?? '—'}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Riepilogo cliente selezionato */}
              {selectedClient && activeClient && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Riepilogo cliente</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Residuo NR</span>
                      <span className={`font-semibold ${activeClient.residuo_eur < 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {fmtEur(activeClient.residuo_eur)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Ore lavorate</span>
                      <span className="text-slate-700">{fmtN(activeClient.ts_hours, 0)} h</span>
                    </div>
                    {activeClient.client_group && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Gruppo</span>
                        <span className="text-slate-700">{activeClient.client_group}</span>
                      </div>
                    )}
                    <div className="mt-2"><MiniBar pct={activeClient.pct_consumo} /></div>
                  </div>
                  <Link
                    to={`/projects?client=${encodeURIComponent(selectedClient)}`}
                    className="mt-3 flex items-center justify-center text-xs text-blue-600 hover:underline font-medium"
                  >
                    Vai ai progetti →
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Caricamenti ultima settimana */}
          <LastWeekWidget />
        </>
      )}

      {/* ════════════════════════ TAB PREVISIONING ════════════════════════ */}
      {activeTab === 'previsioning' && <PrevisioningTab />}

      {/* ════════════════════════ TAB RISORSE ════════════════════════ */}
      {activeTab === 'risorse' && <ResourceFteTab />}
    </div>
  )
}
