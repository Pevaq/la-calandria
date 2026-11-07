import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errMsg, supabase } from '../../lib/supabase'
import { addDays, fmtDate, fmtDay, fmtMoney, fmtNum, STATUS_LABEL, toISODate, todayISO } from '../../lib/format'
import type { Order, OrderItem, OrderStatus, Profile, Settings, Task } from '../../lib/types'
import { personName, useStaff } from '../../lib/data'
import { clientMessage, notifyClientByMail, whatsappLink, type ClientEvent } from '../../lib/notify'
import Payments from '../../components/Payments'
import EditOrderModal from './modals/EditOrderModal'
import { Alert, Button, Field, Modal, Progress, Spinner, StatusBadge } from '../../components/ui'

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
  const [editOpen, setEditOpen] = useState(false)
  // después de un cambio de estado, ofrecer avisarle al cliente por WhatsApp
  const [notice, setNotice] = useState<ClientEvent | null>(null)

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
      await load()
    }
  }

  const setStatus = async (s: OrderStatus) => {
    await run(() => supabase.from('orders').update({ status: s, updated_at: new Date().toISOString() }).eq('id', order.id), `Estado: ${STATUS_LABEL[s]}`)
    if (order.kind === 'cliente' && (s === 'listo' || s === 'entregado')) {
      setNotice(s)
      notifyClientByMail(order.id, s)
    }
  }
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

  const pct = tq > 0 ? Math.round((td / tq) * 100) : 0
  const phone = client?.phone?.replace(/\D/g, '')
  const active = order.status !== 'cancelado'
  const isStock = order.kind === 'stock'
  const canEdit = !isStock && active && order.status !== 'entregado'

  return (
    <div className="max-w-5xl">
      <Link to="/admin" className="mb-2 inline-flex items-center gap-1 py-1 text-sm text-stone-500 hover:text-stone-800">← Pedidos</Link>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{isStock ? 'Producción' : 'Pedido'} #{order.number}</h1>
          <p className="truncate text-sm text-stone-500">
            {isStock ? 'Para stock' : client?.company || personName(client)} · {fmtNum(totalUnits)} u. · {fmtDate(order.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {isStock && order.status === 'entregado' ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Sumado al stock</span> : <StatusBadge status={order.status} />}
          {canEdit && <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>Editar pedido</Button>}
        </div>
      </div>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {msg && <div className="mb-4"><Alert kind="success">{msg}</Alert></div>}
      {notice && client && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <span className="text-emerald-900">¿Le avisás a {client.company || personName(client)}?</span>
          <div className="flex gap-2">
            {whatsappLink(client.phone, clientMessage(order, client, notice)) && (
              <a className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white" target="_blank" rel="noreferrer" href={whatsappLink(client.phone, clientMessage(order, client, notice))!} onClick={() => setNotice(null)}>
                Avisar por WhatsApp
              </a>
            )}
            <button className="px-2 text-stone-500" onClick={() => setNotice(null)}>Ahora no</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start lg:gap-6">
        {/* Columna lateral (en celular va primero): próximo paso, pago, cliente */}
        <div className="space-y-4 lg:order-2">
          {active && !confirmed && (
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
              <div className="font-medium text-amber-900">Espera tu confirmación</div>
              <div className="mb-3 text-sm text-amber-800">Al confirmarlo se usa el stock y se reparten las tareas.</div>
              <Button className="w-full py-3" onClick={() => setConfirmOpen(true)}>Confirmar y generar trabajo</Button>
            </div>
          )}
          {active && confirmed && (
            <div className="card p-4">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm text-stone-500">Entrega</span>
                <span className={`font-semibold ${order.due_date && order.due_date < todayISO() && !['listo', 'entregado'].includes(order.status) ? 'text-red-700' : ''}`}>{fmtDay(order.due_date)}</span>
              </div>
              {tq > 0 && (
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex-1"><Progress value={td} max={tq} /></div>
                  <span className="text-sm font-medium">{pct}%</span>
                </div>
              )}
              {order.status === 'en_produccion' || order.status === 'pago_confirmado' ? (
                <Button className="w-full py-3" variant="secondary" onClick={() => setStatus('listo')}>Marcar listo</Button>
              ) : order.status === 'listo' ? (
                <Button className="w-full py-3" onClick={() => setStatus('entregado')}>Marcar entregado</Button>
              ) : (
                <Button className="w-full" size="sm" variant="ghost" onClick={() => setStatus('listo')}>Volver a “listo”</Button>
              )}
            </div>
          )}

          {isStock ? (
            <div className="card p-4 text-sm text-stone-600">
              {order.status === 'entregado'
                ? 'Esta producción ya se sumó al stock.'
                : 'Cuando se terminen todas las tareas, lo producido se suma solo al stock.'}
              {order.notes && <div className="mt-2 rounded-lg bg-stone-50 p-2 text-stone-700">“{order.notes}”</div>}
            </div>
          ) : (
          <>
          {active && <Payments order={order} admin onChange={load} onPaid={async (amount) => { await load(); setNotice('pago'); notifyClientByMail(order.id, 'pago', amount) }} />}

          <div className="card p-4 text-sm">
            <Link to={`/admin/clientes/${order.client_id}`} className="font-medium text-brand-700 underline-offset-2 hover:underline">{client?.company || personName(client)}</Link>
            <div className="text-stone-500">
              {[client?.company ? client.full_name : null, client?.city, client?.cuit && `CUIT ${client.cuit}`].filter(Boolean).join(' · ')}
            </div>
            {client?.address && <div className="text-stone-500">{client.address}</div>}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {phone && (
                <a href={whatsappLink(phone, clientMessage(order, client, 'estado'))!} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-600 py-2 text-center font-medium text-white">WhatsApp</a>
              )}
              {phone && <a href={`tel:${phone}`} className="rounded-lg border border-stone-300 py-2 text-center font-medium">Llamar</a>}
              {client?.email && <a href={`mailto:${client.email}?subject=${encodeURIComponent(`Pedido #${order.number}`)}`} className="rounded-lg border border-stone-300 py-2 text-center font-medium">Mail</a>}
            </div>
            <div className="mt-3 space-y-1 border-t border-stone-100 pt-3">
              <div className="flex justify-between"><span className="text-stone-500">Lo pidió para</span><span>{fmtDate(order.requested_date)}</span></div>
              {order.notes && <div className="rounded-lg bg-stone-50 p-2 text-stone-700">“{order.notes}”</div>}
            </div>
          </div>
          </>
          )}
        </div>

        {/* Columna principal: productos y trabajo */}
        <div className="space-y-4 lg:order-1 lg:col-span-2">
          <div className="card divide-y divide-stone-100">
            {items.map((i) => (
              <div key={i.id} className="flex items-start justify-between gap-3 p-3 sm:p-4">
                <div className="min-w-0">
                  <div className="font-medium">{i.product_name}</div>
                  <div className="text-xs text-stone-500">{i.variant_label}</div>
                  <div className="mt-0.5 text-sm text-stone-600">
                    {isStock ? `${fmtNum(i.quantity)} u.` : <>{fmtNum(i.quantity)} × {fmtMoney(i.unit_price)}</>}
                    {Number(i.discount_pct) > 0 && <span className="ml-1 text-xs text-emerald-700">(−{Number(i.discount_pct)}%)</span>}
                    {i.qty_from_stock > 0 && <span className="ml-1 text-emerald-700">· {fmtNum(i.qty_from_stock)} de stock</span>}
                  </div>
                </div>
                {!isStock && <div className="whitespace-nowrap font-medium">{fmtMoney(i.unit_price * i.quantity)}</div>}
              </div>
            ))}
            {!isStock && (
              <div className="flex justify-between bg-stone-50 p-3 sm:p-4">
                <span className="font-medium">Total</span>
                <span className="font-semibold">{fmtMoney(order.total)}</span>
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Trabajo</h2>
              {tq > 0 && <span className="text-sm text-stone-500">{pct}% hecho</span>}
            </div>
            {!confirmed ? (
              <p className="text-sm text-stone-500">Las tareas se generan al confirmar el pedido.</p>
            ) : tasks.length === 0 ? (
              <p className="text-sm text-stone-500">No hizo falta fabricar nada: todo salió de stock (o los productos no tienen procesos definidos).</p>
            ) : (
              <div className="card divide-y divide-stone-100">
                {tasks.map((t) => {
                  const late = t.due_date && t.due_date < todayISO() && t.status !== 'hecha'
                  return (
                    <div key={t.id} className="space-y-2 p-3 sm:grid sm:grid-cols-[1fr_auto_10rem] sm:items-center sm:gap-3 sm:space-y-0">
                      <div className="min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="text-sm font-medium">{t.process_name} · {fmtNum(t.quantity)} u.</div>
                          <div className={`whitespace-nowrap text-xs sm:hidden ${late ? 'font-semibold text-red-700' : 'text-stone-500'}`}>{fmtDay(t.due_date)}</div>
                        </div>
                        <div className="truncate text-xs text-stone-500">{t.description}</div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 sm:max-w-40"><Progress value={t.done_qty} max={t.quantity} /></div>
                          <span className="text-xs text-stone-500">{fmtNum(t.done_qty)}/{fmtNum(t.quantity)}</span>
                        </div>
                      </div>
                      <div className={`hidden text-sm sm:block ${late ? 'font-medium text-red-700' : 'text-stone-600'}`}>{fmtDay(t.due_date)}</div>
                      <select className={`input py-1.5 ${!t.assignee_id ? 'border-amber-300 bg-amber-50' : ''}`} value={t.assignee_id ?? ''} onChange={(e) => reassign(t.id, e.target.value)}>
                        <option value="">Sin asignar</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>{personName(s)}</option>
                        ))}
                        {t.assignee_id && !staffById[t.assignee_id] && <option value={t.assignee_id}>(inactivo)</option>}
                      </select>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="card space-y-2 p-4">
            <Field label="Notas internas">
              <textarea className="input min-h-20" value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} />
            </Field>
            <Button size="sm" variant="secondary" onClick={saveNotes}>Guardar notas</Button>
          </div>

          {active && order.status !== 'entregado' && (
            <Button variant="danger" className="w-full" onClick={cancel}>Cancelar pedido</Button>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        order={order}
        defaultDays={settings?.default_lead_days ?? 14}
        onDone={async (n) => {
          setConfirmOpen(false)
          setMsg(`Pedido confirmado. Se generaron ${n} tareas.`)
          await load() // primero recargar: el aviso usa la fecha de entrega ya confirmada
          if (!isStock) {
            setNotice('confirmado')
            notifyClientByMail(order.id, 'confirmado')
          }
        }}
      />
      <EditOrderModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        order={order}
        items={items}
        doneUnits={td}
        onSaved={(replanned) => {
          setEditOpen(false)
          setMsg(replanned ? 'Pedido actualizado. Volvé a confirmarlo para generar el trabajo de nuevo.' : 'Pedido actualizado.')
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
