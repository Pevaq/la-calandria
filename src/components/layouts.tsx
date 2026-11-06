import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { homeFor, useAuth } from '../lib/auth'
import { useCart } from '../lib/cart'
import { supabase } from '../lib/supabase'
import { personName } from '../lib/data'
import { BottomNav, Icon, Logo, Modal, Spinner } from './ui'

/* ------------------------------------------------------------------ */
/* Público (clientes)                                                   */
/* ------------------------------------------------------------------ */
export function PublicLayout() {
  const { profile, signOut, isStaff } = useAuth()
  const { count } = useCart()
  const nav = useNavigate()
  const [account, setAccount] = useState(false)
  const loc = useLocation()
  useEffect(() => setAccount(false), [loc.pathname])

  const top = ({ isActive }: { isActive: boolean }) => `rounded-md px-2 py-1.5 ${isActive ? 'text-brand-800 font-medium' : 'text-stone-600 hover:text-stone-900'}`
  return (
    <div className="pb-nav flex min-h-screen flex-col lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-cream-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/"><Logo /></Link>
          {/* escritorio */}
          <nav className="hidden items-center gap-2 text-sm lg:flex">
            <NavLink to="/" end className={top}>Catálogo</NavLink>
            {profile && <NavLink to="/mis-pedidos" className={top}>Mis pedidos</NavLink>}
            {isStaff && <Link to={homeFor(profile)} className="rounded-md px-2 py-1.5 text-stone-600 hover:text-stone-900">Panel</Link>}
            <Link to="/pedido" className="rounded-lg bg-brand-700 px-3 py-1.5 font-medium text-white hover:bg-brand-800">
              Pedido{count > 0 && <span className="ml-1.5 rounded-full bg-cream-100 px-1.5 text-xs text-brand-800">{count}</span>}
            </Link>
            {profile ? (
              <button onClick={signOut} className="rounded-md px-2 py-1.5 text-stone-500 hover:text-stone-900">Salir</button>
            ) : (
              <Link to="/ingresar" className="rounded-md px-2 py-1.5 text-stone-600 hover:text-stone-900">Ingresar</Link>
            )}
          </nav>
          {/* celular: acceso rápido al panel para el personal */}
          {isStaff && (
            <Link to={homeFor(profile)} className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-medium text-white lg:hidden">Panel</Link>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
        <Outlet />
      </main>
      <footer className="hidden border-t border-stone-200 bg-brand-900 py-8 text-sm text-cream-100/80 lg:block">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4">
          <Logo light />
          <span>Venta mayorista · Pergamino y Rosario</span>
        </div>
      </footer>

      <BottomNav
        items={[
          { to: '/', end: true, label: 'Catálogo', icon: 'store' },
          { to: '/pedido', end: true, label: 'Pedido', icon: 'cart', badge: count },
          ...(profile ? [{ to: '/mis-pedidos', label: 'Mis pedidos', icon: 'orders' }] : []),
          profile
            ? { onClick: () => setAccount(true), label: 'Cuenta', icon: 'user', active: account }
            : { to: '/ingresar', label: 'Ingresar', icon: 'user' },
        ]}
      />
      <Modal open={account} onClose={() => setAccount(false)} title="Mi cuenta">
        <div className="space-y-4">
          <div>
            <div className="font-medium">{profile?.company || personName(profile)}</div>
            <div className="text-sm text-stone-500">{profile?.email}</div>
          </div>
          <button
            onClick={async () => { await signOut(); setAccount(false); nav('/') }}
            className="flex w-full items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-left text-red-700"
          >
            <Icon name="logout" /> Cerrar sesión
          </button>
        </div>
      </Modal>
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
/* Back office y trabajadores                                           */
/* ------------------------------------------------------------------ */
const ADMIN_MAIN = [
  { to: '/admin', label: 'Pedidos', icon: 'orders', end: true },
  { to: '/admin/planificacion', label: 'Planificación', short: 'Plan', icon: 'calendar' },
  { to: '/admin/productos', label: 'Productos', icon: 'box' },
  { to: '/trabajo', label: 'Mis tareas', short: 'Tareas', icon: 'check' },
]
const ADMIN_MORE = [
  { to: '/admin/partes', label: 'Partes y stock', icon: 'parts' },
  { to: '/admin/equipo', label: 'Equipo y clientes', icon: 'team' },
  { to: '/admin/configuracion', label: 'Configuración', icon: 'settings' },
  { to: '/', label: 'Ver tienda', icon: 'store' },
]

export function AdminLayout() {
  return <StaffShell><Outlet /></StaffShell>
}

export function WorkerLayout() {
  return <StaffShell><Outlet /></StaffShell>
}

function StaffShell({ children }: { children: ReactNode }) {
  const { profile, signOut, isAdmin } = useAuth()
  const loc = useLocation()
  const [more, setMore] = useState(false)
  const [newOrders, setNewOrders] = useState(0)

  useEffect(() => setMore(false), [loc.pathname])
  useEffect(() => {
    if (!isAdmin) return
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'recibido').then(({ count }) => setNewOrders(count ?? 0))
  }, [isAdmin, loc.pathname])

  const side = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-brand-700 text-white' : 'text-cream-100/80 hover:bg-brand-800 hover:text-white'}`
  const moreActive = ADMIN_MORE.some((m) => m.to !== '/' && loc.pathname.startsWith(m.to))

  return (
    <div className="min-h-screen lg:flex">
      {/* celular: barra superior */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-brand-900 px-4 py-3 lg:hidden">
        <Logo light />
        {!isAdmin && (
          <button onClick={signOut} className="flex items-center gap-1.5 text-sm text-cream-100/80">
            <Icon name="logout" className="h-4 w-4" /> Salir
          </button>
        )}
      </div>

      {/* escritorio: barra lateral */}
      <aside className="hidden bg-brand-900 px-3 lg:block lg:w-60 lg:shrink-0">
        <div className="lg:sticky lg:top-0 lg:py-5">
          <div className="mb-6 px-2"><Logo light /></div>
          <nav className="space-y-1">
            {(isAdmin ? [...ADMIN_MAIN, ...ADMIN_MORE] : [{ to: '/trabajo', label: 'Mis tareas', icon: 'check' }]).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/admin' || n.to === '/'} className={side}>
                <Icon name={n.icon} className="h-4 w-4" /> {n.label}
                {n.to === '/admin' && newOrders > 0 && <span className="ml-auto rounded-full bg-leather-500 px-1.5 text-xs text-white">{newOrders}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="mt-6 border-t border-brand-700 px-3 pt-4 text-xs text-cream-100/60">
            <div className="truncate text-cream-100">{personName(profile)}</div>
            <div className="mb-2">{isAdmin ? 'Administrador' : 'Trabajador'}</div>
            <button onClick={signOut} className="text-cream-100/80 underline hover:text-white">Cerrar sesión</button>
          </div>
        </div>
      </aside>

      <main className={`min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-10 lg:py-8 ${isAdmin ? 'pb-nav' : ''}`}>{children}</main>

      {isAdmin && (
        <>
          <BottomNav
            items={[
              ...ADMIN_MAIN.map((n) => ({ to: n.to, end: n.to === '/admin', label: n.short ?? n.label, icon: n.icon, badge: n.to === '/admin' ? newOrders : 0 })),
              { onClick: () => setMore(true), label: 'Más', icon: 'more', active: moreActive || more },
            ]}
          />
          <Modal open={more} onClose={() => setMore(false)} title="Más">
            <div className="grid grid-cols-2 gap-3">
              {ADMIN_MORE.map((m) => (
                <Link key={m.to} to={m.to} className="flex flex-col items-start gap-2 rounded-xl border border-stone-200 p-4 text-sm font-medium hover:bg-stone-50">
                  <Icon name={m.icon} className="h-6 w-6 text-brand-700" />
                  {m.label}
                </Link>
              ))}
              <button onClick={signOut} className="col-span-2 flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-left text-sm text-red-700">
                <Icon name="logout" /> Cerrar sesión · {personName(profile)}
              </button>
            </div>
          </Modal>
        </>
      )}
    </div>
  )
}
