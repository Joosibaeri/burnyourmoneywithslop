import { useCallback, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useSupabase } from '@/contexts/SupabaseContext'
import { getDemoGroups, loadGroups } from '@/lib/data'
import { useAsyncData } from './useAsyncData'

export function useGroups(groupId?: string) {
  const { user } = useAuth()
  const { supabase, isDemoMode } = useSupabase()
  const userId = user?.id
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision(value => value + 1), [])

  const load = useCallback(() => isDemoMode
    ? Promise.resolve(getDemoGroups().filter(group => !groupId || group.id === groupId))
    : userId ? loadGroups(supabase, userId, groupId) : Promise.resolve([]), [supabase, isDemoMode, userId, groupId])
  const { data, loading, error } = useAsyncData(`groups:${isDemoMode}:${userId}:${groupId}:${revision}`, load)

  return { groups: data ?? [], loading, error, reload }
}
