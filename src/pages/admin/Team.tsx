import { useCallback, useEffect, useState } from 'react'
import { errMsg, supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { fmtDate } from '../../lib/format'
import { personName } from '../../lib/data'
import type { Profile, Role } from '../../lib/types'
import { Alert, Badge, Button, Empty, Field, Modal, PageHeader, Spinner, Tabs } from '../../components/ui'


export default function Team() {
  const { profile: me } = useAuth()
  const [people, setPeople] = useState<Profile[] | null>(null)
  const [tab, setTab] = useState<'equipo' | 'clientes'>('equipo')
  const [open, setOpen] = useState<null | 'worker' | 'client'>(null)
  const [pwFor, setPwFor] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setPeople((data as Profile[]) ?? [])
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const upd = async (p: Profile, patch: Partial<Profile>, ok?: string) => {
    setError('')
    setMsg('')
    const { error } = await supabase.from('profiles').update(patch).eq('id', p.id)
    if (error) setError(errMsg(error))
    else if (ok) setMsg(ok)
    load()
  }

  if (!people) return <Spinner />
  const staff = people.filter((p) => p.role !== 'client')
  const clients = people.filter((p) => p.role === 'client')
  const pending = clients.filter((c) => !c.approved && c.active)

  return (
    <div className="max-w-5xl">
      <PageHeader title="Equipo y clientes" />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {msg && <div className="mb-4"><Alert kind="success">{msg}</Alert></div>}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'equipo', label: `Equipo (${staff.length})` },
          { id: 'clientes', label: `Clientes (${clients.length})${pending.length ? ` · ${pending.length} por habilitar` : ''}` },
        ]}
      />

      {tab === 'equipo' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-stone-600">Cada trabajador entra con su email y contraseña y ve sólo sus tareas.</p>
            <Button onClick={() => setOpen('worker')}>+ Agregar trabajador</Button>
          </div>
          <div className="card divide-y divide-stone-100">
            {staff.map((p) => (
              <div key={p.id} className={`space-y-3 p-4 ${p.active ? '' : 'opacity-50'}`}>
                <div className="min-w-0">
                  <div className="font-medium">{personName(p)} {p.id === me?.id && <span className="text-xs text-stone-400">(vos)</span>}</div>
                  <div className="truncate text-xs text-stone-500">{p.email}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input" placeholder="Ciudad" aria-label="Ciudad" defaultValue={p.city ?? ''} onBlur={(e) => e.target.value !== (p.city ?? '') && upd(p, { city: e.target.value || null })} />
                  <select className="input" aria-label="Rol" value={p.role} disabled={p.id === me?.id} onChange={(e) => upd(p, { role: e.target.value as Role }, 'Rol actualizado')}>
                    <option value="worker">Trabajador</option>
                    <option value="admin">Administrador</option>
                    <option value="client">Cliente</option>
                  </select>
                </div>
                {p.id !== me?.id && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setPwFor(p)}>Cambiar contraseña</Button>
                    <Button size="sm" variant={p.active ? 'danger' : 'secondary'} onClick={() => upd(p, { active: !p.active }, p.active ? 'Usuario desactivado' : 'Usuario activado')}>
                      {p.active ? 'Desactivar' : 'Activar'}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'clientes' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-stone-600">Los clientes se registran en la web. Habilitalos para que vean precios y puedan pedir.</p>
            <Button variant="secondary" onClick={() => setOpen('client')}>+ Alta manual</Button>
          </div>
          {clients.length === 0 ? (
            <Empty>Todavía no hay clientes registrados.</Empty>
          ) : (
            <div className="card divide-y divide-stone-100">
              {[...pending, ...clients.filter((c) => !pending.includes(c))].map((c) => (
                <div key={c.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 p-4 ${c.active ? '' : 'opacity-50'} ${!c.approved && c.active ? 'bg-amber-50' : ''}`}>
                  <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                    <div className="font-medium">{c.company || personName(c)}</div>
                    <div className="text-xs text-stone-500">
                      {[c.full_name, c.phone, c.email, c.city, c.cuit && `CUIT ${c.cuit}`].filter(Boolean).join(' · ')}
                    </div>
                    <div className="text-xs text-stone-400">Registrado {fmtDate(c.created_at)}</div>
                  </div>
                  {c.approved ? <Badge color="bg-emerald-100 text-emerald-800">Habilitado</Badge> : <Badge color="bg-amber-100 text-amber-800">Pendiente</Badge>}
                  {c.approved ? (
                    <Button size="sm" variant="ghost" onClick={() => upd(c, { approved: false }, 'Cliente deshabilitado')}>Deshabilitar</Button>
                  ) : (
                    <Button size="sm" onClick={() => upd(c, { approved: true }, 'Cliente habilitado')}>Habilitar</Button>
                  )}
                  {c.phone && (
                    <a className="text-xs text-brand-700 underline" target="_blank" rel="noreferrer" href={`https://wa.me/${c.phone.replace(/\D/g, '')}`}>WhatsApp</a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <NewUserModal kind={open} onClose={() => setOpen(null)} onDone={(m) => { setMsg(m); load() }} />
      <PasswordModal person={pwFor} onClose={() => setPwFor(null)} onDone={() => setMsg('Contraseña actualizada')} />
    </div>
  )
}

function NewUserModal({ kind, onClose, onDone }: { kind: null | 'worker' | 'client'; onClose: () => void; onDone: (m: string) => void }) {
  const empty = { full_name: '', email: '', password: '', company: '', phone: '', city: '' }
  const [f, setF] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setF(empty)
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])
  if (!kind) return null
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    setBusy(true)
    setError('')
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'create', role: kind, ...f, email: f.email.trim() },
    })
    setBusy(false)
    const err = error ? await functionError(error) : (data as { error?: string })?.error
    if (err) return setError(err)
    onDone(kind === 'worker' ? `Listo. ${f.full_name} ya puede entrar con ${f.email}` : 'Cliente creado y habilitado')
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={kind === 'worker' ? 'Nuevo trabajador' : 'Nuevo cliente'}>
      <div className="grid gap-3">
        {error && <Alert>{error}</Alert>}
        {kind === 'client' && <Field label="Comercio"><input className="input" value={f.company} onChange={set('company')} /></Field>}
        <Field label="Nombre"><input className="input" value={f.full_name} onChange={set('full_name')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Teléfono"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Ciudad"><input className="input" value={f.city} onChange={set('city')} placeholder={kind === 'worker' ? 'Pergamino / Rosario' : ''} /></Field>
        </div>
        <Field label="Email"><input type="email" className="input" value={f.email} onChange={set('email')} /></Field>
        <Field label="Contraseña inicial" hint="Pasásela por WhatsApp; la puede cambiar después."><input className="input" value={f.password} onChange={set('password')} /></Field>
        <div className="flex justify-end">
          <Button onClick={save} loading={busy} disabled={!f.email || f.password.length < 6 || !(f.full_name || f.company)}>Crear</Button>
        </div>
      </div>
    </Modal>
  )
}

function PasswordModal({ person, onClose, onDone }: { person: Profile | null; onClose: () => void; onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!person) return null
  const save = async () => {
    setBusy(true)
    setError('')
    const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'set_password', user_id: person.id, password: pw } })
    setBusy(false)
    const err = error ? await functionError(error) : (data as { error?: string })?.error
    if (err) return setError(err)
    setPw('')
    onDone()
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Nueva contraseña · ${personName(person)}`}>
      <div className="space-y-3">
        {error && <Alert>{error}</Alert>}
        <Field label="Contraseña" hint="Mínimo 6 caracteres"><input className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <div className="flex justify-end"><Button onClick={save} loading={busy} disabled={pw.length < 6}>Guardar</Button></div>
      </div>
    </Modal>
  )
}

async function functionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const j = await ctx.json()
      if (j?.error) return j.error
    } catch {
      /* sin cuerpo */
    }
  }
  return errMsg(error)
}
