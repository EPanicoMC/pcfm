import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, Project } from '../api/client'

function fmtEur(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function fmtN(n: number | null | undefined, dec = 0) {
  if (n == null) return '—'
  return n.toLocaleString('it-IT', { maximumFractionDigits: dec })
}

function NrBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-slate-400 text-xs">—</span>
  const capped = Math.min(Math.max(pct, 0), 100)
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-blue-500'
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${capped}%` }} />
      </div>
      <span className="text-xs w-12 text-right font-medium">{pct.toFixed(1)}%</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-400">—</span>
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

type GroupMode = 'flat' | 'client'

export default function Projects() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [groupMode, setGroupMode] = useState<GroupMode>('client')

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects(),
  })

  const filtered = useMemo(() => data.filter((p: Project) => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      p.project_id.toLowerCase().includes(q) ||
      (p.project_title ?? '').toLowerCase().includes(q) ||
      (p.client_name ?? '').toLowerCase().includes(q) ||
      (p.engagement_manager ?? '').toLowerCase().includes(q)
    const matchStatus = !statusFilter || p.project_status === statusFilter
    return matchSearch && matchStatus
  }), [data, search, statusFilter])

  const statuses = useMemo(
    () => [...new Set((data as Project[]).map((p) => p.project_status).filter(Boolean))] as string[],
    [data]
  )

  // Raggruppa per cliente
  const byClient = useMemo(() => {
    if (groupMode !== 'client') return null
    const map = new Map<string, { projects: Project[]; ts_nr: number; iow_nr: number; residuo: number }>()
    for (const p of filtered) {
      const key = p.client_name ?? '—'
      if (!map.has(key)) map.set(key, { projects: [], ts_nr: 0, iow_nr: 0, residuo: 0 })
      const g = map.get(key)!
      g.projects.push(p)
      g.ts_nr += p.ts_net_revenue ?? 0
      g.iow_nr += p.iow_net_revenue ?? 0
      g.residuo += p.residuo_eur ?? 0
    }
    return [...map.entries()].sort((a, b) => b[1].ts_nr - a[1].ts_nr)
  }, [filtered, groupMode])

  if (isLoading) return <div className="p-8 text-slate-500">Caricamento...</div>
  if (error) return <div className="p-8 text-red-600">Errore: {(error as Error).message}</div>

  // Totali globali
  const totalNR = filtered.reduce((s, p) => s + (p.ts_net_revenue ?? 0), 0)
  const totalIowNR = filtered.reduce((s, p) => s + (p.iow_net_revenue ?? 0), 0)
  const totalResiduo = filtered.reduce((s, p) => s + (p.residuo_eur ?? 0), 0)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Progetti ({filtered.length})</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setGroupMode('client')}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${groupMode === 'client' ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
          >
            Per cliente
          </button>
          <button
            onClick={() => setGroupMode('flat')}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${groupMode === 'flat' ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
          >
            Lista piatta
          </button>
        </div>
      </div>

      {/* Filtri */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Cerca codice, titolo, cliente, manager..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">Tutti gli status</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Totali */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wide">NR Actual totale</p>
          <p className="text-lg font-bold text-slate-800 mt-0.5">{fmtEur(totalNR)}</p>
          <p className="text-xs text-slate-400">Budget: {fmtEur(totalIowNR)}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wide">% Consumo NR</p>
          <p className="text-lg font-bold text-slate-800 mt-0.5">
            {totalIowNR ? `${(totalNR / totalIowNR * 100).toFixed(1)}%` : '—'}
          </p>
        </div>
        <div className={`bg-white rounded-lg border border-slate-200 p-3 shadow-sm text-center`}>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Residuo NR totale</p>
          <p className={`text-lg font-bold mt-0.5 ${totalResiduo < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {fmtEur(totalResiduo)}
          </p>
        </div>
      </div>

      {/* Vista per cliente */}
      {groupMode === 'client' && byClient && (
        <div className="space-y-4">
          {byClient.map(([clientName, group]) => {
            const pctNR = group.iow_nr ? group.ts_nr / group.iow_nr * 100 : null
            return (
              <div key={clientName} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                {/* Header cliente */}
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-800">{clientName}</span>
                    <span className="text-xs text-slate-400">{group.projects.length} codici</span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <p className="text-xs text-slate-400">NR Actual</p>
                      <p className="font-semibold text-slate-800">{fmtEur(group.ts_nr)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Budget IOW</p>
                      <p className="text-slate-600">{fmtEur(group.iow_nr)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Residuo NR</p>
                      <p className={`font-semibold ${group.residuo < 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {fmtEur(group.residuo)}
                      </p>
                    </div>
                    <div className="w-32">
                      <NrBar pct={pctNR} />
                    </div>
                  </div>
                </div>

                {/* Tabella progetti del cliente */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400 border-b border-slate-100">
                      <th className="text-left px-4 py-2 font-medium">Codice</th>
                      <th className="text-left px-4 py-2 font-medium">Status</th>
                      <th className="text-left px-4 py-2 font-medium w-36">% Consumo NR</th>
                      <th className="text-right px-4 py-2 font-medium">NR Actual</th>
                      <th className="text-right px-4 py-2 font-medium">Residuo NR</th>
                      <th className="text-right px-4 py-2 font-medium">Budget IOW</th>
                      <th className="text-right px-4 py-2 font-medium">Ore</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {group.projects.map((p) => {
                      const pctNrP = p.iow_net_revenue ? (p.ts_net_revenue / p.iow_net_revenue * 100) : null
                      return (
                        <tr key={p.project_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2.5">
                            <Link
                              to={`/projects/${encodeURIComponent(p.project_id)}`}
                              className="text-blue-600 hover:underline font-medium"
                            >
                              {p.project_id}
                            </Link>
                            <p className="text-xs text-slate-400 truncate max-w-xs">{p.project_title}</p>
                          </td>
                          <td className="px-4 py-2.5"><StatusBadge status={p.project_status} /></td>
                          <td className="px-4 py-2.5"><NrBar pct={pctNrP} /></td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{fmtEur(p.ts_net_revenue)}</td>
                          <td className={`px-4 py-2.5 text-right font-medium ${(p.residuo_eur ?? 0) < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                            {fmtEur(p.residuo_eur)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{fmtEur(p.iow_net_revenue)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{fmtN(p.ts_hours, 1)} h</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {/* Vista piatta */}
      {groupMode === 'flat' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Codice</th>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 w-36">% Consumo NR</th>
                <th className="text-right px-4 py-3">NR Actual</th>
                <th className="text-right px-4 py-3">Residuo NR</th>
                <th className="text-right px-4 py-3">Budget IOW</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nessun progetto.</td></tr>
              )}
              {filtered.map((p: Project) => {
                const pctNrP = p.iow_net_revenue ? (p.ts_net_revenue / p.iow_net_revenue * 100) : null
                return (
                  <tr key={p.project_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/projects/${encodeURIComponent(p.project_id)}`} className="text-blue-600 hover:underline font-medium">
                        {p.project_id}
                      </Link>
                      <p className="text-xs text-slate-400 truncate max-w-xs">{p.project_title}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.client_name ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.project_status} /></td>
                    <td className="px-4 py-3"><NrBar pct={pctNrP} /></td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmtEur(p.ts_net_revenue)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${(p.residuo_eur ?? 0) < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                      {fmtEur(p.residuo_eur)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">{fmtEur(p.iow_net_revenue)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
