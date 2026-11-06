import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Profile } from './types'

/** Personal (admin + trabajadores) activo, para asignar procesos y tareas */
export function useStaff() {
  const [staff, setStaff] = useState<Profile[]>([])
  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').in('role', ['admin', 'worker']).eq('active', true).order('full_name')
    setStaff((data as Profile[]) ?? [])
  }, [])
  useEffect(() => {
    load()
  }, [load])
  return staff
}

export const personName = (p?: Pick<Profile, 'full_name' | 'email' | 'company'> | null) =>
  p ? p.full_name || p.company || p.email || 'Sin nombre' : 'Sin asignar'
