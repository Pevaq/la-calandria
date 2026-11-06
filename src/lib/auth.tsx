import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from './types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
  isAdmin: boolean
  isStaff: boolean
  canBuy: boolean
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  // usuario de la sesión vigente: descarta respuestas de perfil que llegan tarde de una sesión anterior
  const currentUser = useRef<string | null>(null)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    if (currentUser.current !== s.user.id) return
    setProfile((data as Profile) ?? null)
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      currentUser.current = data.session?.user.id ?? null
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      currentUser.current = s?.user.id ?? null
      setSession(s)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // si cambió el usuario, se descarta el perfil anterior para no redirigir con el rol equivocado
        setProfile((prev) => (prev && prev.id === s?.user.id ? prev : null))
        // diferido para no bloquear el callback de auth
        setTimeout(() => loadProfile(s), 0)
      }
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const refresh = useCallback(() => loadProfile(session), [loadProfile, session])
  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const active = !!profile?.active
  const isAdmin = active && profile?.role === 'admin'
  const isStaff = active && (profile?.role === 'admin' || profile?.role === 'worker')
  const canBuy = active && (isStaff || !!profile?.approved)

  return (
    <Ctx.Provider value={{ session, profile, loading, refresh, signOut, isAdmin, isStaff, canBuy }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth fuera de AuthProvider')
  return c
}

export function homeFor(p: Profile | null) {
  if (!p) return '/'
  if (p.role === 'admin') return '/admin'
  if (p.role === 'worker') return '/trabajo'
  return '/'
}
