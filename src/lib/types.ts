export type Role = 'admin' | 'worker' | 'client'
export type OrderStatus = 'recibido' | 'pago_confirmado' | 'en_produccion' | 'listo' | 'entregado' | 'cancelado'
export type TaskStatus = 'pendiente' | 'en_curso' | 'hecha'

export interface Profile {
  id: string
  email: string | null
  role: Role
  full_name: string | null
  company: string | null
  phone: string | null
  cuit: string | null
  city: string | null
  address: string | null
  approved: boolean
  active: boolean
  created_at: string
}

export interface Settings {
  id: number
  business_name: string
  bank_alias: string | null
  bank_cbu: string | null
  bank_holder: string | null
  bank_name: string | null
  receipt_email: string | null
  receipt_whatsapp: string | null
  notify_email: string | null
  payment_instructions: string | null
  default_lead_days: number
}

export interface Product {
  id: string
  name: string
  slug: string
  description: string | null
  category: string | null
  published: boolean
  min_qty: number
  sort: number
  created_at: string
}

export interface ProductImage { id: string; product_id: string; path: string; sort: number }
export interface Attribute { id: string; product_id: string; name: string; sort: number }
export interface AttrOption { id: string; attribute_id: string; value: string; sort: number }

export interface Variant {
  id: string
  product_id: string
  sku: string | null
  label: string
  price: number
  stock: number
  active: boolean
  image_path: string | null
  sort: number
}

export interface Part {
  id: string
  name: string
  description: string | null
  unit: string
  stock: number
  active: boolean
}

export interface PartProcess {
  id: string
  part_id: string
  name: string
  step_order: number
  assignee_id: string | null
  lead_days: number
  notes: string | null
}

export interface ProductPart {
  id: string
  product_id: string
  part_id: string
  quantity: number
  condition_option_id: string | null
}

export interface ProductProcess {
  id: string
  product_id: string
  name: string
  part_id: string | null
  condition_option_id: string | null
  step_order: number
  assignee_id: string | null
  lead_days: number
  notes: string | null
}

export interface Order {
  id: string
  number: number
  client_id: string
  status: OrderStatus
  requested_date: string | null
  due_date: string | null
  notes: string | null
  admin_notes: string | null
  total: number
  payment_received: boolean
  created_at: string
  confirmed_at: string | null
}

export interface OrderItem {
  id: string
  order_id: string
  variant_id: string | null
  product_name: string
  variant_label: string
  unit_price: number
  quantity: number
  qty_from_stock: number
}

export interface Task {
  id: string
  order_id: string
  order_item_id: string | null
  assignee_id: string | null
  kind: 'part' | 'product'
  part_id: string | null
  process_name: string
  description: string
  quantity: number
  done_qty: number
  due_date: string | null
  step_order: number
  status: TaskStatus
  created_at: string
  completed_at: string | null
}
