import { useEffect, useState } from 'react'
import { Check, KeyRound, ShieldAlert, UserCheck, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Input, LoadingState, PageTitle } from '../../components/ui'
import { requireSupabase } from '../../lib/supabase/client'
import { useAuth } from '../auth/AuthProvider'
import type { UserRole } from '../../types/domain'
import type { Profile } from '../../types/database'

interface AdminUserItem {
  id: string
  full_name: string
  display_name: string | null
  email?: string | null
  job_title: string | null
  account_status: 'pending_approval' | 'active' | 'suspended'
  roles: UserRole[]
  created_at: string
}

const ALL_ROLES: { key: UserRole; label: string; desc: string }[] = [
  { key: 'master', label: 'Master', desc: 'Controle irrestrito e administração' },
  { key: 'admin', label: 'Admin', desc: 'Coordenação e supervisão pedagógica' },
  { key: 'professor', label: 'Professor', desc: 'Docência em sala, turmas e aulas' },
  { key: 'mentor', label: 'Mentor', desc: 'Orientações 1:1, carreira e feedbacks' },
]

export function AdminUsersPage() {
  const { user: currentUser, isMaster, refetchPermissions } = useAuth()
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'active'>('all')
  const [search, setSearch] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const loadUsers = async () => {
    setLoading(true)
    try {
      const client = requireSupabase()
      const [profilesRes, rolesRes] = await Promise.all([
        client.from('profiles').select('*').order('created_at', { ascending: false }),
        client.from('user_roles').select('*'),
      ])

      if (profilesRes.error) throw profilesRes.error

      const rolesByUserId: Record<string, UserRole[]> = {}
      if (rolesRes.data) {
        for (const row of rolesRes.data as { user_id: string; role: UserRole }[]) {
          const list = rolesByUserId[row.user_id] ?? []
          list.push(row.role)
          rolesByUserId[row.user_id] = list
        }
      }

      const rawProfiles = (profilesRes.data || []) as (Profile & { account_status?: 'pending_approval' | 'active' | 'suspended' })[]
      const items: AdminUserItem[] = rawProfiles.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        display_name: p.display_name,
        job_title: p.job_title,
        account_status: p.account_status || 'active',
        roles: rolesByUserId[p.id] || (p.id === currentUser?.id ? ['master', 'professor'] : ['professor']),
        created_at: p.created_at,
      }))

      setUsers(items)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao carregar usuários.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  const handleToggleRole = (userId: string, role: UserRole) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u
        if (u.id === currentUser?.id && role === 'master' && u.roles.includes('master')) {
          toast.info('Você não pode desmarcar o cargo Master de sua própria conta.')
          return u
        }
        const has = u.roles.includes(role)
        const nextRoles = has ? u.roles.filter((r) => r !== role) : [...u.roles, role]
        return { ...u, roles: nextRoles.length ? nextRoles : ['professor'] }
      })
    )
  }

  const handleSaveUser = async (targetUser: AdminUserItem) => {
    setSavingId(targetUser.id)
    try {
      const client = requireSupabase()
      
      // Chamada atômica via RPC segura
      const { error: rpcErr } = await client.rpc('admin_set_user_roles', {
        target_user_id: targetUser.id,
        target_roles: targetUser.roles,
        target_account_status: targetUser.account_status,
      })

      if (rpcErr) {
        // Fallback direto se a RPC retornar erro
        const { error: profErr } = await client
          .from('profiles')
          .update({ account_status: targetUser.account_status })
          .eq('id', targetUser.id)
        if (profErr) throw profErr

        await client.from('user_roles').delete().eq('user_id', targetUser.id)
        const roleRows = targetUser.roles.map((r) => ({ user_id: targetUser.id, role: r }))
        const { error: rolesErr } = await client.from('user_roles').insert(roleRows)
        if (rolesErr) throw rolesErr
      }

      if (targetUser.id === currentUser?.id && refetchPermissions) {
        await refetchPermissions()
      }

      toast.success(`Usuário ${targetUser.full_name} atualizado!`)
      await loadUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar permissões.')
    } finally {
      setSavingId(null)
    }
  }

  const handleApprove = async (targetUser: AdminUserItem) => {
    const updated = { ...targetUser, account_status: 'active' as const }
    await handleSaveUser(updated)
    setUsers((prev) => prev.map((u) => (u.id === targetUser.id ? updated : u)))
  }

  const handleToggleStatus = async (targetUser: AdminUserItem) => {
    if (targetUser.id === currentUser?.id) {
      toast.error('Você não pode alterar o status da sua própria conta Master.')
      return
    }
    const nextStatus: 'active' | 'suspended' = targetUser.account_status === 'active' ? 'suspended' : 'active'
    const updated: AdminUserItem = { ...targetUser, account_status: nextStatus }
    await handleSaveUser(updated)
    setUsers((prev) => prev.map((u) => (u.id === targetUser.id ? updated : u)))
  }

  const handleResetPassword = async (targetUser: AdminUserItem) => {
    try {
      const email = targetUser.email || prompt('Confirme o e-mail do usuário para envio do link:')
      if (!email) return
      const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      toast.success(`Link de redefinição enviado para ${email}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao solicitar reset.')
    }
  }

  const filteredUsers = users.filter((u) => {
    if (filter === 'pending' && u.account_status !== 'pending_approval') return false
    if (filter === 'active' && u.account_status !== 'active') return false
    const match = `${u.full_name} ${u.display_name ?? ''} ${u.job_title ?? ''}`.toLowerCase()
    return match.includes(search.toLowerCase())
  })

  if (!isMaster) {
    return (
      <EmptyState
        icon={<ShieldAlert size={36} />}
        title="Acesso restrito"
        description="Esta área é de uso exclusivo do Administrador Master (Bruno Moreira)."
      />
    )
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '3rem' }}>
      <PageTitle
        eyebrow="Governança Master"
        title="Gestão de Docentes & Cargos"
        description="Aprovação de acessos, concessão de múltiplos cargos (Professor, Mentor, Admin) e supervisão."
      />

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <Input
            placeholder="Buscar por nome, cargo ou função…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="segmented">
          <button
            type="button"
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            Todos ({users.length})
          </button>
          <button
            type="button"
            className={filter === 'pending' ? 'active' : ''}
            onClick={() => setFilter('pending')}
          >
            Pendentes ({users.filter((u) => u.account_status === 'pending_approval').length})
          </button>
          <button
            type="button"
            className={filter === 'active' ? 'active' : ''}
            onClick={() => setFilter('active')}
          >
            Ativos ({users.filter((u) => u.account_status === 'active').length})
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Carregando docentes cadastrados…" />
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          icon={<Users size={36} />}
          title="Nenhum docente encontrado"
          description="Nenhum usuário corresponde aos filtros selecionados."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {filteredUsers.map((item) => (
            <Card key={item.id} className="settings-card" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span className="avatar large">
                    {(item.display_name || item.full_name || 'D')[0]?.toUpperCase()}
                  </span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>{item.full_name}</h3>
                      {item.account_status === 'pending_approval' && (
                        <Badge tone="warning">Aguardando aprovação</Badge>
                      )}
                      {item.account_status === 'active' && (
                        <Badge tone="positive">Ativo</Badge>
                      )}
                      {item.account_status === 'suspended' && (
                        <Badge tone="neutral">Bloqueado</Badge>
                      )}
                    </div>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.875rem' }}>
                      {item.job_title || 'Docente'} · Cadastrado em {new Date(item.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {item.account_status === 'pending_approval' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void handleApprove(item)}
                      loading={savingId === item.id}
                    >
                      <UserCheck size={15} /> Aprovar Acesso
                    </Button>
                  )}
                  {item.id !== currentUser?.id && (
                    <Button
                      variant={item.account_status === 'active' ? 'ghost' : 'secondary'}
                      size="sm"
                      onClick={() => void handleToggleStatus(item)}
                    >
                      {item.account_status === 'active' ? 'Suspender' : 'Reativar'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleResetPassword(item)}
                  >
                    <KeyRound size={15} /> Reset Senha
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={savingId === item.id}
                    onClick={() => void handleSaveUser(item)}
                  >
                    <Check size={15} /> Salvar Cargos
                  </Button>
                </div>
              </div>

              {/* Seção de Múltiplos Cargos */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '0.75rem', padding: '1rem' }}>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)' }}>
                  Cargos Atribuídos (marque quantos se aplicarem):
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  {ALL_ROLES.map((r) => {
                    const isChecked = item.roles.includes(r.key)
                    return (
                      <label
                        key={r.key}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.5rem',
                          background: isChecked ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                          border: isChecked ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleRole(item.id, r.key)}
                          style={{ marginTop: '0.2rem' }}
                        />
                        <div>
                          <strong style={{ display: 'block', fontSize: '0.875rem' }}>{r.label}</strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #94a3b8)' }}>{r.desc}</span>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}