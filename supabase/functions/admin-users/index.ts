// Alta de trabajadores / clientes y cambio de contraseña, sólo para administradores.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: u } = await admin.auth.getUser(token)
    if (!u?.user) return json({ error: 'No autorizado' }, 401)
    const { data: me } = await admin.from('profiles').select('role, active').eq('id', u.user.id).single()
    if (me?.role !== 'admin' || !me.active) return json({ error: 'Sólo un administrador puede hacer esto' }, 403)

    const body = await req.json()

    if (body.action === 'create') {
      const role = body.role === 'client' ? 'client' : body.role === 'admin' ? 'admin' : 'worker'
      if (!body.email || !body.password || String(body.password).length < 6) return json({ error: 'Email y contraseña (mín. 6) son obligatorios' }, 400)
      const meta = {
        full_name: body.full_name || null,
        company: body.company || null,
        phone: body.phone || null,
        city: body.city || null,
      }
      const { data, error } = await admin.auth.admin.createUser({
        email: String(body.email).trim(),
        password: String(body.password),
        email_confirm: true,
        user_metadata: meta,
      })
      if (error) {
        const m = error.message.includes('already') ? 'Ya existe un usuario con ese email' : error.message
        return json({ error: m }, 400)
      }
      await admin.from('profiles').update({ role, approved: true, ...meta }).eq('id', data.user.id)
      return json({ id: data.user.id })
    }

    if (body.action === 'set_password') {
      if (!body.user_id || String(body.password ?? '').length < 6) return json({ error: 'Contraseña inválida' }, 400)
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: String(body.password) })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Acción desconocida' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
