import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errMsg, supabase } from '../../lib/supabase'
import { fmtDate, fmtMoney, fmtNum } from '../../lib/format'
import { personName } from '../../lib/data'
import { whatsappLink } from '../../lib/notify'
import type { Order, Profile } from '../../lib/types'
import { Alert, Badge, Button, Empty, Spinner, StatusBadge } from '../../components/ui'

/** Ficha del cliente: datos, descuento, historial y saldo */
export default function ClientPage() {
  const { id } = useParams()
  const [client, setClient] = useState<Profile | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [units, setUnits] = useState(0)
  const [discount, setDiscount] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [c, o] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id!).single(),
      supabase.from('orders').select('*').eq('client_id', id!).eq('kind', 'cliente').order('created_at', { ascending: false }),
    ])
    const os = (o.data as Order[]) ?? []
    const ids = os.filter((x) => x.status !== 'cancelado').map((x) => x.id)
    const { data: it } = ids.length ? await supabase.from('order_items').select('quantity').in('order_id', ids) : { data: [] }
    setUnits((it ?? []).reduce((s, i) => s + i.quantity, 0))
    setClient(c.data as Profile)
    setDiscount(String(Number((c.data as Profile)?.discount_pct ?? 0)))
    setOrders(os)
  }, [id])
  useEffect(() => {
    load()
  }, [load])

  if (!client) return <Spinner />

  const valid = orders.filter((o) => o.status !== 'cancelado')
  const bought = valid.reduce((s, o) => s + Number(o.total), 0)
  const paid = valid.reduce((s, o) => s + Number(o.paid_amount), 0)
  const balance = valid.reduce((s, o) => s + Math.max(0, Number(o.total) - Number(o.paid_amount)), 0)
  const phone = client.phone?.replace(/\D/g, '')

  const save = async (patch: Partial<Profile>, ok: string) => {
    setMsg('')
    setError('')
    const { error } = await supabase.from('profiles').update(patch).eq('id', client.id)
    if (error) return setError(errMsg(error))
    setMsg(ok)
    load()
  }

  return (
    <div className="max-w-4xl">
      <Link to="/admin/equipo" className="mb-2 inline-flex py-1 text-sm text-stone-500 hover:text-stone-800">← Clientes</Link>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl">{client.company || personName(client)}</h1>
          <p className="text-sm text-stone-500">
            {[client.company ? client.full_name : null, client.city, client.cuit && `CUIT ${client.cuit}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        {client.approved ? <Badge color="bg-emerald-100 text-emerald-800">Habilitado</Badge> : <Badge color="bg-amber-100 text-amber-800">Pendiente</Badge>}
      </div>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {msg && <div className="mb-4"><Alert kind="success">{msg}</Alert></div>}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Stat label="Pedidos" value={fmtNum(valid.length)} />
        <Stat label="Unidades" value={fmtNum(units)} />
        <Stat label="Comprado" value={fmtMoney(bought)} />
        <Stat label="Saldo pendiente" value={fmtMoney(balance)} accent={balance > 0} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
        <div className="space-y-4 lg:order-2">
          <div className="card p-4 text-sm">
            <div className="grid grid-cols-3 gap-2">
              {phone && <a href={whatsappLink(phone, `Hola ${client.full_name?.split(' ')[0] ?? ''}! Te escribimos de La Calandria.`)!} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-600 py-2 text-center font-medium text-white">WhatsApp</a>}
              {phone && <a href={`tel:${phone}`} className="rounded-lg border border-stone-300 py-2 text-center font-medium">Llamar</a>}
              {client.email && <a href={`mailto:${client.email}`} className="rounded-lg border border-stone-300 py-2 text-center font-medium">Mail</a>}
            </div>
            <dl className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-stone-600">
              {client.email && <div className="truncate">{client.email}</div>}
              {client.phone && <div>{client.phone}</div>}
              {client.address && <div>{client.address}</div>}
              <div className="text-xs text-stone-400">Cliente desde {fmtDate(client.created_at)} · pagó {fmtMoney(paid)} en total</div>
            </dl>
          </div>

          <div className="card space-y-3 p-4">
            <div>
              <div className="font-medium">Descuento del cliente</div>
              <p className="text-xs text-stone-500">Se aplica a todos sus pedidos nuevos, además de los descuentos por cantidad de cada producto.</p>
            </div>
            <div className="flex items-center gap-2">
              <input className="input w-24 text-right" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              <span className="text-stone-500">%</span>
              <Button
                variant="secondary"
                onClick={() => {
                  const n = Math.min(90, Math.max(0, parseFloat(discount.replace(',', '.')) || 0))
                  save({ discount_pct: n }, n > 0 ? `Descuento de ${n}% guardado` : 'Sin descuento')
                }}
              >
                Guardar
              </Button>
            </div>
          </div>

          <Button
            variant={client.approved ? 'ghost' : 'primary'}
            className="w-full"
            onClick={() => save({ approved: !client.approved }, client.approved ? 'Cliente deshabilitado' : 'Cliente habilitado')}
          >
            {client.approved ? 'Deshabilitar cliente' : 'Habilitar cliente'}
          </Button>
        </div>

        <div className="lg:order-1 lg:col-span-2">
          <h2 className="mb-2 font-display text-lg">Pedidos</h2>
          {orders.length === 0 ? (
            <Empty>Todavía no hizo pedidos.</Empty>
          ) : (
            <div className="card divide-y divide-stone-100">
              {orders.map((o) => {
                const due = Math.max(0, Number(o.total) - Number(o.paid_amount))
                return (
                  <Link key={o.id} to={`/admin/pedidos/${o.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-stone-50 sm:p-4">
                    <div className="min-w-0">
                      <div className="font-medium">#{o.number}</div>
                      <div className="text-xs text-stone-500">{fmtDate(o.created_at)}{o.due_date ? ` · entrega ${fmtDate(o.due_date)}` : ''}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{fmtMoney(o.total)}</div>
                      {o.status !== 'cancelado' && (due > 0 ? <div className="text-xs text-amber-700">debe {fmtMoney(due)}</div> : <div className="text-xs text-emerald-700">pagado ✓</div>)}
                    </div>
                    <StatusBadge status={o.status} />
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-white'}`}>
      <div className="truncate text-lg font-semibold text-stone-900">{value}</div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
  )
}
