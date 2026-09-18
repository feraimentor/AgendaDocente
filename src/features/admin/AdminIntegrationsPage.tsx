import { useEffect, useState } from 'react'
import { Building2, Cable, Check, Globe, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Field, Input, LoadingState, PageTitle } from '../../components/ui'
import { requireSupabase } from '../../lib/supabase/client'
import { useAuth } from '../auth/AuthProvider'
import { useCreateInstitution, useInstitutions } from '../data/queries'
import type { InstitutionIntegration } from '../../types/domain'

export function AdminIntegrationsPage() {
  const { user, isMaster, isAdmin } = useAuth()
  const institutions = useInstitutions()
  const createInstitution = useCreateInstitution()
  const [integrations, setIntegrations] = useState<InstitutionIntegration[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  // Instituição modal state
  const [showInstModal, setShowInstModal] = useState(false)
  const [newInstName, setNewInstName] = useState('')
  const [newInstShortName, setNewInstShortName] = useState('')
  const [savingInst, setSavingInst] = useState(false)

  // Form state
  const [institutionId, setInstitutionId] = useState('')
  const [provider, setProvider] = useState<InstitutionIntegration['provider']>('google_calendar')
  const [displayName, setDisplayName] = useState('')
  const [apiEndpoint, setApiEndpoint] = useState('')
  const [authType, setAuthType] = useState('bearer')
  const [allowAdmin, setAllowAdmin] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadIntegrations = async () => {
    setLoading(true)
    try {
      const { data, error } = await requireSupabase()
        .from('institution_integrations')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setIntegrations((data || []) as InstitutionIntegration[])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao carregar integrações.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadIntegrations()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    const instId = institutionId || institutions.data?.[0]?.id
    if (!instId) {
      toast.error('Selecione ou cadastre uma instituição primeiro.')
      return
    }

    setSaving(true)
    try {
      const client = requireSupabase()
      const { error } = await client.from('institution_integrations').insert({
        user_id: user.id,
        institution_id: instId,
        provider,
        display_name: displayName,
        api_endpoint: apiEndpoint || null,
        auth_type: authType,
        allow_admin_access: allowAdmin,
        is_active: true,
      })

      if (error) throw error
      toast.success('Conector de API institucional configurado!')
      setShowModal(false)
      setDisplayName('')
      setApiEndpoint('')
      void loadIntegrations()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar integração.')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateInstitution = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newInstName.trim()) {
      toast.error('Informe o nome da instituição.')
      return
    }
    setSavingInst(true)
    try {
      const created = await createInstitution.mutateAsync({
        userId: user.id,
        name: newInstName.trim(),
        shortName: newInstShortName.trim() || undefined,
      })
      toast.success('Instituição parceira cadastrada com sucesso!')
      setShowInstModal(false)
      setNewInstName('')
      setNewInstShortName('')
      if (created?.id) {
        setInstitutionId(created.id)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cadastrar instituição.')
    } finally {
      setSavingInst(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover esta conexão de API?')) return
    try {
      const { error } = await requireSupabase().from('institution_integrations').delete().eq('id', id)
      if (error) throw error
      toast.success('Conexão removida.')
      setIntegrations((prev) => prev.filter((item) => item.id !== id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao remover.')
    }
  }

  if (!isMaster && !isAdmin) {
    return (
      <EmptyState
        icon={<ShieldAlert size={36} />}
        title="Acesso restrito"
        description="Esta área é de uso restrito da Administração e Master."
      />
    )
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <PageTitle
          eyebrow="Integrações & Conectores"
          title="APIs Institucionais"
          description="Conecte calendários e cronogramas de instituições de ensino parceiras via API ou Webhooks."
        />
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => setShowInstModal(true)}>
            <Building2 size={16} /> Nova Instituição Parceira
          </Button>
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Nova Conexão de API
          </Button>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Carregando conectores ativos…" />
      ) : integrations.length === 0 ? (
        <EmptyState
          icon={<Cable size={36} />}
          title="Nenhum conector de API cadastrado"
          description="Você pode integrar cronogramas institucionais externos via REST API, Webhook ou sincronização de Google Calendar."
          action={
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant="secondary" onClick={() => setShowInstModal(true)}>
                <Building2 size={16} /> Cadastrar Instituição
              </Button>
              <Button variant="primary" onClick={() => setShowModal(true)}>
                <Plus size={16} /> Configurar Primeira Conexão
              </Button>
            </div>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {integrations.map((item) => (
            <Card key={item.id} className="settings-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span className="avatar" style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}>
                    <Globe size={20} />
                  </span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '1rem' }}>{item.display_name}</strong>
                      <Badge tone={item.is_active ? 'positive' : 'neutral'}>
                        {item.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Badge tone="accent">{item.provider.toUpperCase()}</Badge>
                    </div>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.8125rem' }}>
                      {item.api_endpoint || 'Webhook configurado'} · Autenticação: {item.auth_type}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button variant="ghost" size="sm" onClick={() => void handleDelete(item.id)}>
                    <Trash2 size={15} /> Excluir
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Conexão de API Institucional */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <Card className="settings-card" style={{ maxWidth: '540px', width: '100%', padding: '1.75rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Nova Conexão de API Institucional</h2>
            <p style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              Conecte um endpoint da instituição para sincronizar aulas e agendas automaticamente.
            </p>

            <form onSubmit={(e) => void handleCreate(e)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                <span className="field-label" style={{ margin: 0 }}>Instituição Parceira</span>
                <button
                  type="button"
                  onClick={() => setShowInstModal(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--brand, #10b981)',
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <Plus size={13} /> Nova Instituição
                </button>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <select
                  className="input"
                  value={institutionId}
                  onChange={(e) => setInstitutionId(e.target.value)}
                  required
                >
                  <option value="">Selecione uma instituição…</option>
                  {(institutions.data || []).map((inst) => (
                    <option key={inst.id} value={inst.id}>{inst.name} ({inst.short_name || 'Geral'})</option>
                  ))}
                </select>
              </div>

              <Field label="Tipo de Provedor / Protocolo">
                <select
                  className="input"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as typeof provider)}
                >
                  <option value="google_calendar">Google Calendar API</option>
                  <option value="teams">Microsoft Teams Webhook</option>
                  <option value="moodle">Moodle / Canvas LMS API</option>
                  <option value="airtable">Airtable API Oficial</option>
                  <option value="custom_api">API REST Customizada da Instituição</option>
                </select>
              </Field>

              <Field label="Nome de Identificação">
                <Input
                  placeholder="Ex.: Cronograma Oficial EdN 2026"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </Field>

              <Field label="URL do Endpoint ou Webhook">
                <Input
                  placeholder="https://api.instituicao.edu.br/v1/schedules"
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                />
              </Field>

              <Field label="Tipo de Autenticação">
                <select
                  className="input"
                  value={authType}
                  onChange={(e) => setAuthType(e.target.value)}
                >
                  <option value="bearer">Bearer Token / Header Authorization</option>
                  <option value="api_key">API Key (Query Parameter ou Header)</option>
                  <option value="oauth2">OAuth 2.0</option>
                  <option value="none">Pública / Sem Autenticação</option>
                </select>
              </Field>

              <label className="switch-row" style={{ marginTop: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <strong>Acesso para Coordenadores (Admins)</strong>
                  <span>Permitir que usuários com cargo Admin sincronizem este conector.</span>
                </div>
                <input
                  type="checkbox"
                  checked={allowAdmin}
                  onChange={(e) => setAllowAdmin(e.target.checked)}
                />
              </label>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={saving}>
                  <Check size={16} /> Salvar Conector
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Modal de Nova Instituição Parceira */}
      {showInstModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <Card className="settings-card" style={{ maxWidth: '480px', width: '100%', padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
              <Building2 size={20} color="#10b981" />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Nova Instituição Parceira</h2>
            </div>
            <p style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              Cadastre uma instituição de ensino parceira para vincular conectores de API e cronogramas.
            </p>

            <form onSubmit={(e) => void handleCreateInstitution(e)}>
              <Field label="Nome Completo da Instituição">
                <Input
                  placeholder="Ex.: Escola da Nuvem, FIAP, Senac..."
                  value={newInstName}
                  onChange={(e) => setNewInstName(e.target.value)}
                  required
                />
              </Field>

              <Field label="Sigla ou Nome Curto (opcional)">
                <Input
                  placeholder="Ex.: EdN, FIAP, SENAC..."
                  value={newInstShortName}
                  onChange={(e) => setNewInstShortName(e.target.value)}
                />
              </Field>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <Button type="button" variant="ghost" onClick={() => setShowInstModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={savingInst}>
                  <Check size={16} /> Cadastrar Instituição
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}