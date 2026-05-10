import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import KpiCard from '../components/KpiCard'

function fmt(n: number | null | undefined, decimals = 0) {
  if (n == null) return '—'
  return n.toLocaleString('it-IT', { maximumFractionDigits: decimals })
}

function fmtEur(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.dashboard() })

  if (isLoading) return <div className="p-8 text-slate-500">Caricamento...</div>
  if (error) return <div className="p-8 text-red-600">Errore: {(error as Error).message}</div>
  if (!data) return null

  const { totals, at_risk_projects, top_clients_by_revenue, fy } = data

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <span className="text-slate-500 text-sm">FY{String(fy).slice(2)}</span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Progetti attivi" value={totals.project_count} />
        <KpiCard
          label="% Consumo globale"
          value={totals.pct_consumo_globale != null ? `${totals.pct_consumo_globale}%` : null}
          sub={`${fmt(totals.ts_hours_total)} h / ${fmt(totals.iow_hours_total)} h`}
        />
        <KpiCard
          label="Net Revenue actual"
          value={fmtEur(totals.ts_net_revenue_total)}
          sub={`Budget IOW: ${fmtEur(totals.iow_net_revenue_total)}`}
        />
        <KpiCard
          label="Residuo EUR"
          value={fmtEur(totals.residuo_eur_totale)}
          accent={totals.residuo_eur_totale < 0 ? 'red' : 'green'}
          sub={`${fmt(totals.residuo_ore_totale)} ore residue`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Progetti a rischio */}
        <section>
          <h2 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            Codici a rischio ({at_risk_projects.length})
          </h2>
          {at_risk_projects.length === 0 ? (
            <p className="text-slate-400 text-sm">Nessun codice a rischio esaurimento ≤ 60gg.</p>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
              {at_risk_projects.map((p) => (
                <Link
                  key={p.project_id}
                  to={`/projects/${encodeURIComponent(p.project_id)}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{p.project_id}</p>
                    <p className="text-xs text-slate-400 truncate max-w-xs">{p.project_title}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className={`text-sm font-semibold ${(p.giorni_residui ?? 999) <= 30 ? 'text-red-600' : 'text-amber-600'}`}>
                      {p.giorni_residui != null ? `${p.giorni_residui}gg` : '—'}
                    </p>
                    <p className="text-xs text-slate-400">{p.data_esaurimento ?? '—'}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Top clienti */}
        <section>
          <h2 className="text-base font-semibold text-slate-700 mb-3">Top clienti per revenue</h2>
          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
            {top_clients_by_revenue.map((c) => (
              <div key={c.client_name} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{c.client_name}</p>
                  <p className="text-xs text-slate-400">{c.project_count} codici · {fmt(c.ts_hours)} h</p>
                </div>
                <p className="text-sm font-semibold text-slate-700">{fmtEur(c.ts_net_revenue)}</p>
              </div>
            ))}
            {top_clients_by_revenue.length === 0 && (
              <p className="px-4 py-3 text-slate-400 text-sm">Nessun dato timesheet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
