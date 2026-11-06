import type { OrderStatus } from './types'

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })
export const fmtMoney = (n: number | null | undefined) => money.format(Number(n ?? 0))

export const fmtNum = (n: number | null | undefined) => new Intl.NumberFormat('es-AR').format(Number(n ?? 0))

/** Fechas "YYYY-MM-DD" se interpretan como fecha local (sin corrimiento de zona) */
export function parseDate(d: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number)
    return new Date(y, m - 1, day)
  }
  return new Date(d)
}

export function fmtDate(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  if (!d) return '—'
  return parseDate(d).toLocaleDateString('es-AR', opts)
}

export function fmtDay(d: string | null | undefined) {
  if (!d) return '—'
  return parseDate(d).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function startOfWeek(d: Date) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (r.getDay() + 6) % 7 // lunes = 0
  return addDays(r, -dow)
}

export const todayISO = () => toISODate(new Date())

export const STATUS_LABEL: Record<OrderStatus, string> = {
  recibido: 'Recibido',
  pago_confirmado: 'Pago confirmado',
  en_produccion: 'En producción',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

export const STATUS_COLOR: Record<OrderStatus, string> = {
  recibido: 'bg-amber-100 text-amber-800',
  pago_confirmado: 'bg-sky-100 text-sky-800',
  en_produccion: 'bg-violet-100 text-violet-800',
  listo: 'bg-emerald-100 text-emerald-800',
  entregado: 'bg-stone-200 text-stone-700',
  cancelado: 'bg-red-100 text-red-700',
}

export function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
