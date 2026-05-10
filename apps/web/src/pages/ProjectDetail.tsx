import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ComposedChart, Line,
} from 'recharts'
import { api } from '../api/client'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtEur(n: number | null | undefined, decimals = 0) {
  if (n == null) return '—'
  return new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: decimals,
  }).format(n)
}

function fmtN(n: number | null | undefined, dec = 1) {
  if (n == null) return '—'
  return n.toLocaleString('it-IT', { maximumFractionDigits: dec })
}

function PctBar({ value, color = 'bg-blue-500' }: { value: number | null; color?: string }) {
  if (value == null) return <span className="text-slate-400 text-sm">—</span>
  const pct = Math.min(Math.max(value, 0), 100)
  const barColor = value > 90 ? 'bg-red-500' : value > 70 ? 'bg-amber-400' : color
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold w-14 text-right">{value.toFixed(1)}%</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const projectId = decodeURIComponent(id ?? '')
  const [window, setWindow] = useState<string>('last_month')
  const [editOverride, setEditOverride] = useState<{ month_id: string; value: string } | null>(null)
  const qc = useQueryClient()

  const { data: fc, isLoading, error } = useQuery({
    queryKey: ['forecast', projectId, window],
    queryFn: () => api.forecast(projectId, window),
    enabled: !!projectId,
  })

  const overrideMut = useMutation({
    mutationFn: ({ month_id, nr }: { month_id: string; nr: number }) =>
      api.setOverride(projectId, month_id, { override_net_revenue: nr }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['forecast', projectId] }); setEditOverride(null) },
  })

  const deleteOverrideMut = useMutation({
    mutationFn: (month_id: string) => api.deleteOverride(projectId, month_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecast', projectId] }),
  })

  if (isLoading) return <div className="p-8 text-slate-500">Caricamento...</div>
  if (error) return <div className="p-8 text-red-600">Errore: {(error as Error).message}</div>
  if (!fc) return null

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* ── Header ── */}
      <div>
        <Link to="/projects" className="text-sm text-blue-600 hover:underline">← Progetti</Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-800">{fc.project_id}</h1>
              {fc.at_risk && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold animate-pulse">
                  ⚠ RISCHIO ESAURIMENTO
                </span>
              )}
              <StatusBadge status={fc.project_status} />
            </div>
            <p className="text-slate-500 mt-0.5">{fc.project_title}</p>
            <p className="text-slate-400 text-sm mt-0.5">
              {fc.client_name && <span className="font-medium text-slate-600">{fc.client_name}</span>}
              {fc.client_group && <span> · {fc.client_group}</span>}
              {fc.engagement_manager && <span> · EM: {fc.engagement_manager}</span>}
              {' · '}FY{String(fc.fy).slice(2)}
            </p>
          </div>
        </div>
      </div>

      {/* ── KPI Netto (primario) ── */}
      <section>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Net Revenue — metrica primaria
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="NR Actual (YTD)"
            value={fmtEur(fc.ts_net_revenue_total)}
            sub={`Budget IOW: ${fmtEur(fc.iow_net_revenue)}`}
            accent="blue"
          />
          <KpiCard
            label="% Consumo NR"
            value={fc.pct_consumo_nr != null ? `${fc.pct_consumo_nr}%` : '—'}
            sub={`${fmtEur(fc.residuo_eur)} residui`}
            accent={fc.pct_consumo_nr != null && fc.pct_consumo_nr > 90 ? 'red' : fc.pct_consumo_nr != null && fc.pct_consumo_nr > 70 ? 'amber' : 'blue'}
          />
          <KpiCard
            label="Forecast FY NR"
            value={fmtEur(fc.forecast_fy_net_revenue)}
            sub={`YTD: ${fmtEur(fc.actual_ytd_net_revenue)} · Futuri: ${fc.future_months_detail.length} mesi`}
            accent="green"
          />
          <KpiCard
            label="Data esaurimento NR"
            value={fc.data_esaurimento ?? '—'}
            sub={fc.mesi_residui_nr != null ? `≈ ${fc.mesi_residui_nr} mesi al run rate` : 'Nessun dato storico'}
            accent={fc.at_risk ? 'red' : 'default'}
          />
        </div>
      </section>

      {/* ── Barra consumo NR ── */}
      {fc.iow_net_revenue && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600 font-medium">Consumo Net Revenue</span>
            <span className="text-sm text-slate-500">
              {fmtEur(fc.ts_net_revenue_total)} / {fmtEur(fc.iow_net_revenue)}
            </span>
          </div>
          <PctBar value={fc.pct_consumo_nr} />
          {fc.pct_consumo_ore != null && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-400">Consumo ore</span>
                <span className="text-xs text-slate-400">
                  {fmtN(fc.ts_hours_total)} / {fmtN(fc.iow_hours_total)} h
                </span>
              </div>
              <PctBar value={fc.pct_consumo_ore} color="bg-slate-400" />
            </div>
          )}
        </div>
      )}

      {/* ── Grafico mensile NR + Ore ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-700 mb-4">Andamento mensile</h2>
          {fc.monthly_actuals.length === 0 ? (
            <p className="text-slate-400 text-sm">Nessun dato timesheet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={fc.monthly_actuals} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="month_id"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis
                  yAxisId="nr"
                  orientation="left"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  yAxisId="h"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => `${v}h`}
                />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === 'Net Revenue' ? [fmtEur(value), name] : [`${fmtN(value)} h`, name]
                  }
                  labelFormatter={(l: string) => {
                    const m = fc.monthly_actuals.find(x => x.month_id === l)
                    return `${l}${m?.is_partial ? ' (parziale)' : ''}`
                  }}
                />
                <Legend />
                <Bar yAxisId="nr" dataKey="net_revenue" name="Net Revenue" fill="#3b82f6" radius={[3, 3, 0, 0]} opacity={0.85} />
                <Line yAxisId="h" dataKey="hours" name="Ore" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Run rate & Scenari */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-700">Run Rate</h2>
            <select
              value={window}
              onChange={(e) => setWindow(e.target.value)}
              className="text-xs border border-slate-200 rounded px-2 py-1 text-slate-600"
            >
              <option value="last_month">Ultimo mese</option>
              <option value="last_3_months">Media 3 mesi</option>
              <option value="weighted">Ponderato (3/2/1)</option>
            </select>
          </div>

          {fc.run_rate.complete_months_available === 0 ? (
            <p className="text-amber-600 text-sm">Nessun mese completo disponibile per il run rate.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-blue-500 uppercase tracking-wide">NR / mese</p>
                  <p className="text-xl font-bold text-blue-700 mt-1">{fmtEur(fc.run_rate.net_revenue)}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Ore / mese</p>
                  <p className="text-xl font-bold text-slate-600 mt-1">{fmtN(fc.run_rate.hours)} h</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 text-center">
                {fc.run_rate.months_used} mesi usati · {fc.run_rate.complete_months_available} mesi completi disponibili
              </p>

              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Scenari NR mensile</p>
                <div className="grid grid-cols-3 gap-1 text-center text-xs">
                  {(['low', 'base', 'high'] as const).map((s) => (
                    <div key={s} className={`rounded p-2 ${s === 'base' ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50'}`}>
                      <p className="text-slate-400 capitalize">{s === 'low' ? 'P25' : s === 'base' ? 'P50' : 'P75'}</p>
                      <p className="font-semibold text-slate-700">{fmtEur(fc.scenari_nr[s], 0)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Risorse ── */}
      <section>
        <h2 className="text-base font-semibold text-slate-700 mb-3">
          Risorse ({fc.resources.length}) — breakdown per Net Revenue
        </h2>
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <th className="text-left px-4 py-3">Risorsa</th>
                <th className="text-left px-4 py-3">Ruolo</th>
                <th className="text-right px-4 py-3">Ore</th>
                <th className="text-right px-4 py-3">Net Revenue</th>
                <th className="text-right px-4 py-3">€/h (blended)</th>
                <th className="text-right px-4 py-3">% NR</th>
                <th className="px-4 py-3 w-32">Peso NR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fc.resources.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Nessun dato risorsa.</td></tr>
              )}
              {fc.resources.map((r) => (
                <tr key={r.resource_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-700">{r.resource_name}</p>
                    <p className="text-xs text-slate-400">{r.resource_id}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{r.job_title ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmtN(r.hours)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmtEur(r.net_revenue)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmtEur(r.blended_net_rate)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{r.pct_nr != null ? `${r.pct_nr}%` : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400 rounded-full"
                        style={{ width: `${r.pct_nr ?? 0}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {fc.resources.length > 0 && (
                <tr className="bg-slate-50 font-semibold">
                  <td colSpan={2} className="px-4 py-2.5 text-slate-600 text-sm">Totale</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{fmtN(fc.ts_hours_total)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-800">{fmtEur(fc.ts_net_revenue_total)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">
                    {fc.ts_hours_total ? fmtEur(fc.ts_net_revenue_total / fc.ts_hours_total) : '—'}
                  </td>
                  <td colSpan={2} className="px-4 py-2.5" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Forecast mesi futuri ── */}
      {fc.future_months_detail.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-slate-700 mb-3">
            Proiezione FY{String(fc.fy).slice(2)} — mesi futuri
          </h2>
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <th className="text-left px-4 py-3">Mese</th>
                  <th className="text-right px-4 py-3">NR proiettato</th>
                  <th className="text-left px-4 py-3">Fonte</th>
                  <th className="px-4 py-3">Azione</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fc.future_months_detail.map((m) => {
                  const isEditing = editOverride?.month_id === m.month_id
                  const hasOverride = m.is_override
                  return (
                    <tr key={m.month_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-700">{m.month_id}</td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            step="100"
                            value={editOverride?.value ?? ''}
                            onChange={(e) => setEditOverride({ month_id: m.month_id, value: e.target.value })}
                            className="w-28 border border-blue-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                            autoFocus
                          />
                        ) : (
                          <span className={hasOverride ? 'font-semibold text-blue-700' : 'text-slate-700'}>
                            {fmtEur(m.projected_nr)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${hasOverride ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                          {hasOverride ? 'Override' : 'Run rate'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => overrideMut.mutate({ month_id: m.month_id, nr: parseFloat(editOverride?.value ?? '0') })}
                              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                              Salva
                            </button>
                            <button
                              onClick={() => setEditOverride(null)}
                              className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-50"
                            >
                              Annulla
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditOverride({ month_id: m.month_id, value: String(m.projected_nr ?? '') })}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              {hasOverride ? 'Modifica' : 'Override'}
                            </button>
                            {hasOverride && (
                              <button
                                onClick={() => deleteOverrideMut.mutate(m.month_id)}
                                className="text-xs text-red-500 hover:underline"
                              >
                                Rimuovi
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-slate-50 font-semibold border-t border-slate-200">
                  <td className="px-4 py-2.5 text-slate-600 text-sm">Totale proiettato</td>
                  <td className="px-4 py-2.5 text-right text-slate-800">
                    {fmtEur(fc.future_months_detail.reduce((s, m) => s + (m.projected_nr ?? 0), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
            <span className="font-semibold text-green-800">Forecast totale FY{String(fc.fy).slice(2)}: </span>
            <span className="text-green-700 font-bold text-base">{fmtEur(fc.forecast_fy_net_revenue)}</span>
            <span className="text-green-600 ml-3">
              (YTD {fmtEur(fc.actual_ytd_net_revenue)} + proiettato {fmtEur(fc.future_months_detail.reduce((s, m) => s + (m.projected_nr ?? 0), 0))})
            </span>
          </div>
        </section>
      )}

      {/* ── Dettaglio mensile ── */}
      <section>
        <h2 className="text-base font-semibold text-slate-700 mb-3">Storico mensile</h2>
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <th className="text-left px-4 py-3">Mese</th>
                <th className="text-right px-4 py-3">Net Revenue</th>
                <th className="text-right px-4 py-3">Ore</th>
                <th className="text-right px-4 py-3">€/h medio</th>
                <th className="text-left px-4 py-3">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fc.monthly_actuals.map((m) => (
                <tr key={m.month_id} className={`hover:bg-slate-50 ${m.is_partial ? 'opacity-70' : ''}`}>
                  <td className="px-4 py-2.5 text-slate-700 font-medium">{m.month_id}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{fmtEur(m.net_revenue)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{fmtN(m.hours)} h</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">
                    {m.hours > 0 ? fmtEur(m.net_revenue / m.hours) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">
                    {m.is_partial ? '⚠ mese in corso (escluso dal run rate)' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent = 'default',
}: {
  label: string; value: string; sub?: string; accent?: 'blue' | 'green' | 'red' | 'amber' | 'default'
}) {
  const borders = { blue: 'border-l-blue-500', green: 'border-l-green-500', red: 'border-l-red-500', amber: 'border-l-amber-500', default: 'border-l-slate-300' }
  return (
    <div className={`bg-white rounded-lg border border-slate-200 border-l-4 ${borders[accent]} p-4 shadow-sm`}>
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-slate-800 mt-1 leading-tight">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null
  const colors: Record<string, string> = {
    'In Chiusura': 'bg-slate-100 text-slate-600',
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
