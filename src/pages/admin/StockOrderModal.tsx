import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { errMsg, supabase } from '../../lib/supabase'
import { addDays, fmtNum, toISODate } from '../../lib/format'
import type { Part, Product, Variant } from '../../lib/types'
import { Alert, Button, Field, Modal, Tabs } from '../../components/ui'

/** Orden de producción interna: lo que se termina se suma solo al stock */
export default function StockOrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const [tab, setTab] = useState<'productos' | 'partes'>('productos')
  const [products, setProducts] = useState<Product[]>([])
  const [variants, setVariants] = useState<Variant[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [qty, setQty] = useState<Record<string, string>>({})
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setQty({})
    setNotes('')
    setError('')
    setDate(toISODate(addDays(new Date(), 7)))
    Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('variants').select('*').eq('active', true).order('label'),
      supabase.from('parts').select('*').eq('active', true).order('name'),
    ]).then(([p, v, pa]) => {
      setProducts((p.data as Product[]) ?? [])
      setVariants((v.data as Variant[]) ?? [])
      setParts((pa.data as Part[]) ?? [])
    })
  }, [open])

  const count = Object.values(qty).reduce((s, q) => s + (parseInt(q) || 0), 0)

  const save = async () => {
    const items = Object.entries(qty)
      .map(([key, q]) => {
        const [kind, id] = key.split(':')
        return { [kind === 'p' ? 'part_id' : 'variant_id']: id, quantity: parseInt(q) || 0 }
      })
      .filter((i) => i.quantity > 0)
    if (!items.length) return setError('Cargá al menos una cantidad')
    if (!date) return setError('Elegí para cuándo')
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('create_stock_order', { p_items: items, p_due_date: date, p_notes: notes || null })
    setBusy(false)
    if (error) return setError(errMsg(error))
    onClose()
    nav(`/admin/pedidos/${(data as { id: string }).id}`)
  }

  const qtyInput = (key: string) => (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      className="input w-24 py-1 text-right"
      placeholder="0"
      value={qty[key] ?? ''}
      onChange={(e) => setQty({ ...qty, [key]: e.target.value })}
    />
  )

  return (
    <Modal open={open} onClose={onClose} title="Producir para stock" wide>
      <div className="space-y-4">
        <p className="text-sm text-stone-600">
          Se generan las tareas como en un pedido. Cuando se terminan todas, lo producido se <strong>suma solo al stock</strong>.
        </p>
        {error && <Alert>{error}</Alert>}
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'productos', label: 'Productos terminados' }, { id: 'partes', label: 'Partes sueltas' }]} />
        <div className="max-h-72 space-y-3 overflow-y-auto">
          {tab === 'productos' &&
            products.map((p) => {
              const vs = variants.filter((v) => v.product_id === p.id)
              if (!vs.length) return null
              return (
                <div key={p.id}>
                  <div className="mb-1 text-sm font-medium">{p.name}</div>
                  {vs.map((v) => (
                    <div key={v.id} className="flex items-center gap-2 py-0.5 text-sm">
                      <span className="flex-1 text-stone-600">{v.label || 'Única'}</span>
                      <span className="text-xs text-stone-400">stock {fmtNum(v.stock)}</span>
                      {qtyInput(`v:${v.id}`)}
                    </div>
                  ))}
                </div>
              )
            })}
          {tab === 'partes' &&
            parts.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-0.5 text-sm">
                <span className="flex-1 font-medium">{p.name}</span>
                <span className="text-xs text-stone-400">stock {fmtNum(p.stock)}</span>
                {qtyInput(`p:${p.id}`)}
              </div>
            ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Para cuándo"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Nota (opcional)"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: stock para temporada" /></Field>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-stone-600">{count > 0 ? `${fmtNum(count)} unidades` : ''}</span>
          <Button onClick={save} loading={busy}>Generar producción</Button>
        </div>
      </div>
    </Modal>
  )
}
