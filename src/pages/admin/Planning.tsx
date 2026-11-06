import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { addDays, fmtDay, fmtNum, startOfWeek, toISODate, todayISO } from '../../lib/format'
import { personName, useStaff } from '../../lib/data'
import type { Order, Task } from '../../lib/types'
import { Button, Empty, PageHeader, Progress, Spinner } from '../../components/ui'

export default function Planning() {
  const staff = useStaff()
  const [week, setWeek] = useState(() => startOfWeek(new Date()))
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [orders, setOrders] = useState<Record<string, Pick<Order, 'id' | 'number' | 'status'>>>({})
  const [showDone, setShowDone] = useState(false)

  const from = toISODate(week)
  const to = toISODate(addDays(week, 6))
  const today = todayISO()
  const isCurrent = from === toISODate(startOfWeek(new Date()))

  const load = useCallback(async () => {
    // tareas de la semana + atrasadas sin terminar (sólo si miramos la semana actual)
    const { data } = await supabase.from('tasks').select('*').lte('due_date', to).order('due_date').order('step_order')
    const all = ((data as Task[]) ?? []).filter((t) => (t.due_date! >= from) || (isCurrent && t.status !== 'hecha'))
    const ids = [...new Set(all.map((t) => t.order_id))]
    const { data: os } = ids.length ? await supabase.from('orders').select('id, number, status').in('id', ids) : { data: [] }
    setOrders(Object.fromEntries((os ?? []).map((o) => [o.id, o])))
    setTasks(all)
  }, [from, to, isCurrent])

  useEffect(() => {
    load()
  }, [load])

  const groups = useMemo(() => {
    const list = (tasks ?? []).filter((t) => showDone || t.status !== 'hecha')
    const g: { id: string; name: string; tasks: Task[] }[] = staff.map((s) => ({ id: s.id, name: personName(s), tasks: list.filter((t) => t.assignee_id === s.id) }))
    const known = new Set(staff.map((s) => s.id))
    const orphan = list.filter((t) => !t.assignee_id || !known.has(t.assignee_id))
    if (orphan.length) g.unshift({ id: '', name: 'Sin asignar', tasks: orphan })
    return g
  }, [tasks, staff, showDone])

  const reassign = async (t: Task, assignee: string) => {
    await supabase.from('tasks').update({ assignee_id: assignee || null }).eq('id', t.id)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Planificación"
        subtitle={`Semana del ${fmtDay(from)} al ${fmtDay(to)}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setWeek(addDays(week, -7))}>←</Button>
            <Button variant="secondary" onClick={() => setWeek(startOfWeek(new Date()))} disabled={isCurrent}>Hoy</Button>
            <Button variant="secondary" onClick={() => setWeek(addDays(week, 7))}>→</Button>
          </>
        }
      />
      <label className="mb-4 flex items-center gap-2 text-sm text-stone-600">
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Mostrar tareas terminadas
      </label>
      {!tasks ? (
        <Spinner />
      ) : groups.every((g) => g.tasks.length === 0) ? (
        <Empty>No hay trabajo para esta semana.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => {
            const pend = g.tasks.reduce((s, t) => s + (t.quantity - t.done_qty), 0)
            return (
              <section key={g.id || 'none'} className={`card overflow-hidden ${g.id === '' ? 'border-amber-300' : ''}`}>
                <header className={`flex items-center justify-between px-4 py-3 ${g.id === '' ? 'bg-amber-50' : 'bg-stone-50'}`}>
                  <h2 className="font-medium">{g.name}</h2>
                  <span className="text-xs text-stone-500">{g.tasks.length} {g.tasks.length === 1 ? 'tarea' : 'tareas'} · {fmtNum(pend)} u. pendientes</span>
                </header>
                {g.tasks.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-stone-400">Sin tareas</p>
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {g.tasks.map((t) => {
                      const late = t.due_date! < today && t.status !== 'hecha'
                      return (
                        <li key={t.id} className="space-y-1.5 px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium">{t.process_name} · {fmtNum(t.quantity)} u.</div>
                              <div className="truncate text-xs text-stone-500">{t.description}</div>
                            </div>
                            <div className={`whitespace-nowrap text-xs ${late ? 'font-semibold text-red-700' : 'text-stone-500'}`}>{late ? 'Atrasada · ' : ''}{fmtDay(t.due_date)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1"><Progress value={t.done_qty} max={t.quantity} /></div>
                            <span className="text-xs text-stone-500">{fmtNum(t.done_qty)}/{fmtNum(t.quantity)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <Link to={`/admin/pedidos/${t.order_id}`} className="text-xs text-brand-700 hover:underline">Pedido #{orders[t.order_id]?.number}</Link>
                            <select className="input w-36 py-0.5 text-xs" value={t.assignee_id ?? ''} onChange={(e) => reassign(t, e.target.value)}>
                              <option value="">Sin asignar</option>
                              {staff.map((s) => <option key={s.id} value={s.id}>{personName(s)}</option>)}
                            </select>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
