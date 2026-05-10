import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api } from '../api/client'
import KpiCard from '../components/KpiCard'

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null) return '—'
  return n.toLocaleString('it-IT', { maximumFractionDigits: dec })
}

function fmtEur(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const projectId = decodeURIComponent(id ?? '')

  const { data: forecast, isLoading, error } = useQuery({
    queryKey: ['forecast', projectId],
    queryFn: () => api.forecast(projectId),
    enabled: !!projectId,
  })

  if (isLoading) return <div className="p-8 text-slate-500">Caricamento...</div>
  if (error) return <div className="p-8 text-red-600">Errore: {(error as Error).message}</div>
  if (!forecast) return null

  const { run_rate, scenari, monthly_actuals } = forecast

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <Link to="/projects" className="text-sm text-blue-600 hover:underline">← Progetti</Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold text-slate-800">{forecast.project_id}</h1>
          {forecast.at_risk && (
            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">A RISCHIO</span>
          )}
        </div>
        <p className="text-slate-500 text-sm mt-0.5">{forecast.project_title}</p>
      </div>

      {/* KPI principali */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Ore consumate"
          value={fmt(forecast.ts_hours_total, 1)}
          sub={`Budget: ${fmt(forecast.iow_hours_total, 0)} h`}
        />
        <KpiCard
          label="NR Actual"
          value={fmtEur(forecast.ts_net_revenue_total)}
          sub={`Budget IOW: ${fmtEur(forecast.iow_net_revenue)}`}
        />
        <KpiCard
          label="Residuo ore"
          value={fmt(forecast.residuo_ore, 1)}
          accent={forecast.at_risk ? 'red' : 'default'}
          sub={forecast.mesi_residui != null ? `≈ ${forecast.mesi_residui.toFixed(1)} mesi` : undefined}
        />
        <KpiCard
          label="Data esaurimento"
          value={forecast.data_esaurimento ?? '—'}
          accent={forecast.at_risk ? 'red' : 'default'}
          sub={forecast.at_risk ? 'Entro 60 giorni!' : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Run rate & Forecast */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-slate-700">Run Rate & Forecast FY{String(forecast.fy).slice(2)}</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide">Run rate mensile</p>
              <p className="font-semibold text-slate-800 mt-1">{fmt(run_rate.hours, 1)} h/mese</p>
              <p className="text-slate-500 text-xs">{fmtEur(run_rate.net_revenue)}/mese</p>
              <p className="text-slate-400 text-xs mt-0.5">finestra: {run_rate.window} ({run_rate.months_used} mesi)</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide">Forecast FY netto</p>
              <p className="font-semibold text-slate-800 mt-1">{fmtEur(forecast.forecast_fy_net_revenue)}</p>
              <p className="text-slate-500 text-xs">YTD actual: {fmtEur(forecast.actual_ytd_net_revenue)}</p>
            </div>
          </div>

          {/* Scenari */}
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-2">Scenari ore/mese</p>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'base', 'high'] as const).map((s) => (
                <div key={s} className={`rounded p-2 text-center text-sm ${s === 'base' ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50'}`}>
                  <p className="text-xs text-slate-500 capitalize">{s === 'base' ? 'Base (mediana)' : s === 'low' ? 'Low (P25)' : 'High (P75)'}</p>
                  <p className="font-semibold text-slate-700">{fmt(scenari[s], 1)} h</p>
                </div>
              ))}
            </div>
          </div>

          {/* Override mesi futuri */}
          {forecast.future_months.length > 0 && (
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-2">Override mesi futuri</p>
              <div className="space-y-1">
                {forecast.future_months.slice(0, 4).map((mid) => {
                  const ov = forecast.overrides.find((o) => o.month_id === mid)
                  return (
                    <div key={mid} className="flex items-center gap-2 text-xs">
                      <span className="w-16 text-slate-500">{mid}</span>
                      <span className="flex-1 text-slate-400">
                        {ov ? `override: ${fmtEur(ov.override_net_revenue)}` : `run rate: ${fmtEur(run_rate.net_revenue)}`}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Grafico mensile */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-700 mb-4">Ore mensili</h2>
          {monthly_actuals.length === 0 ? (
            <p className="text-slate-400 text-sm">Nessun dato timesheet disponibile.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthly_actuals} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month_id" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value: number) => [`${value.toFixed(1)} h`, 'Ore']}
                  labelFormatter={(label: string) => `Mese: ${label}`}
                />
                <Bar dataKey="hours" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Tabella mensile dettagliata */}
      {monthly_actuals.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <h2 className="text-base font-semibold text-slate-700 px-5 py-4 border-b border-slate-200">Dettaglio mensile</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Mese</th>
                <th className="text-right px-5 py-3">Ore</th>
                <th className="text-right px-5 py-3">Net Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthly_actuals.map((m) => (
                <tr key={m.month_id} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 text-slate-700">{m.month_id}</td>
                  <td className="px-5 py-2.5 text-right text-slate-700">{fmt(m.hours, 1)}</td>
                  <td className="px-5 py-2.5 text-right text-slate-700">{fmtEur(m.net_revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
