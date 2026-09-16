import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import type { AccountStatus, UserRole } from '../../types/domain'

interface AuthValue {
  session: Session | null
  user: User | null
  loading: boolean
  roles: UserRole[]
  accountStatus: AccountStatus
  isMaster: boolean
  isAdmin: boolean
  isProfessor: boolean
  isMentor: boolean
  signOut: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  refetchPermissions: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [roles, setRoles] = useState<UserRole[]>(['professor'])
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('active')

  const fetchUserPermissions = useCallback(async (userId: string, email?: string | null) => {
    if (!supabase) return
    try {
      const [rolesResult, profileResult] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', userId),
        supabase.from('profiles').select('account_status').eq('id', userId).maybeSingle(),
      ])

      let nextRoles: UserRole[] = []
      if (rolesResult.data && rolesResult.data.length > 0) {
        nextRoles = rolesResult.data.map((r: { role: string }) => r.role as UserRole)
      } else if (email === 'feraimentor@gmail.com') {
        nextRoles = ['master', 'professor']
      } else {
        nextRoles = ['professor']
      }
      setRoles(nextRoles)

      if (profileResult.data?.account_status) {
        setAccountStatus(profileResult.data.account_status as AccountStatus)
      } else if (email === 'feraimentor@gmail.com') {
        setAccountStatus('active')
      } else {
        setAccountStatus('active')
      }
    } catch (err) {
      console.warn('Erro ao carregar permissões do usuário:', err)
    }
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true
    void (async () => {
      const { data } = await supabase.auth.getSession()
      let nextSession = data.session

      if (nextSession) {
        const { error } = await supabase.auth.getUser()
        if (error) {
          await supabase.auth.signOut({ scope: 'local' })
          nextSession = null
        } else {
          nextSession = (await supabase.auth.getSession()).data.session
        }
      }

      if (active) {
        setSession(nextSession)
        if (nextSession?.user) {
          await fetchUserPermissions(nextSession.user.id, nextSession.user.email)
        }
        setLoading(false)
      }
    })()

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) {
        void fetchUserPermissions(nextSession.user.id, nextSession.user.email)
      }
      setLoading(false)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [fetchUserPermissions])

  const refetchPermissions = useCallback(async () => {
    if (session?.user) {
      await fetchUserPermissions(session.user.id, session.user.email)
    }
  }, [fetchUserPermissions, session?.user])

  const isMaster = useMemo(() => roles.includes('master'), [roles])
  const isAdmin = useMemo(() => isMaster || roles.includes('admin'), [isMaster, roles])
  const isProfessor = useMemo(() => roles.includes('professor') || isMaster, [isMaster, roles])
  const isMentor = useMemo(() => roles.includes('mentor') || isMaster, [isMaster, roles])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error('Supabase não inicializado')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
    if (error) throw error
  }, [])

  const value = useMemo<AuthValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    roles,
    accountStatus,
    isMaster,
    isAdmin,
    isProfessor,
    isMentor,
    signOut: async () => {
      if (supabase) await supabase.auth.signOut()
    },
    signInWithGoogle,
    refetchPermissions,
  }), [session, loading, roles, accountStatus, isMaster, isAdmin, isProfessor, isMentor, signInWithGoogle, refetchPermissions])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return context
}
