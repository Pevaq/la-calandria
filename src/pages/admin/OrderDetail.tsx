import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errMsg, supabase } from '../../lib/supabase'
import { addDays, fmtDate, fmtDay, fmtMoney, fmtNum, STATUS_LABEL, toISODate, todayISO } from '../../lib/format'
import type { Order, OrderItem, OrderStatus, Profile, Settings, Task } from '../../lib/types'
import { personName, useStaff } from '../../lib/data'
import { Alert, Badge, Button, Field, Modal, PageHeader, Progress, Spinner, StatusBadge } from '../../components/ui'

export default function OrderDetail() {
  const { id } = useParams()
  const staff = useStaff()
  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [client, setClient] = useState<Profile | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')

  const load = useCallback(async () => {
    const { data: o } = await supabase.from('orders').select('*').eq('id', id!).single()
    const [it, cl, ts, st] = await Promise.all([
      supabase.from('order_items').select('*').eq('order_id', id!),
      supabase.from('profiles').select('*').eq('id', o!.client_id).maybeSingle(),
      supabase.from('tasks').select('*').eq('order_id', id!).order('due_date').order('step_order'),
      supabase.from('settings').select('*').eq('id', 1).single(),
    ])
    setOrder(o as Order)
    setAdminNotes((o as Order).admin_notes ?? '')
    setItems((it.data as OrderItem[]) ?? [])
    setClient(cl.data as Profile)
    setTasks((ts.data as Task[]) ?? [])
    setSettings(st.data as Settings)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (!order) return <Spinner />

  const run = async (fn: () => PromiseLike<{ error: unknown }>, ok: string) => {
    setError('')
    setMsg('')
    const { error } = await fn()
    if (error) setError(errMsg(error))
    else {
      setMsg(ok)
      load()
    }
  }

  const setStatus = (s: OrderStatus) =>
    run(() => supabase.from('orders').update({ status: s, updated_at: new Date().toISOString() }).eq('id', order.id), `Estado: ${STATUS_LABEL[s]}`)
  const togglePaid = () =>
    run(async () => {
      const r = await supabase.from('orders').update({ payment_received: !order.payment_received }).eq('id', order.id)
      if (r.error || order.payment_received) return r
      // sólo avanza el estado si todavía estaba en "recibido" (chequeado en la base, no en pantalla)
      return supabase.from('orders').update({ status: 'pago_confirmado' }).eq('id', order.id).eq('status', 'recibido')
    }, order.payment_received ? 'Pago desmarcado' : 'Pago registrado')
  const cancel = () => {
    if (!confirm('¿Cancelar el pedido? Se devuelve el stock usado y se borran sus tareas.')) return
    run(() => supabase.rpc('cancel_order', { p_order_id: order.id }), 'Pedido cancelado')
  }
  const saveNotes = () => run(() => supabase.from('orders').update({ admin_notes: adminNotes || null }).eq('id', order.id), 'Notas guardadas')
  const reassign = (taskId: string, assignee: string) =>
    run(() => supabase.from('tasks').update({ assignee_id: assignee || null }).eq('id', taskId), 'Tarea reasignada')

  const confirmed = !!order.confirmed_at
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0)
  const tq = tasks.reduce((s, t) => s + t.quantity, 0)
  const td = tasks.reduce((s, t) => s + t.done_qty, 0)
  const staffById = Object.fromEntries(staff.map((s) => [s.id, s]))

  return (
    <div className="max-w-5xl">
      <Link to="/admin" className="mb-2 inline-block text-sm text-stone-500 hover:text-stone-800">← Pedidos</Link>
      <PageHeader
        title={`Pedido #${order.number}`}
        subtitle={<>Recibido el {fmtDate(order.created_at)} · {fmtNum(totalUnits)} unidades</>}
        actions={
          <>
            <StatusBadge status={order.status} />
          </>
        }
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {msg && <div className="mb-4"><Alert kind="success">{msg}</Alert></div>}

      {/* Acción principal */}
      {!confirmed && order.status !== 'cancelado' && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
          <div>
            <div className="font-medium text-amber-900">Este pedido espera tu confirmación</div>
            <div className="text-sm text-amber-800">Al confirmarlo se descuenta stock y se reparten las tareas a cada trabajador.</div>
          </div>
          <Button onClick={() => setConfirmOpen(true)}>Confirmar y generar trabajo</Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50">
                <tr><th className="th">Producto</th><th className="th text-right">Cant.</th><th className="th text-right">De stock</th><th className="th text-right">Precio</th><th className="th text-right">Subtotal</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="td"><div className="font-medium">{i.product_name}</div><div className="text-xs text-stone-500">{i.variant_label}</div></td>
                    <td className="td text-right">{fmtNum(i.quantity)}</td>
                    <td className="td text-right text-stone-500">{i.qty_from_stock ? fmtNum(i.qty_from_stock) : '—'}</td>
                    <td className="td text-right whitespace-nowrap">{fmtMoney(i.unit_price)}</td>
                    <td className="td text-right whitespace-nowrap">{fmtMoney(i.unit_price * i.quantity)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-stone-50"><td className="td font-medium" colSpan={4}>Total</td><td className="td text-right font-semibold">{fmtMoney(order.total)}</td></tr></tfoot>
            </table>
          </div>

          {/* Tareas */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Trabajo</h2>
              {tq > 0 && <span className="text-sm text-stone-500">{Math.round((td / tq) * 100)}% hecho</span>}
            </div>
            {!confirmed ? (
              <p className="text-sm text-stone-500">Las tareas se generan al confirmar el pedido.</p>
            ) : tasks.length === 0 ? (
              <p className="text-sm text-stone-500">No hizo falta fabricar nada: todo salió de stock (o los productos no tienen procesos definidos).</p>
            ) : (
              <div className="card divide-y divide-stone-100">
                {tasks.map((t) => (
                  <div key={t.id} className="grid gap-2 p-3 sm:grid-cols-[1fr_auto_10rem] sm:items-center">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {t.process_name} <span className="font-normal text-stone-500">· {t.description}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="w-32"><Progress value={t.done_qty} max={t.quantity} /></div>
                        <span className="text-xs text-stone-500">{fmtNum(t.done_qty)}/{fmtNum(t.quantity)}</span>
                      </div>
                    </div>
                    <div className={`text-sm ${t.due_date && t.due_date < todayISO() && t.status !== 'hecha' ? 'font-medium text-red-700' : 'text-stone-600'}`}>
                      {fmtDay(t.due_date)}
                    </div>
                    <select className={`input py-1 ${!t.assignee_id ? 'border-amber-300 bg-amber-50' : ''}`} value={t.assignee_id ?? ''} onChange={(e) => reassign(t.id, e.target.value)}>
                      <option value="">Sin asignar</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>{personName(s)}</option>
                      ))}
                      {t.assignee_id && !staffById[t.assignee_id] && <option value={t.assignee_id}>(inactivo)</option>}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card space-y-1 p-4 text-sm">
            <div className="label">Cliente</div>
            <div className="font-medium">{client?.company || personName(client)}</div>
            {client?.company && <div>{client.full_name}</div>}
            {client?.phone && (
              <a className="block text-brand-700 underline" href={`https://wa.me/${client.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                {client.phone}
              </a>
            )}
            {client?.email && <a className="block text-brand-700 underline" href={`mailto:${client.email}`}>{client.email}</a>}
            {client?.city && <div className="text-stone-500">{client.city}{client.address ? ` · ${client.address}` : ''}</div>}
            {client?.cuit && <div className="text-stone-500">CUIT {client.cuit}</div>}
          </div>

          <div className="card space-y-2 p-4 text-sm">
            <div className="flex justify-between"><span className="text-stone-500">Fecha pedida</span><span>{fmtDate(order.requested_date)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Entrega</span><span className="font-medium">{order.due_date ? fmtDate(order.due_date) : '—'}</span></div>
            {order.notes && <div className="rounded-lg bg-stone-50 p-2 text-stone-700">“{order.notes}”</div>}
          </div>

          <div className="card space-y-3 p-4">
            <div className="flex items-center justify-between text-sm">
              <span>Pago</span>
              {order.payment_received ? <Badge color="bg-emerald-100 text-emerald-800">Recibido</Badge> : <Badge color="bg-amber-100 text-amber-800">Pendiente</Badge>}
            </div>
            <Button variant="secondary" className="w-full" onClick={togglePaid} disabled={order.status === 'cancelado'}>
              {order.payment_received ? 'Desmarcar pago' : 'Marcar pago recibido'}
            </Button>
            {confirmed && order.status !== 'cancelado' && (
              <div className="flex flex-wrap gap-2">
                {order.status !== 'listo' && <Button size="sm" variant="secondary" onClick={() => setStatus('listo')}>Marcar listo</Button>}
                {order.status !== 'entregado' && <Button size="sm" variant="secondary" onClick={() => setStatus('entregado')}>Marcar entregado</Button>}
                {order.status === 'entregado' && <Button size="sm" variant="secondary" onClick={() => setStatus('listo')}>Volver a listo</Button>}
              </div>
            )}
            {order.status !== 'cancelado' && order.status !== 'entregado' && (
              <Button variant="danger" size="sm" className="w-full" onClick={cancel}>Cancelar pedido</Button>
            )}
          </div>

          <div className="card space-y-2 p-4">
            <Field label="Notas internas">
              <textarea className="input min-h-20" value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} />
            </Field>
            <Button size="sm" variant="secondary" onClick={saveNotes}>Guardar notas</Button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        order={order}
        defaultDays={settings?.default_lead_days ?? 14}
        onDone={(n) => {
          setConfirmOpen(false)
          setMsg(`Pedido confirmado. Se generaron ${n} tareas.`)
          load()
        }}
      />
    </div>
  )
}

function ConfirmModal({ open, onClose, order, defaultDays, onDone }: { open: boolean; onClose: () => void; order: Order; defaultDays: number; onDone: (n: number) => void }) {
  const [date, setDate] = useState('')
  const [useStock, setUseStock] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) setDate(order.requested_date || toISODate(addDays(new Date(), defaultDays)))
  }, [open, order.requested_date, defaultDays])

  const go = async () => {
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('confirm_order', { p_order_id: order.id, p_due_date: date, p_use_stock: useStock })
    setBusy(false)
    if (error) return setError(errMsg(error))
    onDone(data as number)
  }

  return (
    <Modal open={open} onClose={onClose} title={`Confirmar pedido #${order.number}`}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Fecha de entrega" hint="Las fechas de cada tarea se calculan hacia atrás desde acá.">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={useStock} onChange={(e) => setUseStock(e.target.checked)} />
          <span>Usar stock disponible (producto terminado y partes) antes de mandar a fabricar.</span>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Volver</Button>
          <Button onClick={go} loading={busy} disabled={!date}>Confirmar</Button>
        </div>
      </div>
    </Modal>
  )
}
