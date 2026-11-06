import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { appUrl, errMsg, supabase } from '../../lib/supabase'
import { homeFor, useAuth } from '../../lib/auth'
import { Alert, Button, Field } from '../../components/ui'
import DemoLogin from '../../components/DemoLogin'
import { DEMO_LOGIN } from '../../lib/demo'

export default function Login() {
  const { profile } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const from = (loc.state as { from?: string } | null)?.from
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (profile) nav(from || homeFor(profile), { replace: true })
  }, [profile, from, nav])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(errMsg(error))
  }

  const reset = async () => {
    if (!email) return setError('Escribí tu email y volvé a tocar "Olvidé mi contraseña"')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl('/ingresar') })
    if (error) setError(errMsg(error))
    else setInfo('Te mandamos un mail para cambiar la contraseña.')
  }

  return (
    <div className={`mx-auto py-6 ${DEMO_LOGIN ? "max-w-2xl" : "max-w-sm"}`}>
      {DEMO_LOGIN && (
        <div className="mb-8">
          <h1 className="mb-1 font-display text-3xl font-semibold">Entrar como…</h1>
          <p className="mb-4 text-sm text-stone-600">Modo prueba: tocá un usuario y entrás directo.</p>
          <DemoLogin />
          <div className="mt-6 border-t border-stone-200 pt-6 text-sm text-stone-500">O con email y contraseña:</div>
        </div>
      )}
      <h1 className={`mb-6 font-display text-3xl font-semibold ${DEMO_LOGIN ? 'hidden' : ''}`}>Ingresar</h1>
      <form onSubmit={submit} className="card space-y-4 p-6">
        {error && <Alert>{error}</Alert>}
        {info && <Alert kind="success">{info}</Alert>}
        <Field label="Email">
          <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Contraseña">
          <input type="password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <Button type="submit" loading={busy} className="w-full">Ingresar</Button>
        <button type="button" onClick={reset} className="w-full text-center text-xs text-stone-500 hover:text-stone-800">
          Olvidé mi contraseña
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-stone-600">
        ¿Sos mayorista y no tenés cuenta? <Link to="/registro" className="font-medium text-brand-700 underline">Registrate</Link>
      </p>
    </div>
  )
}
