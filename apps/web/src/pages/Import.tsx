import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ImportRecord } from '../api/client'

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('it-IT')
}

export default function Import() {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { data: history = [] } = useQuery({
    queryKey: ['import-history'],
    queryFn: () => api.importHistory(),
  })

  async function handleImport() {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.confirmImport(file)
      setResult(res)
      qc.invalidateQueries()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Import file</h1>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <p className="text-3xl mb-3">↑</p>
        <p className="text-slate-600 font-medium">
          {file ? file.name : 'Clicca o trascina qui il file xlsx'}
        </p>
        <p className="text-slate-400 text-sm mt-1">
          File 9 (anagrafica progetti) o File 8 (timesheet settimanali) — auto-rilevamento automatico
        </p>
        {file && (
          <p className="text-xs text-slate-400 mt-2">
            {(file.size / 1024).toFixed(0)} KB
          </p>
        )}
      </div>

      {/* Istruzioni */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 space-y-1">
        <p className="font-medium">Come usare l'import:</p>
        <ul className="list-disc list-inside text-blue-700 space-y-0.5">
          <li><strong>File 9 (anagrafica)</strong>: qualsiasi nome, contiene "Project ID" e "Net Revenue (IOW)"</li>
          <li><strong>File 8 (timesheet)</strong>: il nome del file deve essere il codice progetto (es. <code>ITE00065885.1.1.xlsx</code>)</li>
        </ul>
      </div>

      <button
        onClick={handleImport}
        disabled={!file || loading}
        className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors"
      >
        {loading ? 'Importazione...' : 'Conferma import'}
      </button>

      {/* Risultato */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
          <p className="font-semibold mb-2">Import completato — status: {String(result.status)}</p>
          <div className="grid grid-cols-4 gap-4">
            <div><p className="text-xs text-green-600">Inseriti</p><p className="text-lg font-bold">{String(result.inserted ?? '—')}</p></div>
            <div><p className="text-xs text-green-600">Aggiornati</p><p className="text-lg font-bold">{String(result.updated ?? '—')}</p></div>
            <div><p className="text-xs text-green-600">Invariati</p><p className="text-lg font-bold">{String(result.skipped ?? '—')}</p></div>
            <div><p className="text-xs text-green-600">Errori</p><p className="text-lg font-bold">{String(result.errors ?? '—')}</p></div>
          </div>
          {result.project_id != null && <p className="text-xs text-green-600 mt-2">Progetto: {String(result.project_id)}</p>}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          <p className="font-semibold">Errore</p>
          <p className="mt-1 break-all">{error}</p>
        </div>
      )}

      {/* Storico */}
      <div>
        <h2 className="text-base font-semibold text-slate-700 mb-3">Storico import</h2>
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <th className="text-left px-4 py-3">File</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-left px-4 py-3">Data</th>
                <th className="text-right px-4 py-3">Inseriti</th>
                <th className="text-right px-4 py-3">Aggiornati</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Nessun import eseguito.</td></tr>
              )}
              {history.map((h: ImportRecord) => (
                <tr key={h.import_id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <p className="text-slate-700 truncate max-w-xs">{h.original_filename}</p>
                    {h.project_id_extracted && (
                      <p className="text-xs text-slate-400">{h.project_id_extracted}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{h.file_type}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{new Date(h.import_ts).toLocaleString('it-IT')}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{fmt(h.rows_inserted)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{fmt(h.rows_updated)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      h.status === 'success' ? 'bg-green-100 text-green-700' :
                      h.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>{h.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
