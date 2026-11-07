import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { appUrl, errMsg, supabase } from '../../lib/supabase'
import { Alert, Button, Field } from '../../components/ui'

export default function Register() {
  const [f, setF] = useState({ company: '', full_name: '', phone: '', cuit: '', city: '', address: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState<'confirm' | 'pending' | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { email, password, ...meta } = f
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: meta, emailRedirectTo: appUrl('/ingresar') },
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setDone(data.session ? 'pending' : 'confirm')
  }

  if (done)
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <h1 className="mb-3 font-display text-3xl font-semibold">¡Gracias por registrarte!</h1>
        {done === 'confirm' ? (
          <p className="text-stone-600">Te mandamos un mail para confirmar tu dirección. Después, revisamos tu cuenta y la habilitamos para que veas precios y hagas pedidos.</p>
        ) : (
          <p className="text-stone-600">Vamos a revisar tu cuenta y habilitarla para que veas precios y hagas pedidos. Te avisamos.</p>
        )}
        <Link to="/" className="mt-6 inline-block text-brand-700 underline">Ir al catálogo</Link>
      </div>
    )

  return (
    <div className="mx-auto max-w-lg py-6">
      <h1 className="mb-2 font-display text-3xl font-semibold">Cuenta mayorista</h1>
      <p className="mb-6 text-sm text-stone-600">Completá tus datos. Revisamos cada cuenta antes de habilitarla.</p>
      <form onSubmit={submit} className="card grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
        {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
        <Field label="Comercio / razón social" className="sm:col-span-2">
          <input required className="input" value={f.company} onChange={set('company')} />
        </Field>
        <Field label="Nombre y apellido">
          <input required className="input" value={f.full_name} onChange={set('full_name')} autoComplete="name" />
        </Field>
        <Field label="Teléfono / WhatsApp">
          <input required className="input" value={f.phone} onChange={set('phone')} autoComplete="tel" />
        </Field>
        <Field label="CUIT (opcional)">
          <input className="input" value={f.cuit} onChange={set('cuit')} />
        </Field>
        <Field label="Ciudad">
          <input className="input" value={f.city} onChange={set('city')} />
        </Field>
        <Field label="Dirección de entrega (opcional)" className="sm:col-span-2">
          <input className="input" value={f.address} onChange={set('address')} />
        </Field>
        <Field label="Email">
          <input type="email" required className="input" value={f.email} onChange={set('email')} autoComplete="email" />
        </Field>
        <Field label="Contraseña" hint="Mínimo 6 caracteres">
          <input type="password" required minLength={6} className="input" value={f.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        <Button type="submit" loading={busy} className="sm:col-span-2">Crear cuenta</Button>
      </form>
    </div>
  )
}
