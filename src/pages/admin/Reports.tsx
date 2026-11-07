import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtMoney, fmtNum } from '../../lib/format'
import { personName } from '../../lib/data'
import type { Order, OrderItem, Payment, Profile, Task } from '../../lib/types'
import { PageHeader, Spinner } from '../../components/ui'

type Period = 'mes' | 'trimestre' | 'anio'
const PERIODS: { id: Period; label: string }[] = [
  { id: 'mes', label: 'Este mes' },
  { id: 'trimestre', label: 'Últimos 3 meses' },
  { id: 'anio', label: 'Este año' },
]

function periodStart(p: Period) {
  const d = new Date()
  if (p === 'mes') return new Date(d.getFullYear(), d.getMonth(), 1)
  if (p === 'trimestre') return new Date(d.getFullYear(), d.getMonth() - 2, 1)
  return new Date(d.getFullYear(), 0, 1)
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const compactMoney = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M` : n >= 1000 ? `$${Math.round(n / 1000)} mil` : fmtMoney(n)

export default function Reports() {
  const [period, setPeriod] = useState<Period>('mes')
  const [data, setData] = useState<{ orders: Order[]; items: OrderItem[]; payments: Payment[]; tasks: Task[]; people: Profile[] } | null>(null)

  useEffect(() => {
    ;(async () => {
      const since = new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1).toISOString()
      const [o, p, t, pe] = await Promise.all([
        supabase.from('orders').select('*').eq('kind', 'cliente').gte('created_at', since),
        supabase.from('payments').select('*').eq('status', 'confirmado'),
        supabase.from('tasks').select('*').not('completed_at', 'is', null).gte('completed_at', since),
        supabase.from('profiles').select('*'),
      ])
      const orders = (o.data as Order[]) ?? []
      const ids = orders.filter((x) => x.status !== 'cancelado').map((x) => x.id)
      const { data: it } = ids.length ? await supabase.from('order_items').select('*').in('order_id', ids) : { data: [] }
      setData({ orders, items: (it as OrderItem[]) ?? [], payments: (p.data as Payment[]) ?? [], tasks: (t.data as Task[]) ?? [], people: (pe.data as Profile[]) ?? [] })
    })()
  }, [])

  const r = useMemo(() => {
    if (!data) return null
    const start = periodStart(period).toISOString()
    const valid = data.orders.filter((o) => o.status !== 'cancelado')
    const inPeriod = valid.filter((o) => o.created_at >= start)
    const ids = new Set(inPeriod.map((o) => o.id))
    const items = data.items.filter((i) => ids.has(i.order_id))
    const sold = inPeriod.reduce((s, o) => s + Number(o.total), 0)
    const collected = data.payments.filter((p) => (p.reviewed_at ?? p.created_at) >= start).reduce((s, p) => s + Number(p.amount), 0)
    const balance = valid.reduce((s, o) => s + Math.max(0, Number(o.total) - Number(o.paid_amount)), 0)
    const units = items.reduce((s, i) => s + i.quantity, 0)

    // ventas por mes: últimos 6 meses
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, k) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + k, 1)
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      const total = valid.filter((o) => o.created_at >= d.toISOString() && o.created_at < next.toISOString()).reduce((s, o) => s + Number(o.total), 0)
      return { label: `${MONTHS[d.getMonth()]}${d.getMonth() === 0 ? ` ${String(d.getFullYear()).slice(2)}` : ''}`, total }
    })

    const group = <T,>(rows: T[], key: (r: T) => string, val: (r: T) => number) => {
      const m = new Map<string, number>()
      for (const row of rows) m.set(key(row), (m.get(key(row)) ?? 0) + val(row))
      return [...m.entries()].map(([k, v]) => ({ key: k, value: v })).sort((a, b) => b.value - a.value)
    }
    const people = Object.fromEntries(data.people.map((p) => [p.id, p]))
    const topProducts = group(items, (i) => `${i.product_name}${i.variant_label ? ` · ${i.variant_label}` : ''}`, (i) => i.quantity).slice(0, 8)
    const topClients = group(inPeriod, (o) => people[o.client_id]?.company || personName(people[o.client_id]), (o) => Number(o.total)).slice(0, 8)
    const production = group(
      data.tasks.filter((t) => t.completed_at! >= start && t.assignee_id),
      (t) => personName(people[t.assignee_id!]),
      (t) => t.done_qty,
    )
    return { sold, collected, balance, units, count: inPeriod.length, months, topProducts, topClients, production }
  }, [data, period])

  return (
    <div className="max-w-5xl">
      <PageHeader title="Reportes" />
      <div className="no-scrollbar -mx-4 mb-5 flex gap-1 overflow-x-auto px-4">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${period === p.id ? 'bg-brand-700 text-white' : 'text-stone-600 hover:bg-stone-200'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!r ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <Kpi label="Vendido" value={fmtMoney(r.sold)} sub={`${fmtNum(r.count)} pedidos · ${fmtNum(r.units)} u.`} />
            <Kpi label="Cobrado" value={fmtMoney(r.collected)} sub="pagos confirmados" />
            <Kpi label="Saldo a cobrar" value={fmtMoney(r.balance)} sub="todos los pedidos abiertos" accent={r.balance > 0} />
            <Kpi label="Ticket promedio" value={r.count ? fmtMoney(r.sold / r.count) : '—'} sub="por pedido" />
          </div>

          <section className="card p-4">
            <h2 className="font-medium">Ventas por mes</h2>
            <p className="mb-3 text-xs text-stone-500">Últimos 6 meses · total de pedidos (sin cancelados)</p>
            <MonthBars months={r.months} />
          </section>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Ranked title="Productos más pedidos" note="unidades" rows={r.topProducts} fmt={(n) => `${fmtNum(n)} u.`} />
            <Ranked title="Clientes que más compraron" note="monto" rows={r.topClients} fmt={fmtMoney} />
          </div>
          <Ranked
            title="Producción por persona"
            note="unidades de tareas terminadas en el período"
            rows={r.production}
            fmt={(n) => `${fmtNum(n)} u.`}
          />
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${accent ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-white'}`}>
      <div className="text-xs text-stone-500">{label}</div>
      <div className="truncate text-lg font-semibold text-stone-900 sm:text-2xl">{value}</div>
      <div className="truncate text-[11px] text-stone-500 sm:text-xs">{sub}</div>
    </div>
  )
}

/** Barras verticales de una sola serie, con detalle al tocar/pasar */
function MonthBars({ months }: { months: { label: string; total: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...months.map((m) => m.total))
  const best = months.reduce((b, m, i) => (m.total > months[b].total ? i : b), 0)
  return (
    <div>
      <div className="relative mt-9 flex h-44 items-end gap-2 border-b border-stone-200 sm:gap-4" role="img" aria-label="Ventas por mes">
        {months.map((m, i) => {
          const h = (m.total / max) * 100
          const show = hover === i || (hover === null && i === best && m.total > 0)
          return (
            <button
              key={m.label}
              type="button"
              className="group relative flex h-full flex-1 items-end justify-center focus:outline-none"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => setHover(hover === i ? null : i)}
              aria-label={`${m.label}: ${fmtMoney(m.total)}`}
            >
              {show && (
                <span className="absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-md bg-stone-900 px-2 py-1 text-xs text-white shadow">
                  {fmtMoney(m.total)}
                </span>
              )}
              <span
                className={`w-full max-w-12 rounded-t transition-colors ${hover === i ? 'bg-brand-800' : 'bg-brand-600'}`}
                style={{ height: `${Math.max(h, m.total > 0 ? 2 : 0)}%` }}
              />
            </button>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-2 sm:gap-4">
        {months.map((m) => (
          <div key={m.label} className="flex-1 text-center text-xs text-stone-500">{m.label}</div>
        ))}
      </div>
      <div className="mt-1 text-right text-[11px] text-stone-400">máx. {compactMoney(max)}</div>
    </div>
  )
}

/** Ranking con barras horizontales; el valor siempre escrito (no depende del color) */
function Ranked({ title, note, rows, fmt }: { title: string; note: string; rows: { key: string; value: number }[]; fmt: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <section className="card p-4">
      <h2 className="font-medium">{title}</h2>
      <p className="mb-3 text-xs text-stone-500">{note}</p>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-stone-400">Sin datos en este período</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.key} title={`${r.key}: ${fmt(r.value)}`}>
              <div className="mb-1 flex justify-between gap-3 text-sm">
                <span className="truncate text-stone-700">{r.key}</span>
                <span className="shrink-0 font-medium text-stone-900">{fmt(r.value)}</span>
              </div>
              <div className="h-2 rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
