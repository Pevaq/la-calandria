import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export interface CartItem {
  variant_id: string
  product_id: string
  product_name: string
  label: string
  price: number
  quantity: number
  image?: string | null
}

interface CartState {
  items: CartItem[]
  add: (item: CartItem) => void
  setQty: (variantId: string, qty: number) => void
  remove: (variantId: string) => void
  clear: () => void
  count: number
  total: number
}

const KEY = 'lacalandria.cart'
const Ctx = createContext<CartState | null>(null)

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as CartItem[]) : []
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items))
    } catch {
      /* sin storage: el carrito vive sólo en memoria */
    }
  }, [items])

  const add = (item: CartItem) =>
    setItems((prev) => {
      const ex = prev.find((i) => i.variant_id === item.variant_id)
      if (ex) return prev.map((i) => (i.variant_id === item.variant_id ? { ...i, quantity: i.quantity + item.quantity } : i))
      return [...prev, item]
    })
  const setQty = (variantId: string, qty: number) =>
    setItems((prev) => prev.map((i) => (i.variant_id === variantId ? { ...i, quantity: Math.max(1, qty) } : i)))
  const remove = (variantId: string) => setItems((prev) => prev.filter((i) => i.variant_id !== variantId))
  const clear = () => setItems([])

  const count = items.reduce((s, i) => s + i.quantity, 0)
  const total = items.reduce((s, i) => s + i.quantity * i.price, 0)

  return <Ctx.Provider value={{ items, add, setQty, remove, clear, count, total }}>{children}</Ctx.Provider>
}

export function useCart() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useCart fuera de CartProvider')
  return c
}
