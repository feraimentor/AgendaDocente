import { useMemo, useState } from 'react'
import { Check, CheckCircle2, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingState, PageTitle } from '../../components/ui'
import { useWorkspace } from '../../app/providers/WorkspaceProvider'
import { useClasses, useCreateUserAction, useDeleteUserAction, useEvents, useProfile, useToggleAction, useToggleUserAction, useUserActions } from '../data/queries'
import { useAuth } from '../auth/AuthProvider'
import { eventHasElapsed } from '../../lib/dates/schedule'

type Tab = 'pending' | 'completed' | 'all'
type OriginFilter = 'all' | 'institutional' | 'authorial'

interface UnifiedAction {
  id: string
  title: string
  subtitle?: string | null
  eventDate?: string | null
  timeText?: string | null
  classCode?: string | null
  classColor?: string | null
  origin: 'institutional' | 'authorial'
  status: 'pending' | 'completed'
  isPast?: boolean
  originalEventId?: string
}

export function ActionsPage() {
  const { user } = useAuth()
  const profile = useProfile(user?.id)
  const { selectedCycleId, selectedClassId } = useWorkspace()
  const events = useEvents(selectedCycleId)
  const userActionsQuery = useUserActions(selectedCycleId)
  const classes = useClasses(selectedCycleId)

  const toggleInstitutional = useToggleAction(selectedCycleId)
  const toggleAuthorial = useToggleUserAction(selectedCycleId)
  const createAuthorial = useCreateUserAction(selectedCycleId)
  const deleteAuthorial = useDeleteUserAction(selectedCycleId)

  const [tab, setTab] = useState<Tab>('pending')
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)

  // Form modal
  const [newTitle, setNewTitle] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newClassId, setNewClassId] = useState('')
  const [saving, setSaving] = useState(false)

  const now = useMemo(() => new Date(), [])
  const timezone = profile.data?.timezone ?? 'America/Sao_Paulo'

  const allActions = useMemo<UnifiedAction[]>(() => {
    const list: UnifiedAction[] = []

    // 1. Ações institucionais do CSV
    for (const event of events.data ?? []) {
      if (event.actionId && (!selectedClassId || event.classId === selectedClassId)) {
        list.push({
          id: event.actionId,
          title: event.actionText ?? 'Ação sem descrição',
          subtitle: event.title,
          eventDate: event.eventDate,
          timeText: event.startTime ?? 'Horário a confirmar',
          classCode: event.classCode,
          classColor: event.classColor ?? 'teal',
          origin: 'institutional',
          status: event.actionStatus === 'completed' ? 'completed' : 'pending',
          isPast: eventHasElapsed(event, now, timezone),
          originalEventId: event.id,
        })
      }
    }

    // 2. Ações autorais criadas pelo docente
    for (const item of userActionsQuery.data ?? []) {
      if (!selectedClassId || item.class_id === selectedClassId) {
        const associatedClass = classes.data?.find((c) => c.id === item.class_id)
        list.push({
          id: item.id,
          title: item.title,
          subtitle: associatedClass ? `Turma ${associatedClass.code}` : 'Ação pessoal',
          eventDate: item.due_date,
          timeText: item.due_date ? 'Prazo definido' : null,
          classCode: associatedClass?.code ?? null,
          classColor: associatedClass?.color_token ?? 'emerald',
          origin: 'authorial',
          status: item.status === 'completed' ? 'completed' : 'pending',
          isPast: item.due_date ? new Date(item.due_date) < now : false,
        })
      }
    }

    return list
  }, [classes.data, events.data, now, selectedClassId, timezone, userActionsQuery.data])

  const filtered = useMemo(() => {
    return allActions
      .filter((a) => (tab === 'all' ? true : tab === 'completed' ? a.status === 'completed' : a.status !== 'completed'))
      .filter((a) => (originFilter === 'all' ? true : a.origin === originFilter))
      .filter((a) => `${a.title} ${a.subtitle ?? ''} ${a.classCode ?? ''}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        if (tab !== 'pending') return (a.eventDate ?? '').localeCompare(b.eventDate ?? '')
        const aPast = a.isPast ? 0 : 1
        const bPast = b.isPast ? 0 : 1
        return aPast - bPast || (a.eventDate ?? '').localeCompare(b.eventDate ?? '')
      })
  }, [allActions, originFilter, search, tab])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newTitle.trim()) return
    setSaving(true)
    try {
      await createAuthorial.mutateAsync({
        userId: user.id,
        title: newTitle.trim(),
        dueDate: newDueDate || undefined,
        classId: newClassId || undefined,
        cycleId: selectedCycleId,
      })
      toast.success('Ação autoral criada com sucesso!')
      setShowModal(false)
      setNewTitle('')
      setNewDueDate('')
      setNewClassId('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao criar ação.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = (action: UnifiedAction) => {
    const nextStatus = action.status === 'completed' ? 'pending' : 'completed'
    if (action.origin === 'institutional') {
      toggleInstitutional.mutate({ actionId: action.id, status: nextStatus })
    } else {
      toggleAuthorial.mutate({ id: action.id, status: nextStatus })
    }
  }

  const handleDeleteAuthorial = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta ação pessoal?')) return
    try {
      await deleteAuthorial.mutateAsync(id)
      toast.success('Ação excluída.')
    } catch {
      toast.error('Erro ao excluir ação.')
    }
  }

  if (events.isLoading || userActionsQuery.isLoading) return <LoadingState label="Organizando ações com serenidade…" />
  if (events.isError) return <ErrorState message={events.error.message} />

  const pendingCount = allActions.filter((a) => a.status === 'pending').length
  const completedCount = allActions.filter((a) => a.status === 'completed').length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <PageTitle
          eyebrow="Acompanhamento Pessoal"
          title="Ações & Pendências"
          description="Gestão de obrigações institucionais e ações autorais com serenidade."
        />
        <Button variant="primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Nova Ação Autoral
        </Button>
      </div>

      <div className="tab-toolbar">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'pending'} className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>
            Pendentes <span>{pendingCount}</span>
          </button>
          <button role="tab" aria-selected={tab === 'completed'} className={tab === 'completed' ? 'active' : ''} onClick={() => setTab('completed')}>
            Concluídas <span>{completedCount}</span>
          </button>
          <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
            Todas <span>{allActions.length}</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <label className="select-wrap" style={{ minWidth: '160px' }}>
            <span className="sr-only">Filtrar por origem</span>
            <select value={originFilter} onChange={(e) => setOriginFilter(e.target.value as OriginFilter)}>
              <option value="all">Todas as origens</option>
              <option value="institutional">Fixas (Institucionais)</option>
              <option value="authorial">Autorais (Pessoais)</option>
            </select>
          </label>

          <div className="search-box small">
            <Search size={16} />
            <Input aria-label="Buscar ações" placeholder="Buscar ação…" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>
      </div>

      {!filtered.length ? (
        <EmptyState
          icon={<CheckCircle2 />}
          title={tab === 'pending' ? 'Tudo em dia.' : 'Nenhuma ação aqui.'}
          description={tab === 'pending' ? 'Você não possui ações pendentes para este filtro.' : 'Altere a aba ou os filtros para ver outras ações.'}
        />
      ) : (
        <div className="actions-list">
          {filtered.map((action) => {
            const completed = action.status === 'completed'
            return (
              <Card className="action-card" key={action.id}>
                <button
                  className={`action-check ${completed ? 'checked' : ''}`}
                  aria-label={completed ? 'Reabrir ação' : 'Concluir ação'}
                  onClick={() => handleToggle(action)}
                >
                  {completed && <Check />}
                </button>
                <span className={`class-bar color-${action.classColor ?? 'teal'}`} />
                <div className="action-copy">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {action.classCode && <Badge tone="accent">{action.classCode}</Badge>}
                    {action.origin === 'institutional' ? (
                      <Badge tone="neutral">Institucional</Badge>
                    ) : (
                      <Badge tone="positive">Autoral</Badge>
                    )}
                    {!completed && action.isPast && <Badge tone="warning">Prazo transcorrido</Badge>}
                    {completed && <Badge tone="positive">Concluída</Badge>}
                  </div>
                  <h2>{action.title}</h2>
                  {action.subtitle && <p>{action.subtitle}</p>}
                  <span>
                    {action.eventDate ? formatActionDate(action.eventDate) : 'Sem data fixa'}
                    {action.timeText ? ` · ${action.timeText}` : ''}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {action.origin === 'authorial' && (
                    <Button variant="ghost" size="icon" aria-label="Excluir ação" onClick={() => void handleDeleteAuthorial(action.id)}>
                      <Trash2 size={16} />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleToggle(action)}>
                    {completed ? <RotateCcw size={15} /> : <Check size={15} />}
                    {completed ? 'Reabrir' : 'Concluir'}
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <Card className="settings-card" style={{ maxWidth: '480px', width: '100%', padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Nova Ação Autoral</h2>
            <p style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              Crie uma tarefa ou compromisso pedagógico autoral com total independência do cronograma oficial.
            </p>
            <form onSubmit={(e) => void handleCreate(e)}>
              <Field label="Descrição da Ação">
                <Input
                  placeholder="Ex.: Enviar gabarito e feedbacks no Teams"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </Field>

              <Field label="Turma Associada (Opcional)">
                <select className="input" value={newClassId} onChange={(e) => setNewClassId(e.target.value)}>
                  <option value="">Nenhuma (Geral)</option>
                  {(classes.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.code}</option>
                  ))}
                </select>
              </Field>

              <Field label="Data Limite / Prevista (Opcional)">
                <Input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
              </Field>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={saving}>
                  <Check size={16} /> Salvar Ação
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}

function formatActionDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`)
  )
}