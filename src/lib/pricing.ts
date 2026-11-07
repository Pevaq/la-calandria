import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import type { ProductDiscount } from './types'

/**
 * Precio para el cliente que está viendo la tienda.
 * Misma cuenta que hace la base al guardar el pedido (calc_unit_price):
 * descuento por cantidad del producto (el mayor que aplique) y descuento del cliente, uno sobre otro.
 */
export function usePricing(productIds: string[]) {
  const { profile, canBuy } = useAuth()
  const [tiers, setTiers] = useState<ProductDiscount[]>([])
  const key = productIds.slice().sort().join(',')

  useEffect(() => {
    let alive = true
    if (!canBuy || !key) {
      setTiers([])
      return
    }
    supabase
      .from('product_discounts')
      .select('*')
      .in('product_id', key.split(','))
      .order('min_qty')
      .then(({ data }) => alive && setTiers((data as ProductDiscount[]) ?? []))
    return () => {
      alive = false
    }
  }, [key, canBuy])

  // el descuento personal sólo vale para clientes (el personal ve precios de lista)
  const clientPct = profile?.role === 'client' ? Number(profile.discount_pct ?? 0) : 0

  const tiersFor = (productId: string) => tiers.filter((t) => t.product_id === productId)

  const discountPct = (productId: string, productQty: number) => {
    const tier = Math.max(0, ...tiersFor(productId).filter((t) => t.min_qty <= productQty).map((t) => Number(t.pct)))
    return Math.round(100 * (1 - (1 - tier / 100) * (1 - clientPct / 100)) * 100) / 100
  }

  const unitPrice = (list: number, productId: string, productQty: number) =>
    Math.round(list * (1 - discountPct(productId, productQty) / 100) * 100) / 100

  return { tiersFor, discountPct, unitPrice, clientPct }
}
