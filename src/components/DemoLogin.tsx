import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { errMsg, supabase } from '../lib/supabase'
import { homeFor, useAuth } from '../lib/auth'
import { DEMO_PASSWORD, DEMO_USERS } from '../lib/demo'
import type { Profile } from '../lib/types'
import { Alert, Icon } from './ui'

const GROUP_STYLE: Record<string, string> = {
  Dueño: 'bg-brand-700 text-white',
  Equipo: 'bg-cream-100 text-brand-900',
  Clientes: 'bg-white text-stone-900 border border-stone-200',
}

/** Elegir con quién entrar, con un toque (sólo etapa de pruebas) */
export default function DemoLogin() {
  const { profile } = useAuth()
  const nav = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const enter = async (email: string) => {
    setBusy(email)
    setError('')
    if (profile) await supabase.auth.signOut()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
    if (error) {
      setBusy(null)
      return setError(errMsg(error))
    }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', data.user.id).single()
    setBusy(null)
    nav(homeFor(p as Profile), { replace: true })
  }

  return (
    <div className="space-y-5">
      {error && <Alert>{error}</Alert>}
      {(['Dueño', 'Equipo', 'Clientes'] as const).map((g) => (
        <section key={g}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">{g}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {DEMO_USERS.filter((u) => u.group === g).map((u) => {
              const current = profile?.email === u.email
              return (
                <button
                  key={u.email}
                  onClick={() => enter(u.email)}
                  disabled={!!busy}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-60 ${GROUP_STYLE[g]} ${current ? 'ring-2 ring-leather-500' : ''}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{u.name}{current && ' · actual'}</span>
                    <span className="block truncate text-xs opacity-75">{u.detail}</span>
                  </span>
                  {busy === u.email ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Icon name="chevron" className="h-4 w-4 opacity-60" />
                  )}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
