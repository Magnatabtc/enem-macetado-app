import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { BarChart3, Layers, UserRound } from 'lucide-react'
import { BrandLink } from './Brand'

const NAV_ITEMS = [
  { to: '/feed', label: 'Feed', icon: Layers },
  { to: '/progresso', label: 'Progresso', icon: BarChart3 },
  { to: '/perfil', label: 'Perfil', icon: UserRound },
] as const

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="stage-bg relative min-h-[100dvh] overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-70" aria-hidden="true" />

      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <BrandLink />
          <nav
            aria-label="Navegação principal"
            className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1"
          >
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
                    isActive
                      ? 'bg-lime text-ink shadow-[0_0_20px_rgba(200,255,77,.2)]'
                      : 'text-white/55 hover:bg-white/[0.06] hover:text-white'
                  }`
                }
                aria-label={label}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-3xl px-4 pb-24 pt-7 sm:px-6 sm:pt-10">
        {children}
      </main>

      <footer className="relative border-t border-white/[0.06] px-4 py-8 text-center">
        <p className="text-xs text-white/35">
          Enem Macetado · um card por vez, um ponto a mais na média.
        </p>
      </footer>
    </div>
  )
}
