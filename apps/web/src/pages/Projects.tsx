import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, Project } from '../api/client'

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null) return '—'
  return n.toLocaleString('it-IT', { maximumFractionDigits: dec })
}

function fmtEur(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function PctBar({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400">—</span>
  const pct = Math.min(value, 100)
  const color = value > 90 ? 'bg-red-500' : value > 70 ? 'bg-amber-400' : 'bg-blue-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs w-10 text-right">{value.toFixed(1)}%</span>
    </div>
  )
}

export default function Projects() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects(),
  })

  const filtered = data.filter((p: Project) => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      p.project_id.toLowerCase().includes(q) ||
      (p.project_title ?? '').toLowerCase().includes(q) ||
      (p.client_name ?? '').toLowerCase().includes(q)
    const matchStatus = !statusFilter || p.project_status === statusFilter
    return matchSearch && matchStatus
  })

  const statuses = [...new Set(data.map((p: Project) => p.project_status).filter(Boolean))] as string[]

  if (isLoading) return <div className="p-8 text-slate-500">Caricamento...</div>
  if (error) return <div className="p-8 text-red-600">Errore: {(error as Error).message}</div>

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Progetti ({filtered.length})</h1>
      </div>

      {/* Filtri */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Cerca per codice, titolo, cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tutti gli status</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Tabella */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3">Codice</th>
              <th className="text-left px-4 py-3">Cliente</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3 w-40">% Consumo</th>
              <th className="text-right px-4 py-3">Ore residue</th>
              <th className="text-right px-4 py-3">Residuo EUR</th>
              <th className="text-right px-4 py-3">NR Actual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Nessun progetto trovato.
                </td>
              </tr>
            )}
            {filtered.map((p: Project) => (
              <tr key={p.project_id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    to={`/projects/${encodeURIComponent(p.project_id)}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {p.project_id}
                  </Link>
                  <p className="text-xs text-slate-400 truncate max-w-xs">{p.project_title}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{p.client_name ?? '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.project_status} />
                </td>
                <td className="px-4 py-3">
                  <PctBar value={p.pct_consumo} />
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{fmt(p.residuo_ore, 0)}</td>
                <td className={`px-4 py-3 text-right font-medium ${(p.residuo_eur ?? 0) < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                  {fmtEur(p.residuo_eur)}
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{fmtEur(p.ts_net_revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-400">—</span>
  const colors: Record<string, string> = {
    'In Chiusura': 'bg-slate-100 text-slate-600',
    'Active': 'bg-green-100 text-green-700',
    'On Hold': 'bg-amber-100 text-amber-700',
  }
  const cls = colors[status] ?? 'bg-blue-100 text-blue-700'
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>
}
