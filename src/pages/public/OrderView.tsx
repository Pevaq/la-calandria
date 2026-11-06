import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fmtDate, fmtMoney, fmtNum } from '../../lib/format'
import type { Order, OrderItem, OrderStatus } from '../../lib/types'
import { Alert, Spinner, StatusBadge } from '../../components/ui'
import PaymentInfo from '../../components/PaymentInfo'

const STEPS: OrderStatus[] = ['recibido', 'pago_confirmado', 'en_produccion', 'listo', 'entregado']
const STEP_LABEL: Record<string, string> = {
  recibido: 'Recibido',
  pago_confirmado: 'Pago',
  en_produccion: 'Producción',
  listo: 'Listo',
  entregado: 'Entregado',
}

export default function OrderView() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const [order, setOrder] = useState<Order | null | undefined>(undefined)
  const [items, setItems] = useState<OrderItem[]>([])

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('orders').select('*').eq('id', id!).maybeSingle()
      const { data: it } = await supabase.from('order_items').select('*').eq('order_id', id!)
      setItems((it as OrderItem[]) ?? [])
      setOrder((data as Order) ?? null)
    })()
  }, [id])

  if (order === undefined) return <Spinner />
  if (!order) return <Alert>No encontramos ese pedido.</Alert>

  const stepIdx = STEPS.indexOf(order.status)
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {sp.get('nuevo') && (
        <div className="rounded-2xl bg-brand-800 px-6 py-6 text-cream-100">
          <h1 className="font-display text-2xl font-semibold">¡Recibimos tu pedido #{order.number}!</h1>
          <p className="mt-1 text-cream-100/80">Te vamos a confirmar la fecha de entrega. Abajo tenés los datos para transferir.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-semibold">Pedido #{order.number}</h2>
        <StatusBadge status={order.status} />
      </div>

      {order.status !== 'cancelado' && (
        <ol className="grid grid-cols-5 gap-1">
          {STEPS.map((s, i) => (
            <li key={s} className="text-center">
              <div className={`h-1.5 rounded-full ${i <= stepIdx ? 'bg-brand-600' : 'bg-stone-200'}`} />
              <div className={`mt-1 text-[11px] sm:text-xs ${i <= stepIdx ? 'text-brand-800 font-medium' : 'text-stone-400'}`}>{STEP_LABEL[s]}</div>
            </li>
          ))}
        </ol>
      )}

      <dl className="card grid grid-cols-3 divide-x divide-stone-100 text-sm">
        <div className="p-3"><dt className="label">Pedido</dt><dd>{fmtDate(order.created_at)}</dd></div>
        <div className="p-3"><dt className="label">Pedida para</dt><dd>{fmtDate(order.requested_date)}</dd></div>
        <div className="p-3"><dt className="label">Entrega</dt><dd className="font-medium">{order.due_date ? fmtDate(order.due_date) : 'A confirmar'}</dd></div>
      </dl>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-stone-50">
            <tr><th className="th">Producto</th><th className="th text-right">Cant.</th><th className="th hidden text-right sm:table-cell">Precio</th><th className="th text-right">Subtotal</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="td">
                  <div className="font-medium">{i.product_name}</div>
                  <div className="text-xs text-stone-500">{i.variant_label}<span className="sm:hidden"> · {fmtMoney(i.unit_price)} c/u</span></div>
                </td>
                <td className="td text-right">{fmtNum(i.quantity)}</td>
                <td className="td hidden text-right whitespace-nowrap sm:table-cell">{fmtMoney(i.unit_price)}</td>
                <td className="td text-right whitespace-nowrap">{fmtMoney(i.unit_price * i.quantity)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="bg-stone-50"><td className="td font-medium" colSpan={2}>Total</td><td className="td hidden sm:table-cell" /><td className="td text-right text-base font-semibold whitespace-nowrap">{fmtMoney(order.total)}</td></tr></tfoot>
        </table>
      </div>
      {order.notes && <p className="text-sm text-stone-600"><span className="text-stone-500">Notas: </span>{order.notes}</p>}

      {!order.payment_received && order.status !== 'cancelado' && <PaymentInfo total={order.total} orderNumber={order.number} />}
      {order.payment_received && <Alert kind="success">Pago recibido. ¡Gracias!</Alert>}

      <Link to="/mis-pedidos" className="inline-block text-sm text-brand-700 underline">Ver todos mis pedidos</Link>
    </div>
  )
}
