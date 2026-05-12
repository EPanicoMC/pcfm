import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import { api, BuBreakdown, DetailEntry, GirocontoTag, WeeklyForecast, WeeklyLoad, WeeklyResource } from '../api/client'

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

function ForecastCard({ forecast, onDeepDive, deepDiveOpen }: {
  forecast: WeeklyForecast
  onDeepDive: () => void
  deepDiveOpen: boolean
}) {
  const isLastWeekLow =
    forecast.last_week_nr != null && forecast.avg_4w_nr != null &&
    forecast.avg_4w_nr > 0 && forecast.last_week_nr / forecast.avg_4w_nr < 0.3

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Previsione saturazione</span>
        <button
          onClick={onDeepDive}
          className={`text-xs px-3 py-1 rounded-lg border transition-colors font-medium ${
            deepDiveOpen
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {deepDiveOpen ? '▾ Deep Dive' : '▸ Deep Dive'}
        </button>
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

// ── Forecast Deep Dive ────────────────────────────────────────────────────────

type AdjType = 'normale' | 'ferie' | 'assenza'
type ResourceAdj = Record<string, AdjType>

interface ActiveResource {
  resource_id: string
  resource_name: string
  avg_weekly_nr: number
  weeks_active: number
}

function ForecastDeepdive({ projectId, forecast, weekly }: {
  projectId: string
  forecast: WeeklyForecast
  weekly: WeeklyLoad[]
}) {
  const storageKey = `pcfm_deepdive_${projectId}`
  const [adjustments, setAdjustments] = useState<ResourceAdj>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}') }
    catch { return {} }
  })
  const [saved, setSaved] = useState(false)

  const activeResources = useMemo<ActiveResource[]>(() => {
    const activeWeeks = weekly.filter(w => w.has_activity).slice(0, 4)
    if (activeWeeks.length === 0) return []
    const resourceMap = new Map<string, { name: string; nrs: number[] }>()
    for (const week of activeWeeks) {
      for (const r of week.resources) {
        if (r.net_revenue > 0.01) {
          if (!resourceMap.has(r.resource_id)) {
            resourceMap.set(r.resource_id, { name: r.resource_name, nrs: [] })
          }
          resourceMap.get(r.resource_id)!.nrs.push(r.net_revenue)
        }
      }
    }
    return Array.from(resourceMap.entries())
      .map(([rid, d]) => ({
        resource_id: rid,
        resource_name: d.name,
        avg_weekly_nr: d.nrs.reduce((s, v) => s + v, 0) / activeWeeks.length,
        weeks_active: d.nrs.length,
      }))
      .sort((a, b) => b.avg_weekly_nr - a.avg_weekly_nr)
  }, [weekly])

  const adjustedNrPerWeek = useMemo(() =>
    activeResources.reduce((sum, r) => {
      const adj = adjustments[r.resource_id] ?? 'normale'
      return sum + r.avg_weekly_nr * (adj === 'normale' ? 1 : adj === 'ferie' ? 0.5 : 0)
    }, 0),
    [activeResources, adjustments]
  )

  const residuo = forecast.residuo_eur ?? 0
  const weeksToSat = adjustedNrPerWeek > 0 ? residuo / adjustedNrPerWeek : null
  const baseDate = forecast.last_week_end ?? forecast.last_week_id
  const satDate = weeksToSat != null && baseDate
    ? (() => {
        const d = new Date(baseDate + 'T00:00:00')
        d.setDate(d.getDate() + Math.round(weeksToSat * 7))
        return d.toISOString().slice(0, 10)
      })()
    : null

  function setAdj(rid: string, adj: AdjType) {
    setAdjustments(prev => ({ ...prev, [rid]: adj }))
    setSaved(false)
  }

  function save() {
    localStorage.setItem(storageKey, JSON.stringify(adjustments))
    setSaved(true)
  }

  function reset() {
    setAdjustments({})
    localStorage.removeItem(storageKey)
    setSaved(false)
  }

  const baseNr = forecast.avg_4w_nr ?? 0
  const deltaVsBase = adjustedNrPerWeek - baseNr
  const deltaLabel = deltaVsBase >= 0 ? `+${fmtEur(deltaVsBase)}` : fmtEur(deltaVsBase)

  if (activeResources.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-sm text-slate-400">
        Nessuna risorsa attiva nelle ultime 4 settimane — impossibile costruire lo scenario.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Deep Dive — Scenario previsionale</span>
          <p className="text-xs text-slate-400 mt-0.5">
            Configura il carico atteso per risorsa. Base: media ultime 4 settimane attive. Ferie = −50%.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reset} className="text-xs text-slate-400 hover:text-red-600 transition-colors px-2 py-1">
            Azzera
          </button>
          <button
            onClick={save}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
              saved
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {saved ? '✓ Salvato' : 'Salva scenario'}
          </button>
        </div>
      </div>

      {/* Tabella risorse */}
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left px-4 py-2.5 font-medium">Risorsa</th>
              <th className="text-right px-3 py-2.5 font-medium">NR/sett (avg 4w)</th>
              <th className="text-center px-3 py-2.5 font-medium">Sett. attive</th>
              <th className="text-center px-3 py-2.5 font-medium min-w-[260px]">Scenario</th>
              <th className="text-right px-4 py-2.5 font-medium">NR atteso/sett</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {activeResources.map(r => {
              const adj = adjustments[r.resource_id] ?? 'normale'
              const factor = adj === 'normale' ? 1 : adj === 'ferie' ? 0.5 : 0
              const expected = r.avg_weekly_nr * factor
              return (
                <tr key={r.resource_id} className={adj !== 'normale' ? 'bg-amber-50/30' : 'hover:bg-slate-50/50'}>
                  <td className="px-4 py-3 font-medium text-slate-700">{r.resource_name}</td>
                  <td className="px-3 py-3 text-right text-slate-500 tabular-nums">{fmtEur(r.avg_weekly_nr)}</td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-xs text-slate-400">{r.weeks_active} / 4</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1 justify-center">
                      {(['normale', 'ferie', 'assenza'] as AdjType[]).map(type => (
                        <button
                          key={type}
                          onClick={() => setAdj(r.resource_id, type)}
                          className={`px-2.5 py-1 rounded-md text-xs border transition-all font-medium ${
                            adj === type
                              ? type === 'normale'
                                ? 'bg-green-600 text-white border-green-600 shadow-sm'
                                : type === 'ferie'
                                ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                : 'bg-red-500 text-white border-red-500 shadow-sm'
                              : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'
                          }`}
                        >
                          {type === 'normale' ? 'Normale' : type === 'ferie' ? 'Ferie −50%' : 'Assenza'}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {adj === 'assenza'
                      ? <span className="text-slate-300 line-through text-xs">{fmtEur(r.avg_weekly_nr)}</span>
                      : <span className={`font-semibold ${adj === 'ferie' ? 'text-amber-600' : 'text-slate-700'}`}>{fmtEur(expected)}</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Risultato scenario */}
      <div className="grid grid-cols-3 gap-4 pt-1">
        <div className="bg-slate-50 rounded-lg px-4 py-3 text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">NR/sett baseline</p>
          <p className="text-lg font-bold text-slate-400 mt-1 tabular-nums">{fmtEur(baseNr)}</p>
          <p className="text-xs text-slate-400">Media 4w attive</p>
        </div>
        <div className={`rounded-lg px-4 py-3 text-center border ${
          adjustedNrPerWeek < baseNr * 0.8 ? 'bg-red-50 border-red-200' : 'bg-indigo-50 border-indigo-200'
        }`}>
          <p className="text-xs text-indigo-600 uppercase tracking-wide font-medium">NR/sett scenario</p>
          <p className={`text-lg font-bold mt-1 tabular-nums ${adjustedNrPerWeek < baseNr * 0.8 ? 'text-red-600' : 'text-indigo-700'}`}>
            {fmtEur(adjustedNrPerWeek)}
          </p>
          <p className={`text-xs ${deltaVsBase < 0 ? 'text-red-500' : 'text-slate-400'}`}>{deltaLabel} vs baseline</p>
        </div>
        <div className="bg-slate-50 rounded-lg px-4 py-3 text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Saturazione stimata</p>
          <p className={`text-lg font-bold mt-1 ${satDate ? 'text-slate-800' : 'text-slate-300'}`}>
            {satDate ? fmtDate(satDate) : '—'}
          </p>
          <p className="text-xs text-slate-400">
            {weeksToSat != null ? `${weeksToSat.toFixed(1)} settimane` : 'NR/sett = 0'}
          </p>
        </div>
      </div>
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

function ResourceSubTable({ resources, activeFilter }: { resources: WeeklyResource[]; activeFilter: ActiveFilter }) {
  const filtered = activeFilter
    ? resources.filter(r => activeFilter.type === 'cc' ? r.cc_code === activeFilter.value : r.bu === activeFilter.value)
    : resources
  if (filtered.length === 0) return (
    <p className="text-xs text-slate-400 py-2 px-1">Nessuna risorsa per il filtro attivo.</p>
  )
  return (
    <table className="w-full text-xs mt-1">
      <thead>
        <tr className="text-slate-400 border-b border-slate-200">
          <th className="text-left py-1.5 font-medium">Risorsa</th>
          <th className="text-left py-1.5 font-medium">CC</th>
          <th className="text-left py-1.5 font-medium">BU</th>
          <th className="text-right py-1.5 font-medium">Ore</th>
          <th className="text-right py-1.5 font-medium">Realizzo</th>
          <th className="text-right py-1.5 font-medium">NR</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {filtered.map(r => (
          <tr key={r.resource_id} className="hover:bg-white/60">
            <td className="py-1.5 text-slate-700 font-medium">{r.resource_name}</td>
            <td className="py-1.5 text-slate-500">{r.cc_name}<span className="text-slate-400 ml-1">({r.cc_code})</span></td>
            <td className="py-1.5 text-slate-500">{r.bu}</td>
            <td className="py-1.5 text-right text-slate-600">{fmtN(r.hours)} h</td>
            <td className="py-1.5 text-right text-slate-500">{r.realization_pct != null ? `${r.realization_pct}%` : '—'}</td>
            <td className="py-1.5 text-right font-semibold text-slate-700">{fmtEur(r.net_revenue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function WeeklySection({
  entries, weekly, activeFilter, projectId, giroconti,
}: {
  entries: DetailEntry[]
  weekly: WeeklyLoad[]
  activeFilter: ActiveFilter
  projectId: string
  giroconti: GirocontoTag[]
}) {
  const queryClient = useQueryClient()
  const [dateFilter, setDateFilter] = useState<DateFilter>({ mode: 'all' })
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())

  const girocontiSet = useMemo(() => new Set(giroconti.map(g => g.week_id)), [giroconti])

  const tagMut = useMutation({
    mutationFn: ({ week_id, tag }: { week_id: string; tag: boolean }) =>
      tag
        ? api.tagGiroconto(projectId, week_id, 'Giroconto')
        : api.untagGiroconto(projectId, week_id).then(() => null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['giroconti', projectId] })
      // Ricalcola previsioning: i giroconti vengono esclusi dal run rate
      queryClient.invalidateQueries({ queryKey: ['dashboard-fy-forecast'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] })
    },
  })

  const weeklyMap = useMemo(() => new Map(weekly.map(w => [w.week_id, w])), [weekly])

  // Settimane e mesi disponibili per i filtri data
  const availableWeeks = useMemo(() => {
    const wids = [...new Set(entries.map(e => e.week_id))].sort().reverse()
    return wids.map(wid => {
      const e = entries.find(x => x.week_id === wid)
      return { week_id: wid, week_end: e?.week_end ?? null }
    })
  }, [entries])

  const availableMonths = useMemo(() => {
    return [...new Set(entries.map(e => e.week_id.slice(0, 7)))].sort().reverse()
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
    if (dateFilter.mode === 'week' && dateFilter.weekId) res = res.filter(e => e.week_id === dateFilter.weekId)
    else if (dateFilter.mode === 'month' && dateFilter.month) res = res.filter(e => e.week_id.startsWith(dateFilter.month!))
    else if (dateFilter.mode === 'custom' && dateFilter.from && dateFilter.to) res = res.filter(e => e.week_id >= dateFilter.from! && e.week_id <= dateFilter.to!)
    return res
  }, [ccFiltered, dateFilter])

  // Aggregazione per settimana delle entries filtrate
  const filteredWeekly = useMemo(() => {
    const byWeek: Record<string, { week_id: string; week_end: string | null; fy: number; hours: number; net_revenue: number; gross_revenue: number; discount: number }> = {}
    for (const e of filtered) {
      if (!byWeek[e.week_id]) byWeek[e.week_id] = { week_id: e.week_id, week_end: e.week_end, fy: e.fy, hours: 0, net_revenue: 0, gross_revenue: 0, discount: 0 }
      byWeek[e.week_id].hours += e.hours
      byWeek[e.week_id].net_revenue += e.net_revenue
      byWeek[e.week_id].gross_revenue += e.gross_revenue
      byWeek[e.week_id].discount += e.discount
    }
    return Object.values(byWeek).sort((a, b) => b.week_id.localeCompare(a.week_id))
  }, [filtered])

  const useOriginalWeekly = !activeFilter && dateFilter.mode === 'all'
  const rows = useOriginalWeekly ? weekly : filteredWeekly

  const totH = rows.reduce((s, r) => s + r.hours, 0)
  const totNR = rows.reduce((s, r) => s + r.net_revenue, 0)
  const totGross = rows.reduce((s, r) => s + r.gross_revenue, 0)
  const totDisc = rows.reduce((s, r) => s + r.discount, 0)
  const isFiltered = !!(activeFilter || dateFilter.mode !== 'all')

  function toggleWeek(weekId: string) {
    setExpandedWeeks(prev => { const s = new Set(prev); s.has(weekId) ? s.delete(weekId) : s.add(weekId); return s })
  }

  // Colonne: expand + data + FY + ore + lordo + sconto + netto + (risorse) + G = 8 o 9
  const colCount = useOriginalWeekly ? 9 : 8

  return (
    <section>
      {/* Barra filtri */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mr-2">
          Caricamenti settimanali
        </h2>
        {activeFilter && (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
            {activeFilter.type === 'bu' ? 'BU' : 'CC'}: {activeFilter.value}
          </span>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-1 text-xs">
          {(['all', 'week', 'month', 'custom'] as DateFilterMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setDateFilter({ mode })}
              className={`px-2.5 py-1 rounded-md border transition-colors ${
                dateFilter.mode === mode ? 'bg-slate-700 text-white border-slate-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {mode === 'all' ? 'Tutto' : mode === 'week' ? 'Settimana' : mode === 'month' ? 'Mese' : 'Range'}
            </button>
          ))}
        </div>
        {dateFilter.mode === 'week' && (
          <select value={dateFilter.weekId ?? ''} onChange={e => setDateFilter(prev => ({ ...prev, weekId: e.target.value }))}
            className="text-xs border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Seleziona settimana...</option>
            {availableWeeks.map(w => <option key={w.week_id} value={w.week_id}>al {fmtDate(w.week_end ?? w.week_id)} ({w.week_id})</option>)}
          </select>
        )}
        {dateFilter.mode === 'month' && (
          <select value={dateFilter.month ?? ''} onChange={e => setDateFilter(prev => ({ ...prev, month: e.target.value }))}
            className="text-xs border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Seleziona mese...</option>
            {availableMonths.map(m => <option key={m} value={m}>{monthLabel(m)} ({m})</option>)}
          </select>
        )}
        {dateFilter.mode === 'custom' && (
          <div className="flex items-center gap-1 text-xs">
            <input type="date" value={dateFilter.from ?? ''} onChange={e => setDateFilter(prev => ({ ...prev, from: e.target.value }))}
              className="border border-slate-300 rounded px-2 py-1 focus:outline-none" />
            <span className="text-slate-400">→</span>
            <input type="date" value={dateFilter.to ?? ''} onChange={e => setDateFilter(prev => ({ ...prev, to: e.target.value }))}
              className="border border-slate-300 rounded px-2 py-1 focus:outline-none" />
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
              <th className="w-8" />
              <th className="text-left px-3 py-3">Sett. (al)</th>
              <th className="text-left px-3 py-3">FY</th>
              <th className="text-right px-3 py-3">Ore</th>
              <th className="text-right px-3 py-3">Lordo</th>
              <th className="text-right px-3 py-3">Sconto</th>
              <th className="text-right px-3 py-3 font-semibold text-slate-700">Netto</th>
              {useOriginalWeekly && <th className="text-right px-3 py-3">Risorse</th>}
              <th className="w-10 text-center px-1 py-3 text-slate-400" title="Giroconto — escludi dal previsioning">G</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={colCount} className="px-4 py-8 text-center text-slate-400">Nessun dato per il filtro selezionato.</td></tr>
            )}
            {rows.map((w) => {
              const hasAct = useOriginalWeekly ? (w as WeeklyLoad).has_activity : w.hours > 0 || Math.abs(w.net_revenue) > 0.01
              const expanded = expandedWeeks.has(w.week_id)
              const weekResources = weeklyMap.get(w.week_id)?.resources ?? []

              return (
                <>
                  <tr
                    key={w.week_id}
                    className={`border-t border-slate-100 transition-colors ${hasAct ? '' : 'opacity-35'} ${expanded ? 'bg-slate-50' : ''}`}
                  >
                    {/* Expand toggle */}
                    <td className="pl-2 pr-0">
                      <button
                        onClick={() => toggleWeek(w.week_id)}
                        disabled={weekResources.length === 0}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:cursor-default w-6 h-6 flex items-center justify-center rounded transition-colors"
                        title={expanded ? 'Chiudi risorse' : 'Mostra risorse'}
                      >
                        {expanded ? '▾' : '▸'}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-medium text-slate-700">{fmtDate(w.week_end ?? w.week_id)}</span>
                      <span className="text-xs text-slate-400 ml-2">{w.week_id}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400">FY{String(w.fy).slice(2)}</td>
                    <td className="px-3 py-3 text-right text-slate-600">{hasAct ? `${fmtN(w.hours)} h` : '—'}</td>
                    <td className="px-3 py-3 text-right text-slate-500">{hasAct ? fmtEur(w.gross_revenue) : '—'}</td>
                    <td className="px-3 py-3 text-right text-slate-400 text-xs">{hasAct && w.discount !== 0 ? fmtEur(w.discount) : '—'}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-800">{hasAct ? fmtEur(w.net_revenue) : '—'}</td>
                    {useOriginalWeekly && (
                      <td className="px-3 py-3 text-right text-slate-500">
                        {hasAct ? (w as WeeklyLoad).resources_active : '—'}
                      </td>
                    )}
                    <td className="px-1 py-3 text-center">
                      {hasAct && (
                        <button
                          title={girocontiSet.has(w.week_id) ? 'Rimuovi tag giroconto' : 'Marca come giroconto (escluso dal previsioning)'}
                          onClick={() => tagMut.mutate({ week_id: w.week_id, tag: !girocontiSet.has(w.week_id) })}
                          className={`w-6 h-6 rounded text-xs font-bold transition-colors ${
                            girocontiSet.has(w.week_id)
                              ? 'bg-orange-500 text-white'
                              : 'bg-slate-100 text-slate-400 hover:bg-orange-100 hover:text-orange-600'
                          }`}
                        >
                          G
                        </button>
                      )}
                    </td>
                  </tr>
                  {/* Riga espansa con dettaglio risorse */}
                  {expanded && (
                    <tr key={`${w.week_id}-res`} className="bg-slate-50 border-t border-slate-100">
                      <td colSpan={colCount} className="px-6 pb-3">
                        <ResourceSubTable resources={weekResources} activeFilter={activeFilter} />
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-sm">
              <td />
              <td className="px-3 py-3 text-slate-600">Totale {isFiltered ? '(filtrato)' : ''}</td>
              <td />
              <td className="px-3 py-3 text-right text-slate-700">{fmtN(totH)} h</td>
              <td className="px-3 py-3 text-right text-slate-600">{fmtEur(totGross)}</td>
              <td className="px-3 py-3 text-right text-slate-500 text-xs">{fmtEur(totDisc)}</td>
              <td className="px-3 py-3 text-right text-slate-800">{fmtEur(totNR)}</td>
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
  const [deepDiveOpen, setDeepDiveOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['project-detail', id],
    queryFn: () => api.projectDetail(id!),
  })

  const { data: girocontiData } = useQuery({
    queryKey: ['giroconti', id],
    queryFn: () => api.giroconti(id),
    enabled: !!id,
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

      {/* Realizzo + Margine strip */}
      {(d.ts_realization_pct != null || d.bi_real_pct != null || d.margin_pct != null) && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-3 flex flex-wrap gap-6 text-sm">
          {d.ts_realization_pct != null && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Realizzo TS</p>
              <p className="text-xl font-bold text-slate-800 mt-0.5">{d.ts_realization_pct.toFixed(1)}%</p>
              <p className="text-xs text-slate-400">NR / Lordo da timesheet</p>
            </div>
          )}
          {d.bi_real_pct != null && (
            <div className="border-l border-slate-200 pl-6">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Realizzo F9</p>
              <p className="text-xl font-bold text-slate-800 mt-0.5">{d.bi_real_pct.toFixed(1)}%</p>
              <p className="text-xs text-slate-400">Autoritative da File 9</p>
            </div>
          )}
          {d.margin_pct != null && (
            <div className="border-l border-slate-200 pl-6">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Margine</p>
              <p className={`text-xl font-bold mt-0.5 ${d.margin_pct < 15 ? 'text-red-600' : d.margin_pct < 25 ? 'text-amber-600' : 'text-green-700'}`}>
                {d.margin_pct.toFixed(1)}%
              </p>
              <p className="text-xs text-slate-400">Incl. costo personale (F9)</p>
            </div>
          )}
          {d.wip_provision != null && d.wip_provision !== 0 && (
            <div className="border-l border-slate-200 pl-6">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">WIP Provision</p>
              <p className={`text-xl font-bold mt-0.5 ${d.wip_provision < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                {fmtEur(d.wip_provision)}
              </p>
              <p className="text-xs text-slate-400">Accantonamento rischio</p>
            </div>
          )}
        </div>
      )}

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
        <ForecastCard
          forecast={d.forecast}
          onDeepDive={() => setDeepDiveOpen(o => !o)}
          deepDiveOpen={deepDiveOpen}
        />
        <WeeklyChart weekly={d.weekly} />
      </div>

      {/* Deep Dive panel */}
      {deepDiveOpen && (
        <ForecastDeepdive
          projectId={d.project_id}
          forecast={d.forecast}
          weekly={d.weekly}
        />
      )}

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
        projectId={d.project_id}
        giroconti={girocontiData ?? []}
      />

    </div>
  )
}
