import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import { api, BuBreakdown, WeeklyLoad } from '../api/client'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtEur(n: number | null | undefined, dec = 0) {
  if (n == null) return '—'
  return new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: dec,
  }).format(n)
}

function fmtN(n: number | null | undefined, dec = 1) {
  if (n == null) return '—'
  return n.toLocaleString('it-IT', { maximumFractionDigits: dec })
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })
}

function fmtWeekLabel(weekEnd: string | null, weekId: string) {
  const ref = weekEnd ?? weekId
  return new Date(ref).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null
  const colors: Record<string, string> = {
    'In Chiusura': 'bg-slate-100 text-slate-500',
    'Aperto': 'bg-green-100 text-green-700',
    'Active': 'bg-green-100 text-green-700',
    'On Hold': 'bg-amber-100 text-amber-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? 'bg-blue-100 text-blue-700'}`}>
      {status}
    </span>
  )
}

function ProgressBar({ pct, color = 'blue' }: { pct: number | null; color?: string }) {
  if (pct == null) return <span className="text-slate-400 text-xs">—</span>
  const capped = Math.min(Math.max(pct, 0), 100)
  const bg = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : color === 'slate' ? 'bg-slate-400' : 'bg-blue-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${bg} rounded-full transition-all`} style={{ width: `${capped}%` }} />
      </div>
      <span className="text-xs font-semibold w-12 text-right">{pct.toFixed(1)}%</span>
    </div>
  )
}

function KpiCard({
  label, value, sub, accent, small,
}: {
  label: string
  value: string | null
  sub?: string
  accent?: 'red' | 'green' | 'blue'
  small?: boolean
}) {
  const valColor = accent === 'red' ? 'text-red-600' : accent === 'green' ? 'text-green-700' : 'text-slate-800'
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">{label}</p>
      <p className={`${small ? 'text-xl' : 'text-2xl'} font-bold ${valColor} mt-1 truncate`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── BU/CC Breakdown ────────────────────────────────────────────────────────────

function BuBreakdownSection({ byBu, totalNr }: { byBu: BuBreakdown[]; totalNr: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(byBu.map(b => b.bu)))

  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
        Breakdown BU / Centro di Costo
      </h2>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Intestazione */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide font-medium">
          <span>Struttura</span>
          <span className="text-right">Ore</span>
          <span className="text-right">NR caricato</span>
          <span className="text-right">% sul tot.</span>
          <span className="text-right">€/ora (blended)</span>
        </div>

        {byBu.map((bu, i) => {
          const open = expanded.has(bu.bu)
          const buPct = totalNr > 0 ? (bu.net_revenue / totalNr * 100) : 0
          return (
            <div key={bu.bu} className={i > 0 ? 'border-t border-slate-200' : ''}>
              {/* Riga BU */}
              <button
                onClick={() => setExpanded(prev => {
                  const s = new Set(prev)
                  open ? s.delete(bu.bu) : s.add(bu.bu)
                  return s
                })}
                className="w-full grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-xs">{open ? '▾' : '▸'}</span>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{bu.bu}</p>
                    <div className="mt-1 w-32">
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(buPct, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
                <span className="text-right text-sm font-medium text-slate-700 self-center">{fmtN(bu.hours)} h</span>
                <span className="text-right text-sm font-semibold text-slate-800 self-center">{fmtEur(bu.net_revenue)}</span>
                <span className="text-right text-sm text-slate-600 self-center">{bu.pct_nr?.toFixed(1)}%</span>
                <span className="text-right text-sm text-slate-500 self-center">{bu.blended_rate != null ? `€${fmtN(bu.blended_rate, 2)}/h` : '—'}</span>
              </button>

              {/* Righe CC (espandibili) */}
              {open && bu.cost_centers.map(cc => (
                <div
                  key={cc.cc_code}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2.5 bg-slate-50/50 border-t border-slate-100"
                >
                  <div className="pl-6">
                    <p className="text-sm text-slate-700">{cc.cc_name}</p>
                    <p className="text-xs text-slate-400">{cc.cc_code}{cc.ou ? ` · ${cc.ou}` : ''}</p>
                  </div>
                  <span className="text-right text-sm text-slate-600">{fmtN(cc.hours)} h</span>
                  <span className="text-right text-sm font-medium text-slate-700">{fmtEur(cc.net_revenue)}</span>
                  <span className="text-right text-sm text-slate-500">{cc.pct_nr?.toFixed(1)}%</span>
                  <span className="text-right text-sm text-slate-400">{cc.blended_rate != null ? `€${fmtN(cc.blended_rate, 2)}/h` : '—'}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Weekly Chart ───────────────────────────────────────────────────────────────

function WeeklyChart({ weekly }: { weekly: WeeklyLoad[] }) {
  const chrono = [...weekly].reverse()
  const data = chrono.map(w => ({
    label: fmtWeekLabel(w.week_end, w.week_id),
    net_revenue: w.net_revenue,
    has_activity: w.has_activity,
  }))

  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
        Trend NR settimanale
      </h2>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis
              tickFormatter={v => `€${(v / 1000).toFixed(0)}K`}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              width={52}
            />
            <Tooltip
              formatter={(v: number) => [fmtEur(v), 'NR']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Bar dataKey="net_revenue" radius={[3, 3, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.has_activity ? '#3b82f6' : '#e2e8f0'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

// ── Forecast Card ──────────────────────────────────────────────────────────────

function ForecastCard({ forecast }: { forecast: ReturnType<typeof Object.assign> }) {
  const isLastWeekLow =
    forecast.last_week_nr != null &&
    forecast.avg_4w_nr != null &&
    forecast.avg_4w_nr > 0 &&
    forecast.last_week_nr / forecast.avg_4w_nr < 0.3

  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
        Previsione saturazione
      </h2>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        {/* Residuo */}
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-500">Residuo NR da produrre</span>
          <span className="text-2xl font-bold text-slate-800">{fmtEur(forecast.residuo_eur)}</span>
        </div>

        <div className="border-t border-slate-100" />

        {/* Ultima settimana attiva */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Ultima settimana attiva
            </span>
            <span className="text-xs text-slate-400">
              al {fmtDate(forecast.last_week_end ?? forecast.last_week_id)}
            </span>
            {isLastWeekLow && (
              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                attenzione: settimana leggera
              </span>
            )}
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">{fmtN(forecast.last_week_hours)} h · {fmtEur(forecast.last_week_nr)} NR</span>
            {forecast.saturation_date_lw ? (
              <div className="text-right">
                <span className={`font-semibold ${isLastWeekLow ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                  {fmtDate(forecast.saturation_date_lw)}
                </span>
                <span className="text-slate-400 text-xs ml-2">({fmtN(forecast.weeks_to_saturation_lw, 0)} sett.)</span>
              </div>
            ) : <span className="text-slate-400 text-xs">n/d</span>}
          </div>
        </div>

        {/* Media 4 settimane */}
        <div className={`rounded-lg p-3 ${isLastWeekLow ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold uppercase tracking-wide ${isLastWeekLow ? 'text-blue-700' : 'text-slate-600'}`}>
              Media ultime 4 sett. attive
            </span>
            {isLastWeekLow && (
              <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded font-medium">
                stima principale
              </span>
            )}
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-slate-600">{fmtN(forecast.avg_4w_hours, 1)} h/sett · {fmtEur(forecast.avg_4w_nr)} NR/sett</span>
            {forecast.saturation_date_4w ? (
              <div className="text-right">
                <span className="text-lg font-bold text-slate-800">{fmtDate(forecast.saturation_date_4w)}</span>
                <p className="text-xs text-slate-400">{fmtN(forecast.weeks_to_saturation_4w, 1)} settimane</p>
              </div>
            ) : <span className="text-slate-400 text-xs">n/d</span>}
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Stima lineare: residuo NR ÷ run rate settimanale. Non include lump sum o variazioni contrattuali future.
        </p>
      </div>
    </section>
  )
}

// ── Weekly Table ───────────────────────────────────────────────────────────────

function WeeklyTable({ weekly }: { weekly: WeeklyLoad[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
        Tutti i caricamenti settimanali
      </h2>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3">Settimana (al)</th>
              <th className="text-right px-4 py-3">Ore</th>
              <th className="text-right px-4 py-3">Lordo</th>
              <th className="text-right px-4 py-3">Sconto</th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700">Netto</th>
              <th className="text-right px-4 py-3">Risorse</th>
              <th className="text-right px-4 py-3">CC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {weekly.map(w => (
              <tr
                key={w.week_id}
                className={`transition-colors ${w.has_activity ? 'hover:bg-slate-50' : 'opacity-40'}`}
              >
                <td className="px-4 py-3">
                  <span className="font-medium text-slate-700">
                    {fmtDate(w.week_end ?? w.week_id)}
                  </span>
                  <span className="text-xs text-slate-400 ml-2">{w.week_id}</span>
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{w.has_activity ? `${fmtN(w.hours)} h` : '—'}</td>
                <td className="px-4 py-3 text-right text-slate-500">{w.has_activity ? fmtEur(w.gross_revenue) : '—'}</td>
                <td className="px-4 py-3 text-right text-slate-400 text-xs">
                  {w.has_activity && w.discount !== 0 ? fmtEur(w.discount) : '—'}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">
                  {w.has_activity ? fmtEur(w.net_revenue) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-slate-500">{w.has_activity ? w.resources_active : '—'}</td>
                <td className="px-4 py-3 text-right text-slate-500">{w.has_activity ? w.cc_count : '—'}</td>
              </tr>
            ))}
          </tbody>
          {/* Riga totali */}
          <tfoot>
            <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-sm">
              <td className="px-4 py-3 text-slate-600">Totale</td>
              <td className="px-4 py-3 text-right text-slate-700">
                {fmtN(weekly.reduce((s, w) => s + w.hours, 0))} h
              </td>
              <td className="px-4 py-3 text-right text-slate-600">
                {fmtEur(weekly.reduce((s, w) => s + w.gross_revenue, 0))}
              </td>
              <td className="px-4 py-3 text-right text-slate-500 text-xs">
                {fmtEur(weekly.reduce((s, w) => s + w.discount, 0))}
              </td>
              <td className="px-4 py-3 text-right text-slate-800">
                {fmtEur(weekly.reduce((s, w) => s + w.net_revenue, 0))}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading, error } = useQuery({
    queryKey: ['project-detail', id],
    queryFn: () => api.projectDetail(id!),
  })

  if (isLoading) return <div className="p-8 text-slate-500">Caricamento...</div>
  if (error) return <div className="p-8 text-red-600">Errore: {(error as Error).message}</div>
  if (!data) return null

  const d = data
  const lumpSumSpese = (d.iow_contract_value != null && d.iow_net_revenue != null)
    ? d.iow_contract_value - d.iow_net_revenue
    : null

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header ─────────────────────────────────────────────────────────────── */}
      <div>
        <Link to="/projects" className="text-xs text-blue-600 hover:underline">← Tutti i progetti</Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-800">{d.project_id}</h1>
              <StatusBadge status={d.project_status} />
              {d.fy_closing && (
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                  FY{String(d.fy_closing).slice(2)}
                </span>
              )}
              {d.product_code && (
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                  {d.product_code}
                </span>
              )}
            </div>
            {d.project_title && (
              <p className="text-slate-500 text-sm mt-1">{d.project_title}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-slate-500">
          {d.client_name && <span><span className="text-slate-400">Cliente:</span> <span className="font-medium text-slate-700">{d.client_name}</span>{d.client_group && d.client_group !== d.client_name ? ` (${d.client_group})` : ''}</span>}
          {d.engagement_manager && <span><span className="text-slate-400">Manager:</span> <span className="font-medium text-slate-700">{d.engagement_manager}</span></span>}
          {d.engagement_partner && <span><span className="text-slate-400">Partner:</span> <span className="text-slate-700">{d.engagement_partner}</span></span>}
          {d.legal_entity && <span className="text-slate-400">{d.legal_entity}</span>}
        </div>
      </div>

      {/* KPI cards ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Valore contratto"
          value={fmtEur(d.iow_contract_value)}
          sub={lumpSumSpese != null ? `Lumpsum+spese: ${fmtEur(lumpSumSpese)}` : undefined}
        />
        <KpiCard
          label="NR da produrre"
          value={fmtEur(d.iow_net_revenue)}
          sub={d.iow_hours_total != null ? `${fmtN(d.iow_hours_total)} ore budget` : undefined}
          accent="blue"
        />
        <KpiCard
          label="NR caricato"
          value={fmtEur(d.ts_net_revenue_total)}
          sub={`${fmtN(d.ts_hours_total)} ore · lordo ${fmtEur(d.ts_gross_revenue_total)}`}
        />
        <KpiCard
          label="Residuo NR"
          value={fmtEur(d.residuo_eur)}
          sub={d.residuo_ore != null ? `${fmtN(d.residuo_ore)} ore residue` : undefined}
          accent={(d.residuo_eur ?? 0) < 0 ? 'red' : 'green'}
        />
      </div>

      {/* Progress bars ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 space-y-3">
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">% NR consumato</span>
            <span className="text-xs text-slate-400">
              {fmtEur(d.ts_net_revenue_total)} / {fmtEur(d.iow_net_revenue)}
            </span>
          </div>
          <ProgressBar pct={d.pct_consumo_nr} />
        </div>
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">% Ore consumate</span>
            <span className="text-xs text-slate-400">
              {fmtN(d.ts_hours_total)} h / {fmtN(d.iow_hours_total)} h budget
            </span>
          </div>
          <ProgressBar pct={d.pct_consumo_ore} color="slate" />
        </div>
      </div>

      {/* Forecast + Chart ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ForecastCard forecast={d.forecast} />
        <WeeklyChart weekly={d.weekly} />
      </div>

      {/* BU / CC breakdown ───────────────────────────────────────────────────── */}
      <BuBreakdownSection byBu={d.by_bu} totalNr={d.ts_net_revenue_total} />

      {/* Caricamenti settimanali ─────────────────────────────────────────────── */}
      <WeeklyTable weekly={d.weekly} />

    </div>
  )
}
