import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { errMsg, supabase } from '../../../lib/supabase'
import { fmtMoney } from '../../../lib/format'
import type { Product, Profile, Variant } from '../../../lib/types'
import { Alert, Button, Field, Modal } from '../../../components/ui'
import { personName } from '../../../lib/data'

/** Para cargar a mano un pedido que llegó por WhatsApp o teléfono */
export default function NewOrderModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const nav = useNavigate()
  const [clients, setClients] = useState<Profile[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [variants, setVariants] = useState<Variant[]>([])
  const [client, setClient] = useState('')
  const [qty, setQty] = useState<Record<string, string>>({})
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    ;(async () => {
      const [c, p, v] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'client').eq('active', true).order('company'),
        supabase.from('products').select('*').order('name'),
        supabase.from('variants').select('*').eq('active', true).order('label'),
      ])
      setClients((c.data as Profile[]) ?? [])
      setProducts((p.data as Product[]) ?? [])
      setVariants((v.data as Variant[]) ?? [])
    })()
  }, [open])

  const total = variants.reduce((s, v) => s + (parseInt(qty[v.id] || '0') || 0) * Number(v.price), 0)

  const submit = async () => {
    setError('')
    if (!client) return setError('Elegí el cliente')
    const items = Object.entries(qty)
      .map(([variant_id, q]) => ({ variant_id, quantity: parseInt(q) || 0 }))
      .filter((i) => i.quantity > 0)
    if (!items.length) return setError('Cargá al menos una cantidad')
    setBusy(true)
    const { data, error } = await supabase.rpc('place_order', {
      p_items: items,
      p_requested_date: date || null,
      p_notes: notes || null,
      p_client_id: client,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setQty({})
    setNotes('')
    setDate('')
    onCreated()
    onClose()
    nav(`/admin/pedidos/${(data as { id: string }).id}`)
  }

  const shown = products.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <Modal open={open} onClose={onClose} title="Cargar pedido" wide>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Cliente">
            <select className="input" value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="">Elegir…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company ? `${c.company} — ${personName(c)}` : personName(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fecha pedida">
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {clients.length === 0 && <Alert kind="info">No hay clientes todavía. Los clientes se registran desde la web (o los podés dar de alta en Equipo y clientes).</Alert>}
        <input className="input" placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-stone-200 p-3">
          {shown.map((p) => {
            const vs = variants.filter((v) => v.product_id === p.id)
            if (!vs.length) return null
            return (
              <div key={p.id}>
                <div className="mb-1 text-sm font-medium">{p.name}</div>
                {vs.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 py-0.5 text-sm">
                    <span className="flex-1 text-stone-600">{v.label || 'Única'}</span>
                    <span className="w-24 text-right text-stone-500">{fmtMoney(v.price)}</span>
                    <input type="number" min={0} className="input w-24 py-1 text-right" placeholder="0" value={qty[v.id] ?? ''} onChange={(e) => setQty({ ...qty, [v.id]: e.target.value })} />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
        <Field label="Notas">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex items-center justify-between">
          <span className="font-medium">Total: {fmtMoney(total)}</span>
          <Button onClick={submit} loading={busy}>Crear pedido</Button>
        </div>
      </div>
    </Modal>
  )
}
