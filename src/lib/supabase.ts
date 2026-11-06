import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_KEY as string

export const supabase = createClient(url, key)

/** URL absoluta dentro de la app (respeta la subcarpeta si la hay) */
export function appUrl(path = '') {
  return window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '') + path
}

export const IMAGES_BUCKET = 'product-images'

export function imageUrl(path?: string | null) {
  if (!path) return null
  return supabase.storage.from(IMAGES_BUCKET).getPublicUrl(path).data.publicUrl
}

/** Mensaje legible a partir de un error de Supabase */
export function errMsg(e: unknown): string {
  if (!e) return 'Error desconocido'
  if (typeof e === 'string') return e
  const m = (e as { message?: string }).message ?? String(e)
  if (m.includes('Invalid login credentials')) return 'Email o contraseña incorrectos'
  if (m.includes('Email not confirmed')) return 'Tenés que confirmar tu email (revisá tu casilla)'
  if (m.includes('User already registered')) return 'Ya existe una cuenta con ese email'
  if (m.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres'
  if (m.includes('duplicate key') && m.includes('slug')) return 'Ya existe un producto con esa URL (slug)'
  if (m.includes('violates foreign key') && m.includes('product_parts')) return 'Esa parte está usada en algún producto'
  return m
}
