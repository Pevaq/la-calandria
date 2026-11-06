import { useState, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { homeFor, useAuth } from '../lib/auth'
import { useCart } from '../lib/cart'
import { Logo, Spinner } from './ui'

/* ------------------------------------------------------------------ */
/* Público (clientes)                                                   */
/* ------------------------------------------------------------------ */
export function PublicLayout() {
  const { profile, signOut, isStaff } = useAuth()
  const { count } = useCart()
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-cream-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-2">
            <NavLink to="/" end className={({ isActive }) => `rounded-md px-2 py-1.5 ${isActive ? 'text-brand-800 font-medium' : 'text-stone-600 hover:text-stone-900'}`}>
              Catálogo
            </NavLink>
            {profile && (
              <NavLink to="/mis-pedidos" className={({ isActive }) => `hidden rounded-md px-2 py-1.5 sm:block ${isActive ? 'text-brand-800 font-medium' : 'text-stone-600 hover:text-stone-900'}`}>
                Mis pedidos
              </NavLink>
            )}
            {isStaff && (
              <Link to={homeFor(profile)} className="rounded-md px-2 py-1.5 text-stone-600 hover:text-stone-900">
                Panel
              </Link>
            )}
            <Link to="/pedido" className="relative rounded-lg bg-brand-700 px-3 py-1.5 font-medium text-white hover:bg-brand-800">
              Pedido
              {count > 0 && (
                <span className="ml-1.5 rounded-full bg-cream-100 px-1.5 text-xs text-brand-800">{count}</span>
              )}
            </Link>
            {profile ? (
              <button onClick={signOut} className="rounded-md px-2 py-1.5 text-stone-500 hover:text-stone-900">
                Salir
              </button>
            ) : (
              <Link to="/ingresar" className="rounded-md px-2 py-1.5 text-stone-600 hover:text-stone-900">
                Ingresar
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
        <Outlet />
      </main>
      <footer className="border-t border-stone-200 bg-brand-900 py-8 text-sm text-cream-100/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4">
          <Logo light />
          <span>Venta mayorista · Pergamino y Rosario</span>
        </div>
      </footer>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Guardas de acceso                                                    */
/* ------------------------------------------------------------------ */
export function RequireRole({ roles, children }: { roles: ('admin' | 'worker' | 'client')[]; children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const loc = useLocation()
  if (loading || (session && !profile)) return <div className="mx-auto max-w-6xl px-4"><Spinner /></div>
  if (!session || !profile) return <Navigate to="/ingresar" state={{ from: loc.pathname }} replace />
  if (!profile.active || !roles.includes(profile.role)) return <Navigate to={homeFor(profile)} replace />
  return <>{children}</>
}

/* ------------------------------------------------------------------ */
/* Back office                                                          */
/* ------------------------------------------------------------------ */
const ADMIN_NAV = [
  { to: '/admin', label: 'Pedidos', end: true },
  { to: '/admin/planificacion', label: 'Planificación' },
  { to: '/admin/productos', label: 'Productos' },
  { to: '/admin/partes', label: 'Partes y stock' },
  { to: '/admin/equipo', label: 'Equipo y clientes' },
  { to: '/admin/configuracion', label: 'Configuración' },
]

export function AdminLayout() {
  return (
    <StaffShell nav={[...ADMIN_NAV, { to: '/trabajo', label: 'Mis tareas' }]}>
      <Outlet />
    </StaffShell>
  )
}

export function WorkerLayout() {
  const { isAdmin } = useAuth()
  const nav = isAdmin ? [...ADMIN_NAV, { to: '/trabajo', label: 'Mis tareas' }] : [{ to: '/trabajo', label: 'Mis tareas' }]
  return (
    <StaffShell nav={nav}>
      <Outlet />
    </StaffShell>
  )
}

function StaffShell({ nav, children }: { nav: { to: string; label: string; end?: boolean }[]; children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const link = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-brand-700 text-white' : 'text-cream-100/80 hover:bg-brand-800 hover:text-white'}`
  return (
    <div className="min-h-screen lg:flex">
      {/* barra superior móvil */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-brand-900 px-4 py-3 lg:hidden">
        <Logo light />
        <button onClick={() => setOpen(!open)} className="rounded-md px-2 py-1 text-cream-100" aria-label="Menú">
          {open ? '✕' : '☰'}
        </button>
      </div>
      <aside className={`${open ? 'block' : 'hidden'} bg-brand-900 px-3 pb-4 lg:block lg:w-60 lg:shrink-0`}>
        <div className="lg:sticky lg:top-0 lg:py-5">
        <div className="mb-6 hidden px-2 lg:block">
          <Logo light />
        </div>
        <nav className="space-y-1" onClick={() => setOpen(false)}>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={link}>
              {n.label}
            </NavLink>
          ))}
          <NavLink to="/" className={link}>
            Ver tienda
          </NavLink>
        </nav>
        <div className="mt-6 border-t border-brand-700 px-3 pt-4 text-xs text-cream-100/60">
          <div className="truncate text-cream-100">{profile?.full_name || profile?.email}</div>
          <div className="mb-2 capitalize">{profile?.role === 'admin' ? 'Administrador' : 'Trabajador'}</div>
          <button onClick={signOut} className="text-cream-100/80 underline hover:text-white">
            Cerrar sesión
          </button>
        </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  )
}
