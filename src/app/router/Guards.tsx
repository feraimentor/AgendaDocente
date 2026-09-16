import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoadingState } from '../../components/ui'
import { useAuth } from '../../features/auth/AuthProvider'
import { useProfile } from '../../features/data/queries'
import { requiresPasswordChange } from '../../features/auth/password'

export function AuthGate() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <main className="centered-page"><LoadingState label="Verificando sessão…" /></main>
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export function ApprovalGate() {
  const { accountStatus, isMaster } = useAuth()
  if (!isMaster && accountStatus === 'pending_approval') {
    return <Navigate to="/pending-approval" replace />
  }
  return <Outlet />
}

export function AdminGate() {
  const { isMaster, isAdmin } = useAuth()
  if (!isMaster && !isAdmin) return <Navigate to="/" replace />
  return <Outlet />
}

export function ProfileGate() {
  const { user } = useAuth()
  const profile = useProfile(user?.id)
  if (profile.isLoading) return <main className="centered-page"><LoadingState label="Preparando sua agenda…" /></main>
  if (profile.isError) return <Navigate to="/onboarding" replace />
  if (!profile.data) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

export function FirstAccessGate() {
  const { user } = useAuth()
  if (requiresPasswordChange(user)) return <Navigate to="/first-access" replace />
  return <Outlet />
}

