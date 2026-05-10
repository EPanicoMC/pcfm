import { NavLink, Outlet } from 'react-router-dom'

const links = [
  { to: '/', label: 'Dashboard', icon: '▦' },
  { to: '/projects', label: 'Progetti', icon: '≡' },
  { to: '/import', label: 'Import', icon: '↑' },
  { to: '/settings', label: 'Assunzioni', icon: '⚙' },
]

export default function Layout() {
  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-52 flex-shrink-0 bg-slate-900 text-slate-300 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-700">
          <p className="text-white font-semibold text-sm">PCFM</p>
          <p className="text-slate-500 text-xs mt-0.5">Forecast Manager</p>
        </div>
        <nav className="flex-1 py-4">
          {links.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <span className="text-base">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-slate-700 text-xs text-slate-600">
          v0.1 · locale
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
