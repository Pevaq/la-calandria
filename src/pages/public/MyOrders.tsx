import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { fmtDate, fmtMoney } from '../../lib/format'
import type { Order } from '../../lib/types'
import { Empty, PageHeader, Spinner, StatusBadge } from '../../components/ui'

export default function MyOrders() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState<Order[] | null>(null)
  useEffect(() => {
    if (!profile) return
    supabase
      .from('orders')
      .select('*')
      .eq('client_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setOrders((data as Order[]) ?? []))
  }, [profile])

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Mis pedidos" />
      {!orders ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <Empty>Todavía no hiciste pedidos. <Link to="/" className="text-brand-700 underline">Ver catálogo</Link></Empty>
      ) : (
        <div className="card divide-y divide-stone-100">
          {orders.map((o) => (
            <Link key={o.id} to={`/pedido/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-stone-50">
              <div>
                <div className="font-medium">Pedido #{o.number}</div>
                <div className="text-sm text-stone-500">
                  {fmtDate(o.created_at)} · Entrega {o.due_date ? fmtDate(o.due_date) : 'a confirmar'}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">{fmtMoney(o.total)}</span>
                <StatusBadge status={o.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
