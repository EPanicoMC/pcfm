import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { api, DashboardClient, DashboardFyBreakdown, DashboardBuBreakdown } from '../api/client'

// ── Formattatori ────────────────────────────────────────────────────────────

function fmtEur(n: number | null | undefined, compact = false) {
  if (n == null) return '—'
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`
    if (Math.abs(n) >= 1_000) return `€${(n / 1_000).toFixed(0)}k`
    return `€${n.toFixed(0)}`
  }
  return new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)
}

function fmtN(n: number | null | undefined, dec = 0) {
  if (n == null) return '—'
  return n.toLocaleString('it-IT', { maximumFractionDigits: dec })
}

// ── Tooltip custom per Recharts ──────────────────────────────────────────────

function FyTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-700 mb-1">FY{String(label).slice(2)}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {fmtEur(p.value, true)}
        </p>
      ))}
    </div>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiBox({
  label, value, sub, accent = 'default',
}: {
  label: string
  value: string | number | null
  sub?: string
  accent?: 'default' | 'red' | 'green' | 'amber'
}) {
  const border = { default: 'border-blue-500', red: 'border-red-500', green: 'border-green-500', amber: 'border-amber-500' }[accent]
  return (
    <div className={`bg-white rounded-lg border border-slate-200 border-l-4 ${border} p-4 shadow-sm`}>
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1">{value ?? '—'}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Progress bar inline ───────────────────────────────────────────────────────

function MiniBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-slate-400 text-xs">—</span>
  const capped = Math.min(Math.max(pct, 0), 100)
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-blue-500'
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${capped}%` }} />
      </div>
      <span className="text-xs w-10 text-right font-medium text-slate-600">{pct.toFixed(1)}%</span>
    </div>
  )
}

// ── Client card ───────────────────────────────────────────────────────────────

function ClientCard({
  client, selected, onSelect,
}: {
  client: DashboardClient
  selected: boolean
  onSelect: () => void
}) {
  const hasRisk = client.at_risk_count > 0
  return (
    <button
      onClick={onSelect}
      className={`flex-shrink-0 w-52 rounded-xl border-2 p-3 text-left transition-all cursor-pointer shadow-sm hover:shadow-md ${
        selected
          ? 'border-blue-500 bg-blue-50'
          : 'border-slate-200 bg-white hover:border-blue-300'
      }`}
    >
      <div className="flex items-start justify-between gap-1 mb-2">
        <p className="text-sm font-semibold text-slate-800 leading-tight line-clamp-2">{client.client_name}</p>
        {hasRisk && (
          <span className="flex-shrink-0 text-xs bg-red-100 text-red-600 font-semibold rounded-full px-1.5 py-0.5">
            ⚠ {client.at_risk_count}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-2">
        {client.open_count} aperti · {client.closed_count} in chiusura
      </p>
      <p className="text-base font-bold text-slate-700">{fmtEur(client.ts_net_revenue, true)}</p>
      <p className="text-xs text-slate-400">Budget: {fmtEur(client.iow_net_revenue, true)}</p>
      <div className="mt-2">
        <MiniBar pct={client.pct_consumo} />
      </div>
    </button>
  )
}

// ── FY Chart (grouped bars: IOW budget vs NR actual) ─────────────────────────

function FyChart({ data }: { data: DashboardFyBreakdown[] }) {
  const chartData = data
    .filter((d) => d.fy > 0)
    .map((d) => ({
      fy: d.fy,
      label: `FY${String(d.fy).slice(2)}`,
      budget: d.iow_net_revenue,
      actual: d.ts_net_revenue,
    }))

  if (!chartData.length) {
    return <p className="text-slate-400 text-sm text-center py-8">Nessun dato per FY.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <YAxis
          tickFormatter={(v) => fmtEur(v, true)}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip content={<FyTooltip />} />
        <Bar dataKey="budget" name="Budget IOW" fill="#cbd5e1" radius={[3, 3, 0, 0]} maxBarSize={48} />
        <Bar dataKey="actual" name="NR Actual" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={48}>
          {chartData.map((entry) => {
            const pct = entry.budget > 0 ? entry.actual / entry.budget : 0
            const color = pct > 0.9 ? '#ef4444' : pct > 0.7 ? '#f59e0b' : '#3b82f6'
            return <Cell key={entry.fy} fill={color} />
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── BU breakdown (horizontal bars) ───────────────────────────────────────────

function BuBreakdown({ data }: { data: DashboardBuBreakdown[] }) {
  if (!data.length) return <p className="text-slate-400 text-sm">Nessun dato BU.</p>
  return (
    <div className="space-y-2.5">
      {data.map((bu) => (
        <div key={bu.bu}>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="font-medium text-slate-700 truncate max-w-[160px]">{bu.bu}</span>
            <span className="text-slate-400 flex-shrink-0 ml-2">
              {fmtEur(bu.ts_net_revenue, true)} · {bu.pct_of_total.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all"
              style={{ width: `${Math.min(bu.pct_of_total, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── FY badge pills (conteggi codici per FY chiusura) ─────────────────────────

function FyBadges({ data }: { data: DashboardFyBreakdown[] }) {
  const relevant = data.filter((d) => d.fy > 0)
  if (!relevant.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {relevant.map((d) => (
        <div key={d.fy} className="flex items-center gap-1 text-xs bg-slate-100 rounded-full px-3 py-1">
          <span className="font-semibold text-slate-700">FY{String(d.fy).slice(2)}</span>
          <span className="text-green-600">{d.open_count} ap.</span>
          <span className="text-slate-400">/</span>
          <span className="text-slate-500">{d.closed_count} ch.</span>
        </div>
      ))}
    </div>
  )
}

// ── Componente principale ─────────────────────────────────────────────────────

export default function Dashboard() {
  const [selectedClient, setSelectedClient] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.dashboard(),
  })

  const activeClient = useMemo(
    () => data?.clients.find((c) => c.client_name === selectedClient) ?? null,
    [data, selectedClient]
  )

  const activeTotals = useMemo(() => {
    if (!data) return null
    if (!activeClient) return data.totals
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
      iow_hours_total: null as number | null,
    }
  }, [data, activeClient])

  const activeByFy = useMemo((): DashboardFyBreakdown[] => {
    if (!data) return []
    if (!activeClient) return data.by_fy
    // Per cliente: merge by_fy del client (solo ts) con by_fy globale per i conteggi di quel client
    return activeClient.by_fy.map((f) => ({
      fy: f.fy,
      project_count: f.project_count,
      open_count: 0,
      closed_count: 0,
      iow_net_revenue: 0,
      ts_net_revenue: f.ts_net_revenue,
      ts_hours: f.ts_hours,
    }))
  }, [data, activeClient])

  const activeByBu = useMemo((): DashboardBuBreakdown[] => {
    if (!data) return []
    return activeClient ? activeClient.by_bu : data.by_bu
  }, [data, activeClient])

  const activeAtRisk = useMemo(() => {
    if (!data) return []
    if (!activeClient) return data.at_risk_projects
    return data.at_risk_projects.filter((p) => p.client_name === activeClient.client_name)
  }, [data, activeClient])

  if (isLoading) return <div className="p-8 text-slate-500">Caricamento...</div>
  if (error) return <div className="p-8 text-red-600">Errore: {(error as Error).message}</div>
  if (!data || !activeTotals) return null

  const residuoAccent = (activeTotals.residuo_eur_totale ?? 0) < 0 ? 'red' : 'green'

  return (
    <div className="p-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard Portfolio</h1>
        <span className="text-slate-500 text-sm">FY{String(data.fy).slice(2)}</span>
        {selectedClient && (
          <>
            <span className="text-slate-300">›</span>
            <span className="text-blue-600 font-medium">{selectedClient}</span>
            <button
              onClick={() => setSelectedClient(null)}
              className="text-xs text-slate-400 hover:text-slate-600 underline ml-1"
            >
              (tutti)
            </button>
          </>
        )}
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiBox
          label="Codici"
          value={`${activeTotals.project_count} tot`}
          sub={`${activeTotals.open_count} aperti · ${activeTotals.closed_count} in chiusura`}
        />
        <KpiBox
          label="NR Actual"
          value={fmtEur(activeTotals.ts_net_revenue_total)}
          sub={`Budget: ${fmtEur(activeTotals.iow_net_revenue_total)}`}
        />
        <KpiBox
          label="% Consumo NR"
          value={activeTotals.pct_consumo_globale != null ? `${activeTotals.pct_consumo_globale}%` : '—'}
          accent={
            (activeTotals.pct_consumo_globale ?? 0) > 90
              ? 'red'
              : (activeTotals.pct_consumo_globale ?? 0) > 70
              ? 'amber'
              : 'default'
          }
          sub={activeTotals.ts_hours_total ? `${fmtN(activeTotals.ts_hours_total, 0)} ore lavorate` : undefined}
        />
        <KpiBox
          label="Residuo NR"
          value={fmtEur(activeTotals.residuo_eur_totale)}
          accent={residuoAccent}
          sub={
            activeTotals.residuo_ore_totale != null
              ? `${fmtN(activeTotals.residuo_ore_totale, 0)} ore residue`
              : undefined
          }
        />
      </div>

      {/* ── Selector clienti ── */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Clienti</span>
          <FyBadges data={data.by_fy} />
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {/* Card "Tutti" */}
          <button
            onClick={() => setSelectedClient(null)}
            className={`flex-shrink-0 w-36 rounded-xl border-2 p-3 text-left transition-all cursor-pointer shadow-sm hover:shadow-md ${
              !selectedClient
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-200 bg-white hover:border-blue-300'
            }`}
          >
            <p className="text-sm font-semibold text-slate-800 mb-1">Tutti i clienti</p>
            <p className="text-base font-bold text-slate-700">{fmtEur(data.totals.ts_net_revenue_total, true)}</p>
            <p className="text-xs text-slate-400">{data.clients.length} clienti</p>
            <p className="text-xs text-slate-400 mt-1">
              {data.totals.open_count} ap. · {data.totals.closed_count} ch.
            </p>
          </button>

          {data.clients.map((c) => (
            <ClientCard
              key={c.client_name}
              client={c}
              selected={selectedClient === c.client_name}
              onSelect={() => setSelectedClient(c.client_name === selectedClient ? null : c.client_name)}
            />
          ))}
        </div>
      </section>

      {/* ── Main content: 3 colonne ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_300px] gap-4">

        {/* ── FY Chart ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Produzione NR per FY
            {selectedClient && <span className="text-blue-500 ml-1">· {selectedClient}</span>}
          </h2>
          <FyChart data={activeByFy} />

          {/* Tabella FY sotto il chart */}
          {activeByFy.filter((d) => d.fy > 0).length > 0 && (
            <table className="w-full text-xs mt-3 border-t border-slate-100 pt-2">
              <thead>
                <tr className="text-slate-400 text-left">
                  <th className="py-1 font-medium">FY</th>
                  {!selectedClient && <th className="py-1 font-medium text-right">Codici</th>}
                  {!selectedClient && <th className="py-1 font-medium text-right">Budget IOW</th>}
                  <th className="py-1 font-medium text-right">NR Actual</th>
                  <th className="py-1 font-medium text-right">Ore</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {activeByFy.filter((d) => d.fy > 0).map((d) => (
                  <tr key={d.fy}>
                    <td className="py-1 font-semibold text-slate-700">FY{String(d.fy).slice(2)}</td>
                    {!selectedClient && (
                      <td className="py-1 text-right text-slate-500">
                        {d.project_count}
                        <span className="text-green-600 ml-1">({d.open_count}↑{d.closed_count}↓)</span>
                      </td>
                    )}
                    {!selectedClient && (
                      <td className="py-1 text-right text-slate-500">{fmtEur(d.iow_net_revenue, true)}</td>
                    )}
                    <td className="py-1 text-right font-medium text-slate-700">{fmtEur(d.ts_net_revenue, true)}</td>
                    <td className="py-1 text-right text-slate-400">{fmtN(d.ts_hours, 0)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── BU Breakdown ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Breakdown per BU
            {selectedClient && <span className="text-blue-500 ml-1">· {selectedClient}</span>}
          </h2>
          <BuBreakdown data={activeByBu} />

          {/* Dettaglio tabella BU */}
          {activeByBu.length > 0 && (
            <table className="w-full text-xs mt-4 border-t border-slate-100 pt-2">
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

        {/* ── Codici a rischio ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            A rischio ({activeAtRisk.length})
          </h2>

          {activeAtRisk.length === 0 ? (
            <p className="text-slate-400 text-sm">Nessun codice a rischio esaurimento ≤ 60gg.</p>
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
                    {!selectedClient && (
                      <p className="text-xs text-slate-400 truncate">{p.client_name}</p>
                    )}
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
              <div className="space-y-1 text-xs">
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
                <div className="mt-2">
                  <MiniBar pct={activeClient.pct_consumo} />
                </div>
              </div>

              {/* Link ai progetti del cliente */}
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
    </div>
  )
}
