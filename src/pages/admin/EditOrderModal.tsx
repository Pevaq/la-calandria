import { useEffect, useState } from 'react'
import { errMsg, supabase } from '../../lib/supabase'
import { fmtMoney, fmtNum } from '../../lib/format'
import type { Order, OrderItem, Product, Variant } from '../../lib/types'
import { Alert, Button, Icon, Modal } from '../../components/ui'

interface Row {
  variant_id: string
  name: string
  label: string
  quantity: string
  unit_price: string // vacío = precio de lista con descuentos
  list: number
  current?: number
}

/** Cambiar cantidades, precios o productos de un pedido de cliente */
export default function EditOrderModal({
  open, onClose, order, items, doneUnits, onSaved,
}: { open: boolean; onClose: () => void; order: Order; items: OrderItem[]; doneUnits: number; onSaved: (replanned: boolean) => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [variants, setVariants] = useState<Variant[]>([])
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setPick('')
    setRows(
      items
        .filter((i) => i.variant_id)
        .map((i) => ({
          variant_id: i.variant_id!,
          name: i.product_name,
          label: i.variant_label,
          quantity: String(i.quantity),
          unit_price: '',
          list: Number(i.list_price ?? i.unit_price),
          current: Number(i.unit_price),
        })),
    )
    Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('variants').select('*').eq('active', true).order('label'),
    ]).then(([p, v]) => {
      setProducts((p.data as Product[]) ?? [])
      setVariants((v.data as Variant[]) ?? [])
    })
  }, [open, items])

  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const add = () => {
    const v = variants.find((x) => x.id === pick)
    if (!v) return
    const p = products.find((x) => x.id === v.product_id)
    if (rows.some((r) => r.variant_id === v.id)) return setPick('')
    setRows([...rows, { variant_id: v.id, name: p?.name ?? '', label: v.label, quantity: '', unit_price: '', list: Number(v.price) }])
    setPick('')
  }

  const estimate = rows.reduce((s, r) => s + (parseInt(r.quantity) || 0) * (r.unit_price ? parseFloat(r.unit_price.replace(',', '.')) || 0 : (r.current ?? r.list)), 0)

  const save = async () => {
    const payload = rows
      .map((r) => ({
        variant_id: r.variant_id,
        quantity: parseInt(r.quantity) || 0,
        unit_price: r.unit_price.trim() === '' ? null : parseFloat(r.unit_price.replace(',', '.')),
      }))
      .filter((r) => r.quantity > 0)
    if (!payload.length) return setError('El pedido no puede quedar vacío. Si no va más, cancelalo.')
    if (order.confirmed_at && !confirm(
      `Este pedido ya está en producción. Al guardar se borran sus tareas${doneUnits > 0 ? ` (con ${fmtNum(doneUnits)} unidades ya cargadas como hechas)` : ''}, se devuelve el stock usado y vas a tener que volver a confirmarlo. ¿Seguimos?`,
    )) return
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('update_order_items', { p_order_id: order.id, p_items: payload })
    setBusy(false)
    if (error) return setError(errMsg(error))
    onSaved(!!(data as { replanned?: boolean })?.replanned)
  }

  return (
    <Modal open={open} onClose={onClose} title={`Editar pedido #${order.number}`} wide>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {order.confirmed_at && (
          <Alert kind="warn">
            Ya está en producción: si cambiás algo se re-planifica (se borran las tareas y hay que confirmarlo de nuevo).
          </Alert>
        )}
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.variant_id} className="rounded-lg border border-stone-200 p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="text-xs text-stone-500">{r.label || 'Única'} · lista {fmtMoney(r.list)}</div>
                </div>
                <button className="p-1 text-red-600" aria-label="Quitar" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="label">Cantidad</span>
                  <input className="input text-right" type="number" min={0} inputMode="numeric" value={r.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
                </label>
                <label className="block">
                  <span className="label">Precio unitario</span>
                  <input className="input text-right" inputMode="decimal" placeholder={r.current !== undefined ? `auto (hoy ${fmtMoney(r.current)})` : 'automático'} value={r.unit_price} onChange={(e) => set(i, { unit_price: e.target.value })} />
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">+ Agregar producto…</option>
            {products.map((p) => {
              const vs = variants.filter((v) => v.product_id === p.id && !rows.some((r) => r.variant_id === v.id))
              if (!vs.length) return null
              return (
                <optgroup key={p.id} label={p.name}>
                  {vs.map((v) => <option key={v.id} value={v.id}>{v.label || 'Única'} · {fmtMoney(v.price)}</option>)}
                </optgroup>
              )
            })}
          </select>
          <Button variant="secondary" onClick={add} disabled={!pick} className="shrink-0">Agregar</Button>
        </div>
        <p className="text-xs text-stone-500">Si dejás el precio vacío se usa el de lista con los descuentos del cliente y por cantidad.</p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-stone-600">Aprox. {fmtMoney(estimate)}</span>
          <Button onClick={save} loading={busy}>Guardar cambios</Button>
        </div>
      </div>
    </Modal>
  )
}
