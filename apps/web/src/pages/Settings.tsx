import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Assumption } from '../api/client'

export default function Settings() {
  const qc = useQueryClient()
  const { data = [], isLoading } = useQuery({ queryKey: ['assumptions'], queryFn: api.assumptions })
  const [editing, setEditing] = useState<Record<string, string>>({})

  const mut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: number }) => api.updateAssumption(key, value),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assumptions'] }); setEditing({}) },
  })

  if (isLoading) return <div className="p-8 text-slate-500">Caricamento...</div>

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Assunzioni</h1>
      <p className="text-slate-500 text-sm">Parametri usati nelle formule di forecast. Modifica solo i valori numerici.</p>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm divide-y divide-slate-100">
        {data.map((a: Assumption) => (
          <div key={a.key} className="flex items-center gap-4 px-5 py-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800">{a.key}</p>
              {a.description && <p className="text-xs text-slate-400 mt-0.5">{a.description}</p>}
            </div>
            {a.value_num != null ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={editing[a.key] ?? String(a.value_num)}
                  onChange={(e) => setEditing((prev) => ({ ...prev, [a.key]: e.target.value }))}
                  className="w-24 border border-slate-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {editing[a.key] !== undefined && editing[a.key] !== String(a.value_num) && (
                  <button
                    onClick={() => mut.mutate({ key: a.key, value: parseFloat(editing[a.key]) })}
                    disabled={mut.isPending}
                    className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Salva
                  </button>
                )}
              </div>
            ) : (
              <span className="text-sm text-slate-500">{a.value_str}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
