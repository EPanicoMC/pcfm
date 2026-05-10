interface Props {
  label: string
  value: string | number | null
  sub?: string
  accent?: 'default' | 'red' | 'green' | 'amber'
}

const accents = {
  default: 'border-blue-500',
  red: 'border-red-500',
  green: 'border-green-500',
  amber: 'border-amber-500',
}

export default function KpiCard({ label, value, sub, accent = 'default' }: Props) {
  return (
    <div className={`bg-white rounded-lg border border-slate-200 border-l-4 ${accents[accent]} p-4 shadow-sm`}>
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1">{value ?? '—'}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
