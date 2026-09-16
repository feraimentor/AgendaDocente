import { useEffect, useState } from 'react'
import {
  CalendarDays, CheckSquare2, ChevronDown, GraduationCap, Home, Import, LogOut, Menu, Network, Settings, ShieldCheck, UserCheck, UsersRound,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Button } from '../../components/ui'
import { useAuth } from '../../features/auth/AuthProvider'
import { useClasses, useCycles, useProfile } from '../../features/data/queries'
import { useWorkspace } from '../providers/WorkspaceProvider'
import { requireSupabase } from '../../lib/supabase/client'

const primary = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/actions', label: 'Ações', icon: CheckSquare2 },
  { to: '/classes', label: 'Turmas', icon: UsersRound },
]
const system = [
  { to: '/imports', label: 'Importações', icon: Import },
  { to: '/settings', label: 'Configurações', icon: Settings },
]

export function AppShell() {
  const { user, signOut, isMaster, isAdmin } = useAuth()
  const profile = useProfile(user?.id)
  const cycles = useCycles()
  const { selectedCycleId, setSelectedCycleId, selectedClassId, setSelectedClassId } = useWorkspace()
  const classes = useClasses(selectedCycleId)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string>()
  const appName = import.meta.env.VITE_APP_NAME || 'Agenda Docente'

  useEffect(() => {
    if (!profile.data?.avatar_path) {
      setAvatarUrl(undefined)
      return
    }
    let active = true
    void requireSupabase()
      .storage.from('avatars')
      .createSignedUrl(profile.data.avatar_path, 3600)
      .then(({ data }) => {
        if (active && data?.signedUrl) setAvatarUrl(data.signedUrl)
      })
    return () => {
      active = false
    }
  }, [profile.data?.avatar_path])

  const adminNav = isMaster
    ? [
        { to: '/admin/users', label: 'Gestão Docente', icon: UserCheck },
        { to: '/admin/integrations', label: 'Conectores API', icon: Network },
      ]
    : isAdmin
    ? [{ to: '/admin/integrations', label: 'Conectores API', icon: Network }]
    : []

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="brand">
          <span className="brand-mark"><GraduationCap size={20} /></span>
          <span>{appName}</span>
        </div>
        <nav>
          <p className="nav-heading">Principal</p>
          {primary.map((item) => <NavItem key={item.to} {...item} />)}
          <p className="nav-heading">Sistema</p>
          {system.map((item) => <NavItem key={item.to} {...item} />)}

          {adminNav.length > 0 && (
            <>
              <p className="nav-heading" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#10b981' }}>
                <ShieldCheck size={14} /> Master
              </p>
              {adminNav.map((item) => <NavItem key={item.to} {...item} />)}
            </>
          )}
        </nav>
        <div className="sidebar-profile">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="avatar-image" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <span className="avatar">
              {(profile.data?.display_name || profile.data?.full_name || user?.email || 'P').slice(0, 1).toUpperCase()}
            </span>
          )}
          <div style={{ overflow: 'hidden' }}>
            <strong style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', display: 'block' }}>
              {profile.data?.display_name || profile.data?.full_name || 'Professor'}
            </strong>
            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', display: 'block' }}>
              {profile.data?.job_title || user?.email}
            </span>
          </div>
          <Button variant="ghost" size="icon" aria-label="Sair" onClick={() => void signOut()}>
            <LogOut size={17} />
          </Button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="mobile-brand">
            <GraduationCap size={19} />
            <strong>{appName}</strong>
          </div>
          <div className="topbar-filters">
            <label className="select-wrap">
              <span className="sr-only">Ciclo</span>
              <select
                value={selectedCycleId ?? ''}
                onChange={(event) => {
                  setSelectedCycleId(event.target.value)
                  setSelectedClassId(undefined)
                }}
              >
                <option value="" disabled>Ciclo</option>
                {cycles.data?.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>{cycle.code}</option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <label className="select-wrap">
              <span className="sr-only">Turma</span>
              <select
                value={selectedClassId ?? ''}
                onChange={(event) => setSelectedClassId(event.target.value || undefined)}
              >
                <option value="">Todas as turmas</option>
                {classes.data?.map((item) => (
                  <option key={item.id} value={item.id}>{item.code}</option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="mobile-more"
            aria-label="Abrir menu"
            aria-expanded={mobileMenu}
            onClick={() => setMobileMenu((value) => !value)}
          >
            <Menu size={20} />
          </Button>
        </header>

        <main className="content">
          <Outlet />
        </main>

        <footer style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', padding: '1.75rem 1.5rem', textAlign: 'center', color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.8125rem', marginTop: 'auto' }}>
          <p style={{ margin: 0, fontWeight: 500 }}>
            © 2026 Agenda Docente · Todos os direitos reservados.
          </p>
          <p style={{ margin: '0.375rem 0 0', fontSize: '0.75rem', opacity: 0.85 }}>
            Criado, Desenvolvido e Administrado por <strong style={{ color: 'var(--color-text, #f8fafc)' }}>Bruno Moreira</strong> — Proprietário, Desenvolvedor e WebMaster.
          </p>
        </footer>
      </div>

      <nav className="bottom-nav" aria-label="Navegação móvel">
        {primary.slice(0, 3).map((item) => <NavItem key={item.to} {...item} />)}
        <button
          className={`nav-link ${mobileMenu ? 'active' : ''}`}
          onClick={() => setMobileMenu((value) => !value)}
        >
          <Menu size={18} />
          <span>Mais</span>
        </button>
      </nav>
      {mobileMenu && (
        <div className="mobile-menu-backdrop" onClick={() => setMobileMenu(false)}>
          <div className="mobile-menu" onClick={(event) => event.stopPropagation()}>
            <p className="nav-heading">Mais</p>
            {[...primary.slice(3), ...system, ...adminNav].map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={() => setMobileMenu(false)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
            <button className="nav-link danger" onClick={() => void signOut()}>
              <LogOut size={18} />
              <span>Sair</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function NavItem({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof Home; end?: boolean }) {
  return <NavLink to={to} end={end} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}><Icon size={18} /><span>{label}</span></NavLink>
}
