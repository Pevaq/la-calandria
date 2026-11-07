import { supabase } from './supabase'
import { fmtDay, fmtMoney } from './format'
import type { Order, Profile } from './types'

export type ClientEvent = 'confirmado' | 'listo' | 'entregado' | 'pago' | 'estado'

/** Texto del aviso al cliente según lo que pasó con su pedido */
export function clientMessage(order: Order, client: Profile | null, event: ClientEvent, extra?: { amount?: number }) {
  const name = client?.full_name?.split(' ')[0] || client?.company || ''
  const hola = `Hola${name ? ` ${name}` : ''}! Te escribimos de La Calandria.`
  const n = `#${order.number}`
  switch (event) {
    case 'confirmado':
      return `${hola} Confirmamos tu pedido ${n}${order.due_date ? `: la entrega estimada es el ${fmtDay(order.due_date)}` : ''}. ¡Gracias!`
    case 'listo':
      return `${hola} Tu pedido ${n} ya está listo. ¿Coordinamos la entrega o el envío?`
    case 'entregado':
      return `${hola} Tu pedido ${n} figura como entregado. ¡Gracias por tu compra!`
    case 'pago':
      return `${hola} Recibimos tu pago${extra?.amount ? ` de ${fmtMoney(extra.amount)}` : ''} del pedido ${n}. ¡Gracias!`
    default: {
      const saldo = Math.max(0, Number(order.total) - Number(order.paid_amount))
      if (order.status === 'listo') return clientMessage(order, client, 'listo')
      if (order.status === 'entregado') return clientMessage(order, client, 'entregado')
      if (order.confirmed_at) return `${hola} Tu pedido ${n} está en producción${order.due_date ? `, con entrega estimada el ${fmtDay(order.due_date)}` : ''}.${saldo > 0 ? ` Saldo pendiente: ${fmtMoney(saldo)}.` : ''}`
      return `${hola} Te escribo por el pedido ${n}.`
    }
  }
}

export function whatsappLink(phone: string | null | undefined, text: string) {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

/** Mail automático al cliente (sólo si está activado en Configuración y Resend está configurado) */
export function notifyClientByMail(orderId: string, event: ClientEvent, amount?: number) {
  supabase.functions.invoke('notify-client', { body: { order_id: orderId, event, amount } }).catch(() => {})
}
