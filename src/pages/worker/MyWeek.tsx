import { useCallback, useEffect, useMemo, useState } from 'react'
import { errMsg, supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { addDays, fmtDay, fmtNum, startOfWeek, toISODate, todayISO } from '../../lib/format'
import type { Order, Task } from '../../lib/types'
import { Alert, Button, Empty, Progress, Spinner } from '../../components/ui'

export default function MyWeek() {
  const { profile } = useAuth()
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [orders, setOrders] = useState<Record<string, Pick<Order, 'number' | 'due_date'>>>({})
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!profile) return
    const weekAgo = toISODate(addDays(new Date(), -7))
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('assignee_id', profile.id)
      .or(`status.neq.hecha,completed_at.gte.${weekAgo}`)
      .order('due_date')
      .order('step_order')
    const ts = (data as Task[]) ?? []
    const ids = [...new Set(ts.map((t) => t.order_id))]
    const { data: os } = ids.length ? await supabase.from('orders').select('id, number, due_date').in('id', ids) : { data: [] }
    setOrders(Object.fromEntries((os ?? []).map((o) => [o.id, o])))
    setTasks(ts)
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

  const save = async (t: Task, done: number) => {
    setError('')
    // optimista
    setTasks((prev) => prev?.map((x) => (x.id === t.id ? { ...x, done_qty: Math.max(0, Math.min(done, x.quantity)) } : x)) ?? null)
    const { data, error } = await supabase.rpc('report_progress', { p_task_id: t.id, p_done: done })
    if (error) {
      setError(errMsg(error))
      return load()
    }
    setTasks((prev) => prev?.map((x) => (x.id === t.id ? (data as Task) : x)) ?? null)
  }

  const today = todayISO()
  const weekEnd = toISODate(addDays(startOfWeek(new Date()), 6))
  const sections = useMemo(() => {
    const ts = tasks ?? []
    const open = ts.filter((t) => t.status !== 'hecha')
    return [
      { key: 'late', title: 'Atrasadas', tone: 'red', items: open.filter((t) => t.due_date && t.due_date < today) },
      { key: 'week', title: 'Esta semana', tone: 'brand', items: open.filter((t) => !t.due_date || (t.due_date >= today && t.due_date <= weekEnd)) },
      { key: 'next', title: 'Más adelante', tone: 'stone', items: open.filter((t) => t.due_date && t.due_date > weekEnd) },
      { key: 'done', title: 'Terminadas (últimos 7 días)', tone: 'stone', items: ts.filter((t) => t.status === 'hecha') },
    ]
  }, [tasks, today, weekEnd])

  if (!tasks) return <Spinner />
  const pending = tasks.filter((t) => t.status !== 'hecha').reduce((s, t) => s + t.quantity - t.done_qty, 0)

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Hola{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''} 👋</h1>
        <p className="mt-1 text-sm text-stone-500">
          {pending > 0 ? <>Tenés <strong className="text-stone-800">{fmtNum(pending)} unidades</strong> por hacer.</> : 'No tenés trabajo pendiente.'}
        </p>
      </div>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {tasks.length === 0 ? (
        <Empty>Cuando entre un pedido, acá vas a ver qué te toca hacer.</Empty>
      ) : (
        <div className="space-y-8">
          {sections.map(
            (s) =>
              s.items.length > 0 && (
                <section key={s.key}>
                  <h2 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${s.tone === 'red' ? 'text-red-700' : s.tone === 'brand' ? 'text-brand-700' : 'text-stone-500'}`}>
                    {s.title} · {s.items.length}
                  </h2>
                  <div className="space-y-3">
                    {s.items.map((t) => (
                      <TaskCard key={t.id} task={t} orderNumber={orders[t.order_id]?.number} late={s.key === 'late'} onSave={save} />
                    ))}
                  </div>
                </section>
              ),
          )}
        </div>
      )}
    </div>
  )
}

function TaskCard({ task: t, orderNumber, late, onSave }: { task: Task; orderNumber?: number; late: boolean; onSave: (t: Task, done: number) => void }) {
  const [val, setVal] = useState(String(t.done_qty))
  useEffect(() => setVal(String(t.done_qty)), [t.done_qty])
  const done = t.status === 'hecha'
  const remaining = t.quantity - t.done_qty
  const commit = () => {
    const n = parseInt(val)
    if (!isNaN(n) && n !== t.done_qty) onSave(t, n)
    else setVal(String(t.done_qty))
  }
  return (
    <div className={`card p-4 ${late ? 'border-red-200' : ''} ${done ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold leading-tight">
            {t.process_name} <span className="text-stone-400">·</span> {fmtNum(t.quantity)} u.
          </div>
          <div className="mt-0.5 text-sm text-stone-600">{t.description}</div>
        </div>
        <div className="text-right">
          <div className={`whitespace-nowrap text-sm font-medium ${late ? 'text-red-700' : 'text-stone-700'}`}>{fmtDay(t.due_date)}</div>
          {orderNumber && <div className="text-xs text-stone-400">Pedido #{orderNumber}</div>}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1"><Progress value={t.done_qty} max={t.quantity} /></div>
        <span className="w-24 text-right text-xs text-stone-500">{fmtNum(t.done_qty)} / {fmtNum(t.quantity)}</span>
      </div>
      {!done ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-stone-600">
            Hechas
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={t.quantity}
              className="input w-24 py-1.5 text-right"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
          {remaining >= 10 && <Button size="sm" variant="secondary" onClick={() => onSave(t, t.done_qty + 10)}>+10</Button>}
          {remaining >= 50 && <Button size="sm" variant="secondary" onClick={() => onSave(t, t.done_qty + 50)}>+50</Button>}
          <div className="flex-1" />
          <Button size="sm" onClick={() => onSave(t, t.quantity)}>✓ Terminé todo</Button>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="font-medium text-emerald-700">✓ Terminada</span>
          <button className="text-xs text-stone-500 underline" onClick={() => onSave(t, 0)}>Deshacer</button>
        </div>
      )}
    </div>
  )
}
