import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fmtDate, fmtMoney, STATUS_LABEL, todayISO } from '../../lib/format'
import type { Order, OrderStatus, Profile, Task } from '../../lib/types'
import { Badge, Button, Empty, PageHeader, Spinner, StatusBadge } from '../../components/ui'
import { personName } from '../../lib/data'
import NewOrderModal from './NewOrderModal'

type Filter = 'activos' | OrderStatus | 'todos'

export default function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [clients, setClients] = useState<Record<string, Profile>>({})
  const [tasks, setTasks] = useState<Pick<Task, 'order_id' | 'quantity' | 'done_qty' | 'assignee_id'>[]>([])
  const [filter, setFilter] = useState<Filter>('activos')
  const [newOpen, setNewOpen] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(500)
      const os = (data as Order[]) ?? []
      const ids = [...new Set(os.map((o) => o.client_id))]
      const { data: cs } = ids.length ? await supabase.from('profiles').select('*').in('id', ids) : { data: [] }
      const { data: ts } = await supabase.from('tasks').select('order_id, quantity, done_qty, assignee_id')
      setClients(Object.fromEntries(((cs as Profile[]) ?? []).map((c) => [c.id, c])))
      setTasks(ts ?? [])
      setOrders(os)
    })()
  }, [reload])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const o of orders ?? []) c[o.status] = (c[o.status] ?? 0) + 1
    return c
  }, [orders])

  const list = (orders ?? []).filter((o) =>
    filter === 'todos' ? true : filter === 'activos' ? !['entregado', 'cancelado'].includes(o.status) : o.status === filter,
  )
  const today = todayISO()
  const unassigned = tasks.filter((t) => !t.assignee_id && t.done_qty < t.quantity).length

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'activos', label: 'Activos' },
    { id: 'recibido', label: `Nuevos${counts.recibido ? ` (${counts.recibido})` : ''}` },
    { id: 'pago_confirmado', label: 'Pago confirmado' },
    { id: 'en_produccion', label: 'En producción' },
    { id: 'listo', label: 'Listos' },
    { id: 'entregado', label: 'Entregados' },
    { id: 'cancelado', label: 'Cancelados' },
    { id: 'todos', label: 'Todos' },
  ]

  return (
    <div>
      <PageHeader
        title="Pedidos"
        subtitle={<span className="hidden sm:inline">Los pedidos nuevos esperan tu confirmación para generar el trabajo.</span>}
        actions={<Button onClick={() => setNewOpen(true)}>+ Cargar</Button>}
      />

      <div className="mb-5 grid grid-cols-4 gap-2 sm:gap-3">
        <Stat label="Por confirmar" value={counts.recibido ?? 0} accent={!!counts.recibido} />
        <Stat label="En producción" value={counts.en_produccion ?? 0} />
        <Stat label="Listos" value={counts.listo ?? 0} />
        <Stat label="Sin asignar" value={unassigned} accent={unassigned > 0} />
      </div>

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
        <Empty>No hay pedidos {filter !== 'todos' && filter !== 'activos' ? `en "${STATUS_LABEL[filter as OrderStatus]}"` : 'activos'}.</Empty>
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
                <Link key={o.id} to={`/admin/pedidos/${o.id}`} className={`card block p-4 active:bg-stone-50 ${o.status === 'recibido' ? 'border-amber-300' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{clients[o.client_id]?.company || personName(clients[o.client_id])}</div>
                      <div className="text-xs text-stone-500">#{o.number} · {fmtDate(o.created_at)}</div>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div className="text-sm">
                      <span className="text-stone-500">Entrega </span>
                      {o.due_date ? (
                        <span className={late ? 'font-semibold text-red-700' : 'font-medium'}>{fmtDate(o.due_date)}</span>
                      ) : (
                        <span className="text-stone-400">pide {fmtDate(o.requested_date)}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{fmtMoney(o.total)}</div>
                      {o.payment_received && <div className="text-xs text-emerald-700">Pagado ✓</div>}
                    </div>
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
                        <Link to={`/admin/pedidos/${o.id}`} className="block">
                          {clients[o.client_id]?.company || personName(clients[o.client_id])}
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
                      <td className="td text-right whitespace-nowrap">{fmtMoney(o.total)}</td>
                      <td className="td">
                        <div className="flex items-center gap-1">
                          <StatusBadge status={o.status} />
                          {o.payment_received && <Badge color="bg-emerald-50 text-emerald-700">$ ✓</Badge>}
                        </div>
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
