// Avisa por mail al dueño cuando entra un pedido nuevo.
// Usa Resend (https://resend.com). Requiere el secreto RESEND_API_KEY.
// Opcional: MAIL_FROM (ej: "La Calandria <pedidos@lacalandria.com.ar>").
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const money = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { order_id } = await req.json()
    if (!order_id) return json({ error: 'Falta order_id' }, 400)

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // quién llama
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: u } = await admin.auth.getUser(token)
    if (!u?.user) return json({ error: 'No autorizado' }, 401)

    const { data: order } = await admin.from('orders').select('*').eq('id', order_id).single()
    if (!order) return json({ error: 'Pedido inexistente' }, 404)
    const { data: caller } = await admin.from('profiles').select('role').eq('id', u.user.id).single()
    if (order.client_id !== u.user.id && caller?.role !== 'admin') return json({ error: 'No autorizado' }, 403)

    const [{ data: items }, { data: client }, { data: settings }] = await Promise.all([
      admin.from('order_items').select('*').eq('order_id', order_id),
      admin.from('profiles').select('*').eq('id', order.client_id).single(),
      admin.from('settings').select('*').eq('id', 1).single(),
    ])

    const to = settings?.notify_email
    const key = Deno.env.get('RESEND_API_KEY')
    if (!to || !key) return json({ skipped: true, reason: !to ? 'Sin email de aviso configurado' : 'Sin RESEND_API_KEY' })

    const site = req.headers.get('origin') ?? ''
    const rows = (items ?? [])
      .map(
        (i: { product_name: string; variant_label: string; quantity: number; unit_price: number }) =>
          `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(i.product_name)}<br><small style="color:#777">${esc(i.variant_label || '')}</small></td>` +
          `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${i.quantity}</td>` +
          `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${money(i.unit_price * i.quantity)}</td></tr>`,
      )
      .join('')
    const who = esc(client?.company || client?.full_name || client?.email || 'Cliente')
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;color:#222">
        <h2 style="color:#2f4a32">Pedido nuevo #${order.number}</h2>
        <p><strong>${who}</strong>${client?.full_name && client?.company ? ` (${esc(client.full_name)})` : ''}<br>
        ${client?.phone ? `Tel: ${esc(client.phone)}<br>` : ''}${client?.email ? `${esc(client.email)}<br>` : ''}
        ${order.requested_date ? `Lo necesita para: <strong>${order.requested_date.split('-').reverse().join('/')}</strong>` : ''}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
          <tr><td style="padding:8px"><strong>Total</strong></td><td></td><td style="padding:8px;text-align:right"><strong>${money(order.total)}</strong></td></tr>
        </table>
        ${order.notes ? `<p style="background:#f6f6f2;padding:8px;border-radius:6px">“${esc(order.notes)}”</p>` : ''}
        ${site ? `<p><a href="${site}/admin/pedidos/${order.id}" style="background:#2f4a32;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ver y confirmar pedido</a></p>` : ''}
      </div>`

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('MAIL_FROM') ?? 'La Calandria <onboarding@resend.dev>',
        to: [to],
        reply_to: client?.email ?? undefined,
        subject: `Pedido nuevo #${order.number} · ${client?.company || client?.full_name || ''}`,
        html,
      }),
    })
    if (!r.ok) return json({ error: `Resend: ${await r.text()}` }, 502)
    return json({ sent: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
