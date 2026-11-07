// Avisa por mail al cliente cuando cambia el estado de su pedido.
// Sólo si en Configuración está activado "avisar a los clientes por mail"
// y existe el secreto RESEND_API_KEY. Para mandar a cualquier dirección,
// Resend necesita un dominio propio verificado (MAIL_FROM con ese dominio).
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const money = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const day = (d: string | null) => (d ? d.split('-').reverse().join('/') : '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { order_id, event, amount } = await req.json()
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: u } = await admin.auth.getUser(token)
    if (!u?.user) return json({ error: 'No autorizado' }, 401)
    const { data: me } = await admin.from('profiles').select('role, active').eq('id', u.user.id).single()
    if (me?.role !== 'admin' || !me.active) return json({ error: 'No autorizado' }, 403)

    const { data: settings } = await admin.from('settings').select('*').eq('id', 1).single()
    const key = Deno.env.get('RESEND_API_KEY')
    if (!settings?.notify_clients || !key) return json({ skipped: true })

    const { data: order } = await admin.from('orders').select('*').eq('id', order_id).single()
    if (!order || order.kind !== 'cliente') return json({ skipped: true })
    const { data: client } = await admin.from('profiles').select('*').eq('id', order.client_id).single()
    if (!client?.email) return json({ skipped: true })

    const name = esc(client.full_name?.split(' ')[0] || client.company || '')
    const n = `#${order.number}`
    const texts: Record<string, [string, string]> = {
      confirmado: [`Confirmamos tu pedido ${n}`, `Confirmamos tu pedido ${n}.${order.due_date ? ` La entrega estimada es el <strong>${day(order.due_date)}</strong>.` : ''}`],
      listo: [`Tu pedido ${n} está listo`, `Tu pedido ${n} ya está listo. Respondé este mail o escribinos para coordinar la entrega o el envío.`],
      entregado: [`Pedido ${n} entregado`, `Tu pedido ${n} figura como entregado. ¡Gracias por tu compra!`],
      pago: [`Recibimos tu pago · pedido ${n}`, `Recibimos tu pago${amount ? ` de <strong>${money(Number(amount))}</strong>` : ''} del pedido ${n}. ¡Gracias!`],
    }
    const t = texts[event as string]
    if (!t) return json({ error: 'Evento desconocido' }, 400)

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('MAIL_FROM') ?? 'La Calandria <onboarding@resend.dev>',
        to: [client.email],
        reply_to: settings.notify_email ?? undefined,
        subject: `${t[0]} · La Calandria`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;color:#1c2230">
          <h2 style="color:#0f2242;font-family:Georgia,serif">La Calandria</h2>
          <p>Hola${name ? ` ${name}` : ''}!</p><p>${t[1]}</p>
          <p style="color:#777;font-size:13px">Saludos,<br>La Calandria</p></div>`,
      }),
    })
    if (!r.ok) return json({ error: `Resend: ${await r.text()}` }, 502)
    return json({ sent: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
