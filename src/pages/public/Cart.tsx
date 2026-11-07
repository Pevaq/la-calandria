import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { appUrl, errMsg, imageUrl, supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useCart } from '../../lib/cart'
import { addDays, fmtMoney, fmtNum, toISODate } from '../../lib/format'
import { usePricing } from '../../lib/pricing'
import { Alert, Button, Empty, Field, PageHeader } from '../../components/ui'

export default function Cart() {
  const { profile, canBuy } = useAuth()
  const cart = useCart()
  const nav = useNavigate()
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pricing = usePricing([...new Set(cart.items.map((i) => i.product_id))])
  const productQty = (pid: string) => cart.items.filter((i) => i.product_id === pid).reduce((s, i) => s + i.quantity, 0)
  const unit = (i: (typeof cart.items)[number]) => pricing.unitPrice(i.price, i.product_id, productQty(i.product_id))
  const total = cart.items.reduce((s, i) => s + unit(i) * i.quantity, 0)
  const listTotal = cart.total

  const submit = async () => {
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('place_order', {
      p_items: cart.items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
      p_requested_date: date || null,
      p_notes: notes || null,
    })
    if (error) {
      setBusy(false)
      return setError(errMsg(error))
    }
    const order = data as { id: string }
    // aviso por mail al dueño (si falla, el pedido igual quedó guardado)
    supabase.functions.invoke('notify-order', { body: { order_id: order.id, site: appUrl() } }).catch(() => {})
    cart.clear()
    nav(`/pedido/${order.id}?nuevo=1`)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Tu pedido" />
      {cart.items.length === 0 ? (
        <Empty>
          Todavía no agregaste productos. <Link to="/" className="text-brand-700 underline">Ir al catálogo</Link>
        </Empty>
      ) : (
        <div className="space-y-6">
          <div className="card divide-y divide-stone-100">
            {cart.items.map((i) => (
              <div key={i.variant_id} className="flex items-center gap-3 p-3 sm:p-4">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-cream-100">
                  {i.image && <img src={imageUrl(i.image)!} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{i.product_name}</div>
                  <div className="text-sm text-stone-500">{i.label || 'Única'} · {unit(i) < i.price && <span className="mr-1 text-xs line-through">{fmtMoney(i.price)}</span>}{fmtMoney(unit(i))} c/u</div>
                </div>
                <input
                  type="number"
                  min={1}
                  className="input w-24 text-right"
                  value={i.quantity}
                  onChange={(e) => cart.setQty(i.variant_id, parseInt(e.target.value) || 1)}
                />
                <div className="hidden w-28 text-right font-medium sm:block">{fmtMoney(unit(i) * i.quantity)}</div>
                <button onClick={() => cart.remove(i.variant_id)} className="px-1 text-stone-400 hover:text-red-600" aria-label="Quitar">
                  ✕
                </button>
              </div>
            ))}
            <div className="flex justify-between bg-stone-50 p-4">
              <span className="text-stone-600">{fmtNum(cart.count)} unidades</span>
              <span className="text-right">
                {total < listTotal && <span className="block text-xs text-emerald-700">Ahorrás {fmtMoney(listTotal - total)}</span>}
                <span className="text-lg font-semibold">{fmtMoney(total)}</span>
              </span>
            </div>
          </div>

          {!profile ? (
            <Alert kind="info">
              Para enviar el pedido tenés que <Link to="/ingresar" state={{ from: '/pedido' }} className="font-medium underline">ingresar</Link>.
            </Alert>
          ) : !canBuy ? (
            <Alert kind="warn">Tu cuenta está pendiente de habilitación.</Alert>
          ) : (
            <div className="card space-y-4 p-5">
              {error && <Alert>{error}</Alert>}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="¿Para cuándo lo necesitás?" hint="Te confirmamos la fecha de entrega">
                  <input type="date" className="input" min={toISODate(addDays(new Date(), 1))} value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Notas (opcional)">
                  <input className="input" placeholder="Grabado, forma de envío, etc." value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </div>
              <Button onClick={submit} loading={busy} className="w-full sm:w-auto">Enviar pedido</Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
