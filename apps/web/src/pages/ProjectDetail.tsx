import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import { api, BuBreakdown, DetailEntry, WeeklyForecast } from '../api/client'

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
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: '2-digit',
  })
}

function fmtDateShort(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short',
  })
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })
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
        <div className={`h-full ${bg} rounded-full`} style={{ width: `${capped}%` }} />
      </div>
      <span className="text-xs font-semibold w-12 text-right">{pct.toFixed(1)}%</span>
    </div>
  )
}

// ── Forecast Card ──────────────────────────────────────────────────────────────

function ForecastCard({ forecast }: { forecast: WeeklyForecast }) {
  const isLastWeekLow =
    forecast.last_week_nr != null && forecast.avg_4w_nr != null &&
    forecast.avg_4w_nr > 0 && forecast.last_week_nr / forecast.avg_4w_nr < 0.3

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Previsione saturazione</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-slate-500">Residuo NR da produrre</span>
        <span className="text-2xl font-bold text-slate-800">{fmtEur(forecast.residuo_eur)}</span>
      </div>
      <div className="border-t border-slate-100" />

      {/* Ultima settimana attiva */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Ultima sett. attiva (al {fmtDate(forecast.last_week_end ?? forecast.last_week_id)})
          </span>
          {isLastWeekLow && (
            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
              ⚠ sett. leggera
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
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-xs font-semibold uppercase tracking-wide ${isLastWeekLow ? 'text-blue-700' : 'text-slate-600'}`}>
            Media ultime 4 sett. attive
          </span>
          {isLastWeekLow && (
            <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded font-medium">stima principale</span>
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
        Stima lineare basata su timesheet importati. Non include lump sum o variazioni future.
      </p>
    </div>
  )
}

// ── BU/CC Breakdown ────────────────────────────────────────────────────────────

type ActiveFilter = { type: 'bu' | 'cc'; value: string } | null

function BuBreakdownSection({
  byBu, tsNrTotal, activeFilter, onFilterChange,
}: {
  byBu: BuBreakdown[]
  tsNrTotal: number
  activeFilter: ActiveFilter
  onFilterChange: (f: ActiveFilter) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(byBu.map(b => b.bu)))

  function toggleFilter(type: 'bu' | 'cc', value: string) {
    if (activeFilter?.type === type && activeFilter.value === value) {
      onFilterChange(null)
    } else {
      onFilterChange({ type, value })
    }
  }

  const isActive = (type: 'bu' | 'cc', value: string) =>
    activeFilter?.type === type && activeFilter.value === value

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          Breakdown BU / Centro di Costo
        </h2>
        {activeFilter && (
          <span className="text-xs text-slate-500">
            clic sulla riga selezionata per deselezionare
          </span>
        )}
        <p className="text-xs text-slate-400">
          (su {fmtEur(tsNrTotal)} TS importati)
        </p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide font-medium">
          <span>Struttura</span>
          <span className="text-right">Ore</span>
          <span className="text-right">NR (TS)</span>
          <span className="text-right">%</span>
          <span className="text-right">€/ora</span>
        </div>

        {byBu.map((bu, i) => {
          const open = expanded.has(bu.bu)
          const buActive = isActive('bu', bu.bu)
          return (
            <div key={bu.bu} className={i > 0 ? 'border-t border-slate-200' : ''}>
              {/* Riga BU — cliccabile */}
              <div className="flex">
                <button
                  onClick={() => setExpanded(prev => {
                    const s = new Set(prev); open ? s.delete(bu.bu) : s.add(bu.bu); return s
                  })}
                  className="w-7 flex items-center justify-center text-slate-400 hover:text-slate-600 shrink-0"
                >
                  {open ? '▾' : '▸'}
                </button>
                <button
                  onClick={() => toggleFilter('bu', bu.bu)}
                  className={`flex-1 grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 pr-4 py-3 text-left transition-colors ${
                    buActive ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold text-sm ${buActive ? 'text-blue-700' : 'text-slate-800'}`}>
                      {bu.bu}
                    </span>
                    {buActive && <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded">filtro attivo</span>}
                  </div>
                  <span className="text-right text-sm font-medium text-slate-700 self-center">{fmtN(bu.hours)} h</span>
                  <span className="text-right text-sm font-semibold text-slate-800 self-center">{fmtEur(bu.net_revenue)}</span>
                  <span className="text-right text-sm text-slate-600 self-center">{bu.pct_nr?.toFixed(1)}%</span>
                  <span className="text-right text-sm text-slate-500 self-center">{bu.blended_rate != null ? `€${fmtN(bu.blended_rate, 2)}/h` : '—'}</span>
                </button>
              </div>

              {/* Righe CC */}
              {open && bu.cost_centers.map(cc => {
                const ccActive = isActive('cc', cc.cc_code)
                return (
                  <button
                    key={cc.cc_code}
                    onClick={() => toggleFilter('cc', cc.cc_code)}
                    className={`w-full grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2.5 border-t border-slate-100 text-left transition-colors ${
                      ccActive ? 'bg-blue-50' : 'hover:bg-slate-50 bg-slate-50/40'
                    }`}
                  >
                    <div className="pl-5">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm ${ccActive ? 'text-blue-700 font-semibold' : 'text-slate-700'}`}>
                          {cc.cc_name}
                        </p>
                        {ccActive && <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded">filtro attivo</span>}
                      </div>
                      <p className="text-xs text-slate-400">{cc.cc_code}{cc.ou ? ` · ${cc.ou}` : ''}</p>
                    </div>
                    <span className="text-right text-sm text-slate-600 self-center">{fmtN(cc.hours)} h</span>
                    <span className="text-right text-sm font-medium text-slate-700 self-center">{fmtEur(cc.net_revenue)}</span>
                    <span className="text-right text-sm text-slate-500 self-center">{cc.pct_nr?.toFixed(1)}%</span>
                    <span className="text-right text-sm text-slate-400 self-center">{cc.blended_rate != null ? `€${fmtN(cc.blended_rate, 2)}/h` : '—'}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Filtered Weekly Table ──────────────────────────────────────────────────────

type DateFilterMode = 'all' | 'week' | 'month' | 'custom'
interface DateFilter { mode: DateFilterMode; weekId?: string; month?: string; from?: string; to?: string }

function WeeklySection({
  entries, weekly, activeFilter,
}: {
  entries: DetailEntry[]
  weekly: ReturnType<typeof Object.assign>[]
  activeFilter: ActiveFilter
}) {
  const [dateFilter, setDateFilter] = useState<DateFilter>({ mode: 'all' })

  // Settimane e mesi disponibili
  const availableWeeks = useMemo(() => {
    const wids = [...new Set(entries.map(e => e.week_id))].sort().reverse()
    return wids.map(wid => {
      const e = entries.find(x => x.week_id === wid)
      return { week_id: wid, week_end: e?.week_end ?? null }
    })
  }, [entries])

  const availableMonths = useMemo(() => {
    const months = [...new Set(entries.map(e => e.week_id.slice(0, 7)))].sort().reverse()
    return months
  }, [entries])

  // Entries filtrate per CC/BU
  const ccFiltered = useMemo(() => {
    if (!activeFilter) return entries
    if (activeFilter.type === 'bu') return entries.filter(e => e.bu === activeFilter.value)
    return entries.filter(e => e.cc_code === activeFilter.value)
  }, [entries, activeFilter])

  // Entries filtrate per data
  const filtered = useMemo(() => {
    let res = ccFiltered.filter(e => e.hours > 0 || Math.abs(e.net_revenue) > 0.01)
    if (dateFilter.mode === 'week' && dateFilter.weekId) {
      res = res.filter(e => e.week_id === dateFilter.weekId)
    } else if (dateFilter.mode === 'month' && dateFilter.month) {
      res = res.filter(e => e.week_id.startsWith(dateFilter.month!))
    } else if (dateFilter.mode === 'custom' && dateFilter.from && dateFilter.to) {
      res = res.filter(e => e.week_id >= dateFilter.from! && e.week_id <= dateFilter.to!)
    }
    return res
  }, [ccFiltered, dateFilter])

  // Aggregazione per settimana delle entries filtrate
  const filteredWeekly = useMemo(() => {
    const byWeek: Record<string, { week_id: string; week_end: string | null; fy: number; hours: number; net_revenue: number; gross_revenue: number; discount: number }> = {}
    for (const e of filtered) {
      if (!byWeek[e.week_id]) {
        byWeek[e.week_id] = { week_id: e.week_id, week_end: e.week_end, fy: e.fy, hours: 0, net_revenue: 0, gross_revenue: 0, discount: 0 }
      }
      byWeek[e.week_id].hours += e.hours
      byWeek[e.week_id].net_revenue += e.net_revenue
      byWeek[e.week_id].gross_revenue += e.gross_revenue
      byWeek[e.week_id].discount += e.discount
    }
    return Object.values(byWeek).sort((a, b) => b.week_id.localeCompare(a.week_id))
  }, [filtered])

  // Usa weekly originale (con resource_count) quando nessun filtro è attivo
  const useOriginalWeekly = !activeFilter && dateFilter.mode === 'all'
  const rows = useOriginalWeekly ? weekly : filteredWeekly

  const totH = rows.reduce((s, r) => s + r.hours, 0)
  const totNR = rows.reduce((s, r) => s + r.net_revenue, 0)
  const totGross = rows.reduce((s, r) => s + r.gross_revenue, 0)
  const totDisc = rows.reduce((s, r) => s + r.discount, 0)

  const isFiltered = !!(activeFilter || dateFilter.mode !== 'all')

  return (
    <section>
      {/* Barra filtri */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mr-2">
          Caricamenti settimanali
        </h2>

        {/* Filtro CC/BU attivo */}
        {activeFilter && (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium flex items-center gap-1">
            {activeFilter.type === 'bu' ? 'BU' : 'CC'}: {activeFilter.value}
          </span>
        )}

        {/* Separatore */}
        <div className="flex-1" />

        {/* Filtri data */}
        <div className="flex items-center gap-1 text-xs">
          {(['all', 'week', 'month', 'custom'] as DateFilterMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setDateFilter({ mode })}
              className={`px-2.5 py-1 rounded-md border transition-colors ${
                dateFilter.mode === mode
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {mode === 'all' ? 'Tutto' : mode === 'week' ? 'Settimana' : mode === 'month' ? 'Mese' : 'Range'}
            </button>
          ))}
        </div>

        {/* Selezione settimana */}
        {dateFilter.mode === 'week' && (
          <select
            value={dateFilter.weekId ?? ''}
            onChange={e => setDateFilter(prev => ({ ...prev, weekId: e.target.value }))}
            className="text-xs border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Seleziona settimana...</option>
            {availableWeeks.map(w => (
              <option key={w.week_id} value={w.week_id}>
                al {fmtDate(w.week_end ?? w.week_id)} ({w.week_id})
              </option>
            ))}
          </select>
        )}

        {/* Selezione mese */}
        {dateFilter.mode === 'month' && (
          <select
            value={dateFilter.month ?? ''}
            onChange={e => setDateFilter(prev => ({ ...prev, month: e.target.value }))}
            className="text-xs border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Seleziona mese...</option>
            {availableMonths.map(m => (
              <option key={m} value={m}>{monthLabel(m)} ({m})</option>
            ))}
          </select>
        )}

        {/* Range personalizzato */}
        {dateFilter.mode === 'custom' && (
          <div className="flex items-center gap-1 text-xs">
            <input
              type="date"
              value={dateFilter.from ?? ''}
              onChange={e => setDateFilter(prev => ({ ...prev, from: e.target.value }))}
              className="border border-slate-300 rounded px-2 py-1 focus:outline-none"
            />
            <span className="text-slate-400">→</span>
            <input
              type="date"
              value={dateFilter.to ?? ''}
              onChange={e => setDateFilter(prev => ({ ...prev, to: e.target.value }))}
              className="border border-slate-300 rounded px-2 py-1 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Tabella */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isFiltered && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 text-xs text-blue-700 flex items-center gap-2">
            <span className="font-medium">Filtro attivo</span>
            {activeFilter && <span>— {activeFilter.type === 'bu' ? 'BU' : 'CC'}: <b>{activeFilter.value}</b></span>}
            {dateFilter.mode === 'week' && dateFilter.weekId && <span>— Settimana: <b>al {fmtDate(availableWeeks.find(w => w.week_id === dateFilter.weekId)?.week_end ?? dateFilter.weekId)}</b></span>}
            {dateFilter.mode === 'month' && dateFilter.month && <span>— Mese: <b>{monthLabel(dateFilter.month)}</b></span>}
            {dateFilter.mode === 'custom' && dateFilter.from && <span>— Range: <b>{fmtDate(dateFilter.from)} → {fmtDate(dateFilter.to ?? dateFilter.from)}</b></span>}
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3">Sett. (al)</th>
              <th className="text-left px-4 py-3">FY</th>
              <th className="text-right px-4 py-3">Ore</th>
              <th className="text-right px-4 py-3">Lordo</th>
              <th className="text-right px-4 py-3">Sconto</th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700">Netto</th>
              {useOriginalWeekly && <th className="text-right px-4 py-3">Risorse</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nessun dato per il filtro selezionato.</td></tr>
            )}
            {rows.map((w) => {
              const hasAct = useOriginalWeekly ? (w as { has_activity?: boolean }).has_activity : w.hours > 0 || Math.abs(w.net_revenue) > 0.01
              return (
                <tr key={w.week_id} className={`transition-colors ${hasAct ? 'hover:bg-slate-50' : 'opacity-35'}`}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-700">{fmtDate(w.week_end ?? w.week_id)}</span>
                    <span className="text-xs text-slate-400 ml-2">{w.week_id}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">FY{String(w.fy).slice(2)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{hasAct ? `${fmtN(w.hours)} h` : '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{hasAct ? fmtEur(w.gross_revenue) : '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-400 text-xs">{hasAct && w.discount !== 0 ? fmtEur(w.discount) : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{hasAct ? fmtEur(w.net_revenue) : '—'}</td>
                  {useOriginalWeekly && (
                    <td className="px-4 py-3 text-right text-slate-500">
                      {hasAct ? (w as { resources_active?: number }).resources_active : '—'}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-sm">
              <td className="px-4 py-3 text-slate-600">Totale {isFiltered ? '(filtrato)' : ''}</td>
              <td />
              <td className="px-4 py-3 text-right text-slate-700">{fmtN(totH)} h</td>
              <td className="px-4 py-3 text-right text-slate-600">{fmtEur(totGross)}</td>
              <td className="px-4 py-3 text-right text-slate-500 text-xs">{fmtEur(totDisc)}</td>
              <td className="px-4 py-3 text-right text-slate-800">{fmtEur(totNR)}</td>
              {useOriginalWeekly && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

// ── Weekly Chart ───────────────────────────────────────────────────────────────

function WeeklyChart({ weekly }: { weekly: { week_id: string; week_end: string | null; net_revenue: number; has_activity: boolean }[] }) {
  const chrono = [...weekly].reverse()
  const data = chrono.map(w => ({
    label: fmtDateShort(w.week_end ?? w.week_id),
    net_revenue: w.net_revenue,
    has_activity: w.has_activity,
  }))
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Trend NR settimanale</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <YAxis tickFormatter={v => `€${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10, fill: '#94a3b8' }} width={48} />
          <Tooltip formatter={(v: number) => [fmtEur(v), 'NR']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
          <Bar dataKey="net_revenue" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.has_activity ? '#3b82f6' : '#e2e8f0'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['project-detail', id],
    queryFn: () => api.projectDetail(id!),
  })

  if (isLoading) return <div className="p-8 text-slate-500">Caricamento...</div>
  if (error) return <div className="p-8 text-red-600">Errore: {(error as Error).message}</div>
  if (!data) return null

  const d = data
  const lumpSumSpese = (d.iow_contract_value != null && d.iow_net_revenue != null)
    ? d.iow_contract_value - d.iow_net_revenue : null

  // Percentuale dei TS importati sul totale effettivo
  const tsCoverage = (d.project_nr_actual && d.project_nr_actual > 0)
    ? (d.ts_nr_total / d.project_nr_actual * 100) : null

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div>
        <Link to="/projects" className="text-xs text-blue-600 hover:underline">← Tutti i progetti</Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-800">{d.project_id}</h1>
              <StatusBadge status={d.project_status} />
              {d.fy_closing && (
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">FY{String(d.fy_closing).slice(2)}</span>
              )}
              {d.product_code && (
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{d.product_code}</span>
              )}
            </div>
            {d.project_title && <p className="text-slate-500 text-sm mt-1">{d.project_title}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-slate-500">
          {d.client_name && (
            <span>
              <span className="text-slate-400">Cliente:</span>{' '}
              <span className="font-medium text-slate-700">{d.client_name}</span>
              {d.client_group && d.client_group !== d.client_name ? ` (${d.client_group})` : ''}
            </span>
          )}
          {d.engagement_manager && (
            <span><span className="text-slate-400">Manager:</span> <span className="font-medium text-slate-700">{d.engagement_manager}</span></span>
          )}
          {d.engagement_partner && (
            <span><span className="text-slate-400">Partner:</span> <span className="text-slate-700">{d.engagement_partner}</span></span>
          )}
          {d.legal_entity && <span className="text-slate-400 text-xs">{d.legal_entity}</span>}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Valore contratto</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{fmtEur(d.iow_contract_value)}</p>
          {lumpSumSpese != null && <p className="text-xs text-slate-400 mt-0.5">Lumpsum+spese: {fmtEur(lumpSumSpese)}</p>}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">NR da produrre</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{fmtEur(d.iow_net_revenue)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{fmtN(d.iow_hours_total)} ore budget</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">NR effettivo</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{fmtEur(d.project_nr_actual)}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {fmtN(d.project_hours_actual)} ore · TS importati: {fmtEur(d.ts_nr_total)}
            {tsCoverage != null ? ` (${tsCoverage.toFixed(0)}%)` : ''}
          </p>
        </div>
        <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4`}>
          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Residuo NR</p>
          <p className={`text-2xl font-bold mt-1 ${(d.residuo_eur ?? 0) < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {fmtEur(d.residuo_eur)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{fmtN(d.residuo_ore)} ore residue</p>
        </div>
      </div>

      {/* Progress bars + FY breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 space-y-3">
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">% NR consumato</span>
            <span className="text-xs text-slate-400">{fmtEur(d.project_nr_actual)} / {fmtEur(d.iow_net_revenue)}</span>
          </div>
          <ProgressBar pct={d.pct_consumo_nr} />
        </div>
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">% Ore consumate</span>
            <span className="text-xs text-slate-400">{fmtN(d.project_hours_actual)} h / {fmtN(d.iow_hours_total)} h budget</span>
          </div>
          <ProgressBar pct={d.pct_consumo_ore} color="slate" />
        </div>

        {/* FY breakdown — visibile solo se c'è >1 FY o per dare contesto */}
        {d.by_fy.length > 0 && (
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Timesheet importati per FY</p>
            <div className="flex flex-wrap gap-3">
              {d.by_fy.map(fy => (
                <div key={fy.fy} className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <span className="font-semibold text-slate-700">FY{String(fy.fy).slice(2)}</span>
                  <span className="text-slate-400 ml-2">{fy.weeks} sett. · {fmtN(fy.hours)} h · {fmtEur(fy.net_revenue)}</span>
                </div>
              ))}
              <div className="text-xs text-slate-400 flex items-center">
                Copertura TS: {tsCoverage != null ? `${tsCoverage.toFixed(1)}% del NR effettivo` : '—'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Forecast + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ForecastCard forecast={d.forecast} />
        <WeeklyChart weekly={d.weekly} />
      </div>

      {/* BU / CC breakdown */}
      <BuBreakdownSection
        byBu={d.by_bu}
        tsNrTotal={d.ts_nr_total}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

      {/* Caricamenti filtrati */}
      <WeeklySection
        entries={d.entries}
        weekly={d.weekly}
        activeFilter={activeFilter}
      />

    </div>
  )
}
