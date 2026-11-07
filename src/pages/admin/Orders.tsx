import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fmtDate, fmtMoney, STATUS_LABEL, todayISO } from '../../lib/format'
import type { Order, OrderStatus, Profile, Task } from '../../lib/types'
import { Badge, Button, Empty, Icon, PageHeader, Spinner, StatusBadge } from '../../components/ui'
import { personName } from '../../lib/data'
import NewOrderModal from './modals/NewOrderModal'
import StockOrderModal from './modals/StockOrderModal'

type Filter = 'activos' | OrderStatus | 'stock' | 'todos'

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [clients, setClients] = useState<Record<string, Profile>>({})
  const [tasks, setTasks] = useState<Pick<Task, 'order_id' | 'quantity' | 'done_qty' | 'assignee_id'>[]>([])
  const [toReview, setToReview] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState<Filter>('activos')
  const [q, setQ] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [stockOpen, setStockOpen] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(1000)
      const os = (data as Order[]) ?? []
      const ids = [...new Set(os.map((o) => o.client_id))]
      const [cs, ts, ps] = await Promise.all([
        ids.length ? supabase.from('profiles').select('*').in('id', ids) : Promise.resolve({ data: [] }),
        supabase.from('tasks').select('order_id, quantity, done_qty, assignee_id'),
        supabase.from('payments').select('order_id').eq('status', 'informado'),
      ])
      setClients(Object.fromEntries(((cs.data as Profile[]) ?? []).map((c) => [c.id, c])))
      setTasks(ts.data ?? [])
      const rv: Record<string, number> = {}
      for (const p of ps.data ?? []) rv[p.order_id] = (rv[p.order_id] ?? 0) + 1
      setToReview(rv)
      setOrders(os)
    })()
  }, [reload])

  const clientOrders = useMemo(() => (orders ?? []).filter((o) => o.kind === 'cliente'), [orders])
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const o of clientOrders) c[o.status] = (c[o.status] ?? 0) + 1
    return c
  }, [clientOrders])

  const name = (o: Order) => (o.kind === 'stock' ? 'Producción para stock' : clients[o.client_id]?.company || personName(clients[o.client_id]))

  const search = normalize(q.trim().replace(/^#/, ''))
  const list = (orders ?? []).filter((o) => {
    if (search) {
      const c = clients[o.client_id]
      const hay = normalize([o.number, name(o), c?.full_name, c?.email, c?.city].filter(Boolean).join(' '))
      if (!hay.includes(search)) return false
      return filter === 'todos' || filter === 'activos' ? true : filter === 'stock' ? o.kind === 'stock' : o.status === filter
    }
    if (filter === 'stock') return o.kind === 'stock' && o.status !== 'entregado' && o.status !== 'cancelado'
    if (filter === 'todos') return true
    if (filter === 'activos') return !['entregado', 'cancelado'].includes(o.status)
    return o.kind === 'cliente' && o.status === filter
  })
  const today = todayISO()
  const unassigned = tasks.filter((t) => !t.assignee_id && t.done_qty < t.quantity).length
  const reviewCount = Object.keys(toReview).length
  const stockOpenCount = (orders ?? []).filter((o) => o.kind === 'stock' && !['entregado', 'cancelado'].includes(o.status)).length

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'activos', label: 'Activos' },
    { id: 'recibido', label: `Nuevos${counts.recibido ? ` (${counts.recibido})` : ''}` },
    { id: 'pago_confirmado', label: 'Pago confirmado' },
    { id: 'en_produccion', label: 'En producción' },
    { id: 'listo', label: 'Listos' },
    { id: 'stock', label: `Para stock${stockOpenCount ? ` (${stockOpenCount})` : ''}` },
    { id: 'entregado', label: 'Entregados' },
    { id: 'cancelado', label: 'Cancelados' },
    { id: 'todos', label: 'Todos' },
  ]

  const payLabel = (o: Order) =>
    o.kind === 'stock' ? null : o.payment_received ? (
      <span className="text-xs text-emerald-700">Pagado ✓</span>
    ) : Number(o.paid_amount) > 0 ? (
      <span className="text-xs text-sky-700">Seña {fmtMoney(o.paid_amount)}</span>
    ) : null

  return (
    <div>
      <PageHeader
        title="Pedidos"
        subtitle={<span className="hidden sm:inline">Los pedidos nuevos esperan tu confirmación para generar el trabajo.</span>}
        actions={
          <>
            <Button variant="secondary" onClick={() => setStockOpen(true)}>Producir</Button>
            <Button onClick={() => setNewOpen(true)}>+ Cargar</Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-4 gap-2 sm:gap-3">
        <Stat label="Por confirmar" value={counts.recibido ?? 0} accent={!!counts.recibido} />
        <Stat label="En producción" value={counts.en_produccion ?? 0} />
        <Stat label="Listos" value={counts.listo ?? 0} />
        <Stat label="Sin asignar" value={unassigned} accent={unassigned > 0} />
      </div>

      {reviewCount > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Tenés <strong>{reviewCount}</strong> {reviewCount === 1 ? 'pedido con un comprobante' : 'pedidos con comprobantes'} de pago para revisar (marcados con 🧾).
        </div>
      )}

      <label className="relative mb-3 block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </span>
        <input className="input pl-9" placeholder="Buscar por cliente, ciudad o número de pedido" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      <div className="no-scrollbar -mx-4 mb-4 flex gap-1 overflow-x-auto px-4">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${filter === f.id ? 'bg-brand-700 text-white' : 'text-stone-600 hover:bg-stone-200'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!orders ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty>
          {search ? `No hay pedidos que coincidan con “${q}”.` : `No hay pedidos ${filter !== 'todos' && filter !== 'activos' && filter !== 'stock' ? `en "${STATUS_LABEL[filter as OrderStatus]}"` : 'activos'}.`}
        </Empty>
      ) : (
        <>
          {/* celular: tarjetas */}
          <div className="space-y-3 lg:hidden">
            {list.map((o) => {
              const ot = tasks.filter((t) => t.order_id === o.id)
              const tot = ot.reduce((s, t) => s + t.quantity, 0)
              const done = ot.reduce((s, t) => s + t.done_qty, 0)
              const late = o.due_date && o.due_date < today && !['listo', 'entregado', 'cancelado'].includes(o.status)
              return (
                <Link
                  key={o.id}
                  to={`/admin/pedidos/${o.id}`}
                  className={`card block p-4 active:bg-stone-50 ${o.status === 'recibido' ? 'border-amber-300' : ''} ${o.kind === 'stock' ? 'border-dashed' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate font-medium">
                        {o.kind === 'stock' && <Icon name="box" className="h-4 w-4 shrink-0 text-brand-600" />}
                        {name(o)}
                        {toReview[o.id] && <span title="Comprobante para revisar">🧾</span>}
                      </div>
                      <div className="text-xs text-stone-500">#{o.number} · {fmtDate(o.created_at)}</div>
                    </div>
                    {o.kind === 'stock' && o.status === 'entregado' ? <Badge color="bg-emerald-100 text-emerald-800">Sumado al stock</Badge> : <StatusBadge status={o.status} />}
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div className="text-sm">
                      <span className="text-stone-500">{o.kind === 'stock' ? 'Para ' : 'Entrega '}</span>
                      {o.due_date ? (
                        <span className={late ? 'font-semibold text-red-700' : 'font-medium'}>{fmtDate(o.due_date)}</span>
                      ) : (
                        <span className="text-stone-400">pide {fmtDate(o.requested_date)}</span>
                      )}
                    </div>
                    {o.kind === 'cliente' && (
                      <div className="text-right">
                        <div className="font-semibold">{fmtMoney(o.total)}</div>
                        {payLabel(o)}
                      </div>
                    )}
                  </div>
                  {tot > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-stone-200"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round((done / tot) * 100)}%` }} /></div>
                      <span className="text-xs text-stone-500">{Math.round((done / tot) * 100)}%</span>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
          {/* escritorio: tabla */}
          <div className="hidden lg:block">
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="bg-stone-50">
                  <tr>
                    <th className="th">#</th>
                    <th className="th">Cliente</th>
                    <th className="th">Recibido</th>
                    <th className="th">Entrega</th>
                    <th className="th">Avance</th>
                    <th className="th text-right">Total</th>
                    <th className="th">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {list.map((o) => {
                    const ot = tasks.filter((t) => t.order_id === o.id)
                    const tot = ot.reduce((s, t) => s + t.quantity, 0)
                    const done = ot.reduce((s, t) => s + t.done_qty, 0)
                    const late = o.due_date && o.due_date < today && !['listo', 'entregado', 'cancelado'].includes(o.status)
                    return (
                      <tr key={o.id} className="hover:bg-stone-50">
                        <td className="td font-medium">
                          <Link to={`/admin/pedidos/${o.id}`} className="text-brand-700 hover:underline">#{o.number}</Link>
                        </td>
                        <td className="td">
                          <Link to={`/admin/pedidos/${o.id}`} className={`flex items-center gap-1.5 ${o.kind === 'stock' ? 'text-brand-700' : ''}`}>
                            {o.kind === 'stock' && <Icon name="box" className="h-4 w-4" />}
                            {name(o)}
                            {toReview[o.id] && <span title="Comprobante para revisar">🧾</span>}
                          </Link>
                        </td>
                        <td className="td text-stone-600">{fmtDate(o.created_at)}</td>
                        <td className="td">
                          {o.due_date ? (
                            <span className={late ? 'font-medium text-red-700' : ''}>{fmtDate(o.due_date)}</span>
                          ) : (
                            <span className="text-stone-400">pide {fmtDate(o.requested_date)}</span>
                          )}
                        </td>
                        <td className="td w-32">
                          {tot > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 rounded-full bg-stone-200"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round((done / tot) * 100)}%` }} /></div>
                              <span className="text-xs text-stone-500">{Math.round((done / tot) * 100)}%</span>
                            </div>
                          ) : (
                            <span className="text-xs text-stone-400">—</span>
                          )}
                        </td>
                        <td className="td text-right whitespace-nowrap">
                          {o.kind === 'cliente' ? (
                            <>
                              <div>{fmtMoney(o.total)}</div>
                              {payLabel(o)}
                            </>
                          ) : (
                            <span className="text-stone-400">—</span>
                          )}
                        </td>
                        <td className="td">
                          {o.kind === 'stock' && o.status === 'entregado' ? <Badge color="bg-emerald-100 text-emerald-800">Sumado al stock</Badge> : <StatusBadge status={o.status} />}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <NewOrderModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => setReload((r) => r + 1)} />
      <StockOrderModal open={stockOpen} onClose={() => setStockOpen(false)} />
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-2.5 sm:p-4 ${accent ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-white'}`}>
      <div className="text-xl font-semibold text-stone-900 sm:text-2xl">{value}</div>
      <div className="text-[11px] leading-tight text-stone-500 sm:text-xs">{label}</div>
    </div>
  )
}
