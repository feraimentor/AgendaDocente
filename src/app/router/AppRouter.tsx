import { Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../layouts/AppShell'
import { AdminGate, ApprovalGate, AuthGate, FirstAccessGate, ProfileGate } from './Guards'
import { FirstAccessPage, ForgotPasswordPage, LoginPage, ResetPasswordPage } from '../../features/auth/AuthPages'
import { PendingApprovalPage } from '../../features/auth/PendingApprovalPage'
import { OnboardingPage } from '../../features/onboarding/OnboardingPage'
import { WorkspaceProvider } from '../providers/WorkspaceProvider'
import { ErrorBoundary, LoadingState } from '../../components/ui'
import { lazyWithRetry } from '../../lib/utils/lazyWithRetry'
import { NotFoundPage } from '../../features/misc/NotFoundPage'

const DashboardPage = lazyWithRetry(() =>
  import('../../features/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage }))
)
const AgendaPage = lazyWithRetry(() =>
  import('../../features/agenda/AgendaPage').then((module) => ({ default: module.AgendaPage }))
)
const ActionsPage = lazyWithRetry(() =>
  import('../../features/actions/ActionsPage').then((module) => ({ default: module.ActionsPage }))
)
const ClassesPage = lazyWithRetry(() =>
  import('../../features/classes/ClassesPages').then((module) => ({ default: module.ClassesPage }))
)
const ClassDetailPage = lazyWithRetry(() =>
  import('../../features/classes/ClassesPages').then((module) => ({ default: module.ClassDetailPage }))
)
const ImportsPage = lazyWithRetry(() =>
  import('../../features/imports/ImportsPages').then((module) => ({ default: module.ImportsPage }))
)
const NewImportPage = lazyWithRetry(() =>
  import('../../features/imports/ImportsPages').then((module) => ({ default: module.NewImportPage }))
)
const ImportDetailPage = lazyWithRetry(() =>
  import('../../features/imports/ImportsPages').then((module) => ({ default: module.ImportDetailPage }))
)
const SettingsPage = lazyWithRetry(() =>
  import('../../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage }))
)
const AdminUsersPage = lazyWithRetry(() =>
  import('../../features/admin/AdminUsersPage').then((module) => ({ default: module.AdminUsersPage }))
)
const AdminIntegrationsPage = lazyWithRetry(() =>
  import('../../features/admin/AdminIntegrationsPage').then((module) => ({ default: module.AdminIntegrationsPage }))
)

export function AppRouter() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<LoadingState label="Abrindo sua agenda…" />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            <Route element={<AuthGate />}>
              <Route path="/pending-approval" element={<PendingApprovalPage />} />
              <Route path="/first-access" element={<FirstAccessPage />} />

              <Route element={<ApprovalGate />}>
                <Route element={<FirstAccessGate />}>
                  <Route path="/onboarding" element={<OnboardingPage />} />

                  <Route element={<ProfileGate />}>
                    <Route
                      element={
                        <WorkspaceProvider>
                          <AppShell />
                        </WorkspaceProvider>
                      }
                    >
                      <Route index element={<DashboardPage />} />
                      <Route path="agenda" element={<AgendaPage />} />
                      <Route path="actions" element={<ActionsPage />} />
                      <Route path="classes" element={<ClassesPage />} />
                      <Route path="classes/:classId" element={<ClassDetailPage />} />
                      <Route path="imports" element={<ImportsPage />} />
                      <Route path="imports/new" element={<NewImportPage />} />
                      <Route path="imports/:importId" element={<ImportDetailPage />} />
                      <Route path="settings" element={<SettingsPage />} />

                      <Route element={<AdminGate />}>
                        <Route path="admin/users" element={<AdminUsersPage />} />
                        <Route path="admin/integrations" element={<AdminIntegrationsPage />} />
                      </Route>

                      <Route path="*" element={<NotFoundPage />} />
                    </Route>
                  </Route>
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
