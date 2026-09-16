import { useEffect, useState } from 'react'
import { Cable, Check, Globe, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Field, Input, LoadingState, PageTitle } from '../../components/ui'
import { requireSupabase } from '../../lib/supabase/client'
import { useAuth } from '../auth/AuthProvider'
import { useInstitutions } from '../data/queries'
import type { InstitutionIntegration } from '../../types/domain'

export function AdminIntegrationsPage() {
  const { user, isMaster, isAdmin } = useAuth()
  const institutions = useInstitutions()
  const [integrations, setIntegrations] = useState<InstitutionIntegration[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

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
        <Button variant="primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Nova Conexão de API
        </Button>
      </div>

      {loading ? (
        <LoadingState label="Carregando conectores ativos…" />
      ) : integrations.length === 0 ? (
        <EmptyState
          icon={<Cable size={36} />}
          title="Nenhum conector de API cadastrado"
          description="Você pode integrar cronogramas institucionais externos via REST API, Webhook ou sincronização de Google Calendar."
          action={
            <Button variant="secondary" onClick={() => setShowModal(true)}>
              <Plus size={16} /> Configurar Primeira Conexão
            </Button>
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

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <Card className="settings-card" style={{ maxWidth: '540px', width: '100%', padding: '1.75rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Nova Conexão de API Institucional</h2>
            <p style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              Conecte um endpoint da instituição para sincronizar aulas e agendas automaticamente.
            </p>

            <form onSubmit={(e) => void handleCreate(e)}>
              <Field label="Instituição Parceira">
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
              </Field>

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
    </div>
  )
}