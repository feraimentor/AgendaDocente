import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  CalendarClock,
  Check,
  Clock3,
  ExternalLink,
  FolderOpen,
  Link2,
  MessageCircle,
  Palette,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Users,
  UsersRound,
  Video,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingState, PageTitle } from '../../components/ui'
import { useWorkspace } from '../../app/providers/WorkspaceProvider'
import { queryKeys, useClassTasks, useClasses, useCreateClassTask, useCycles, useDeleteClassTask, useEvents, usePinClassTask, useToggleClassTask } from '../data/queries'
import { totalKnownHours } from '../../lib/schedule/metrics'
import { nextScheduleEvent } from '../../lib/dates/schedule'
import { requireSupabase } from '../../lib/supabase/client'
import { useAuth } from '../auth/AuthProvider'
import { useQueryClient } from '@tanstack/react-query'
import { suggestClassDynamics } from '../../lib/ai/gemini'
import { formatTeamsUrl, formatWhatsAppUrl, parseClassContacts, serializeClassContacts } from '../../lib/contacts/classContacts'
import type { ClassContact } from '../../types/domain'

const COLORS = ['teal', 'indigo', 'amber', 'rose', 'sky', 'violet']

export function ClassesPage() {
  const { selectedCycleId } = useWorkspace()
  const classes = useClasses(selectedCycleId)
  const events = useEvents(selectedCycleId)
  const cycles = useCycles()

  if (!selectedCycleId || classes.isLoading || events.isLoading) return <LoadingState label="Carregando turmas…" />
  if (classes.isError || events.isError) return <ErrorState message={classes.error?.message ?? events.error?.message ?? 'Erro inesperado'} />
  const cycle = cycles.data?.find((item) => item.id === selectedCycleId)

  return (
    <div>
      <PageTitle
        eyebrow={cycle?.code ?? 'Ciclo'}
        title="Turmas"
        description="Visão enxuta da carga horária, ações pedagógicas e próximos encontros."
      />

      {!classes.data?.length ? (
        <EmptyState
          icon={<UsersRound />}
          title="Nenhuma turma ainda."
          description="As turmas são criadas e organizadas automaticamente na primeira importação do cronograma."
        />
      ) : (
        <div className="class-grid">
          {classes.data.map((item) => {
            const classEvents = (events.data ?? []).filter((event) => event.classId === item.id)
            const next = nextScheduleEvent(classEvents, new Date())
            return (
              <Link key={item.id} to={`/classes/${item.id}`} className="class-card-link">
                <Card className="class-card">
                  <div className="class-card-top">
                    <span className={`class-monogram color-${item.color_token ?? 'teal'}`}>
                      {item.code.slice(-3)}
                    </span>
                    <ArrowRight />
                  </div>
                  <p className="eyebrow">{cycle?.code}</p>
                  <h2>{item.code}</h2>
                  <div className="class-stats">
                    <span><CalendarClock /> <strong>{classEvents.length}</strong> encontros</span>
                    <span><Clock3 /> <strong>{formatHours(totalKnownHours(classEvents))}</strong> conhecidas</span>
                  </div>
                  <div className="next-mini">
                    <span>Próxima aula</span>
                    <strong>{next ? `${formatDate(next.eventDate)} · ${next.startTime ?? 'A confirmar'}` : 'Ciclo concluído'}</strong>
                  </div>
                  <div className="class-card-footer">
                    <span>{classEvents.filter((event) => event.actionText).length} ações CP</span>
                    <span>Ver detalhes <ArrowRight /></span>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ClassDetailPage() {
  const { classId } = useParams()
  const { user } = useAuth()
  const { selectedCycleId } = useWorkspace()
  const classes = useClasses(selectedCycleId)
  const events = useEvents(selectedCycleId)
  const cycles = useCycles()
  const queryClient = useQueryClient()

  const tasksQuery = useClassTasks(classId)
  const createTask = useCreateClassTask(classId)
  const toggleTask = useToggleClassTask(classId)
  const pinTask = usePinClassTask(classId)
  const deleteTask = useDeleteClassTask(classId)

  const teachingClass = classes.data?.find((item) => item.id === classId)
  const classEvents = (events.data ?? []).filter((event) => event.classId === classId)

  const [color, setColor] = useState(teachingClass?.color_token ?? 'teal')
  const [meetingUrl, setMeetingUrl] = useState(teachingClass?.meeting_url ?? '')
  const [driveUrl, setDriveUrl] = useState(teachingClass?.drive_url ?? '')
  const [contacts, setContacts] = useState<ClassContact[]>(() => parseClassContacts(teachingClass?.contact_info))
  const [savingPrefs, setSavingPrefs] = useState(false)

  // Mini-CRUD de contatos
  const [showContactModal, setShowContactModal] = useState(false)
  const [editingContactId, setEditingContactId] = useState<string | null>(null)
  const [contactFormName, setContactFormName] = useState('')
  const [contactFormRole, setContactFormRole] = useState('Monitor / Apoio')
  const [contactFormWhatsApp, setContactFormWhatsApp] = useState('')
  const [contactFormTeams, setContactFormTeams] = useState('')
  const [contactFormNotes, setContactFormNotes] = useState('')
  const [contactFormIsPrimary, setContactFormIsPrimary] = useState(false)

  // To-do task input
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  // AI Dynamics state
  const [dynamics, setDynamics] = useState<string[]>([])
  const [loadingAi, setLoadingAi] = useState(false)
  const [showAiModal, setShowAiModal] = useState(false)

  useEffect(() => {
    if (teachingClass) {
      setColor(teachingClass.color_token ?? 'teal')
      setMeetingUrl(teachingClass.meeting_url ?? '')
      setDriveUrl(teachingClass.drive_url ?? '')
      setContacts(parseClassContacts(teachingClass.contact_info))
    }
  }, [teachingClass])

  if (classes.isLoading || events.isLoading) return <LoadingState />
  if (!teachingClass) {
    return <EmptyState title="Turma não encontrada." description="Ela pode ter sido arquivada ou pertencer a outro ciclo." />
  }

  const cycle = cycles.data?.find((item) => item.id === teachingClass.cycle_id)
  const next = nextScheduleEvent(classEvents, new Date())
  const primaryContact = contacts.find((c) => c.is_primary) ?? contacts[0]
  const whatsUrl = primaryContact?.whatsapp ? formatWhatsAppUrl(primaryContact.whatsapp) : ''
  const teamsUrl = primaryContact?.teams ? formatTeamsUrl(primaryContact.teams) : ''

  const handleSavePreferences = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return
    setSavingPrefs(true)
    try {
      const result = await requireSupabase().from('class_preferences').upsert(
        {
          user_id: user.id,
          class_id: teachingClass.id,
          color_token: color,
          meeting_url: meetingUrl.trim() || null,
          drive_url: driveUrl.trim() || null,
          contact_info: contacts.length ? serializeClassContacts(contacts) : null,
        },
        { onConflict: 'user_id,class_id' }
      )
      if (result.error) throw result.error
      toast.success('Configurações da turma salvas com sucesso!')
      void queryClient.invalidateQueries({ queryKey: queryKeys.classes(selectedCycleId) })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar.')
    } finally {
      setSavingPrefs(false)
    }
  }

  const handleOpenNewContactModal = () => {
    setEditingContactId(null)
    setContactFormName('')
    setContactFormRole('Monitor / Apoio')
    setContactFormWhatsApp('')
    setContactFormTeams('')
    setContactFormNotes('')
    setContactFormIsPrimary(contacts.length === 0)
    setShowContactModal(true)
  }

  const handleOpenEditContactModal = (contact: ClassContact) => {
    setEditingContactId(contact.id)
    setContactFormName(contact.name)
    setContactFormRole(contact.role)
    setContactFormWhatsApp(contact.whatsapp)
    setContactFormTeams(contact.teams)
    setContactFormNotes(contact.notes ?? '')
    setContactFormIsPrimary(contact.is_primary ?? false)
    setShowContactModal(true)
  }

  const handleSaveContactModal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !contactFormName.trim()) {
      toast.error('Informe o nome do responsável.')
      return
    }

    let updated: ClassContact[]
    const contactData: ClassContact = {
      id: editingContactId ?? `contact_${Date.now()}`,
      name: contactFormName.trim(),
      role: contactFormRole.trim() || 'Monitor / Apoio',
      whatsapp: contactFormWhatsApp.trim(),
      teams: contactFormTeams.trim(),
      notes: contactFormNotes.trim(),
      is_primary: contactFormIsPrimary,
    }

    if (editingContactId) {
      updated = contacts.map((c) => {
        if (c.id === editingContactId) return contactData
        if (contactFormIsPrimary) return { ...c, is_primary: false }
        return c
      })
    } else {
      if (contactFormIsPrimary) {
        updated = contacts.map((c) => ({ ...c, is_primary: false }))
        updated.push(contactData)
      } else {
        if (contacts.length === 0) contactData.is_primary = true
        updated = [...contacts, contactData]
      }
    }

    // Se nenhum for principal, torna o primeiro principal
    if (updated.length > 0 && !updated.some((c) => c.is_primary)) {
      updated[0]!.is_primary = true
    }

    setContacts(updated)
    setShowContactModal(false)

    try {
      const serialized = serializeClassContacts(updated)
      await requireSupabase().from('class_preferences').upsert(
        {
          user_id: user.id,
          class_id: teachingClass.id,
          color_token: color,
          meeting_url: meetingUrl.trim() || null,
          drive_url: driveUrl.trim() || null,
          contact_info: serialized,
        },
        { onConflict: 'user_id,class_id' }
      )
      toast.success(editingContactId ? 'Contato atualizado com sucesso!' : 'Novo responsável cadastrado!')
      void queryClient.invalidateQueries({ queryKey: queryKeys.classes(selectedCycleId) })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar contato.')
    }
  }

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Deseja realmente remover este contato de apoio?')) return
    const filtered = contacts.filter((c) => c.id !== contactId)
    if (filtered.length > 0 && !filtered.some((c) => c.is_primary)) {
      filtered[0]!.is_primary = true
    }
    setContacts(filtered)

    if (user) {
      try {
        const serialized = serializeClassContacts(filtered)
        await requireSupabase().from('class_preferences').upsert(
          {
            user_id: user.id,
            class_id: teachingClass.id,
            color_token: color,
            meeting_url: meetingUrl.trim() || null,
            drive_url: driveUrl.trim() || null,
            contact_info: filtered.length ? serialized : null,
          },
          { onConflict: 'user_id,class_id' }
        )
        toast.success('Contato removido.')
        void queryClient.invalidateQueries({ queryKey: queryKeys.classes(selectedCycleId) })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao remover contato.')
      }
    }
  }

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newTaskTitle.trim() || !classId) return
    setAddingTask(true)
    try {
      await createTask.mutateAsync({
        userId: user.id,
        classId,
        title: newTaskTitle.trim(),
      })
      setNewTaskTitle('')
      toast.success('Nota adicionada à turma!')
    } catch {
      toast.error('Erro ao adicionar nota.')
    } finally {
      setAddingTask(false)
    }
  }

  const handleGenerateDynamics = async () => {
    if (!next) return
    setLoadingAi(true)
    setShowAiModal(true)
    try {
      const suggestions = await suggestClassDynamics({
        classTitle: next.title,
        classCode: teachingClass.code,
      })
      setDynamics(suggestions)
    } catch {
      toast.error('Não foi possível gerar dinâmicas no momento.')
    } finally {
      setLoadingAi(false)
    }
  }

  return (
    <div>
      <PageTitle
        eyebrow={`${cycle?.code ?? 'Ciclo'} · Turma`}
        title={teachingClass.code}
        description={`${classEvents.length} encontros · ${formatHours(totalKnownHours(classEvents))} de carga conhecida`}
        action={<Badge tone={next ? 'positive' : 'neutral'}>{next ? 'Ciclo em andamento' : 'Encerrado'}</Badge>}
      />

      <div className="class-detail-grid">
        <div>
          {/* Próxima Aula com Link Direto da Sala */}
          <Card className="class-next">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p className="eyebrow" style={{ margin: 0 }}>Próxima aula</p>
              {next && (
                <Button variant="ghost" size="sm" onClick={() => void handleGenerateDynamics()}>
                  <Sparkles size={14} /> Sugerir Dinâmica com Gemini
                </Button>
              )}
            </div>

            {next ? (
              <div style={{ marginTop: '0.75rem' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>{next.title}</h2>
                <strong style={{ display: 'block', marginBottom: '1rem', color: 'rgba(255,255,255,0.75)' }}>
                  {formatDate(next.eventDate)} · {next.startTime ?? 'Horário a confirmar'}
                </strong>

                {/* Botões de Acesso Rápido */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem' }}>
                  {meetingUrl ? (
                    <a
                      href={meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button button-primary button-md"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <Video size={16} /> Entrar na Sala Virtual
                    </a>
                  ) : null}

                  {driveUrl ? (
                    <a
                      href={driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button button-secondary button-md"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        background: 'rgba(255,255,255,0.12)',
                        color: '#fff',
                        border: '1px solid rgba(255,255,255,0.25)',
                      }}
                    >
                      <FolderOpen size={16} /> Pasta do Google Drive
                    </a>
                  ) : null}

                  {primaryContact && whatsUrl ? (
                    <a
                      href={whatsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button button-secondary button-md"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        background: 'rgba(37, 211, 102, 0.18)',
                        color: '#4ade80',
                        border: '1px solid rgba(37, 211, 102, 0.35)',
                      }}
                    >
                      <MessageCircle size={16} /> WhatsApp ({primaryContact.name.split(' ')[0]})
                    </a>
                  ) : null}

                  {primaryContact && teamsUrl ? (
                    <a
                      href={teamsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button button-secondary button-md"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        background: 'rgba(99, 102, 241, 0.2)',
                        color: '#a5b4fc',
                        border: '1px solid rgba(99, 102, 241, 0.35)',
                      }}
                    >
                      <Users size={16} /> Teams ({primaryContact.name.split(' ')[0]})
                    </a>
                  ) : null}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: '0.75rem' }}>
                <p style={{ marginTop: '0.5rem', marginBottom: '1rem', color: 'rgba(255,255,255,0.75)' }}>
                  Não há próximos encontros agendados no ciclo ativo.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem' }}>
                  {meetingUrl && (
                    <a
                      href={meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button button-primary button-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <Video size={15} /> Acessar Sala Virtual
                    </a>
                  )}
                  {driveUrl && (
                    <a
                      href={driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button button-secondary button-sm"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        background: 'rgba(255,255,255,0.12)',
                        color: '#fff',
                      }}
                    >
                      <FolderOpen size={15} /> Pasta do Google Drive
                    </a>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* Central Dinâmica de Tarefas & Notas da Turma (To-Do com Pin) */}
          <Card className="section-card" style={{ marginTop: '1.5rem', padding: '1.5rem' }}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Anotações & Lembretes</p>
                <h2>Quadro da Turma</h2>
              </div>
            </div>

            <form onSubmit={(e) => void handleAddTask(e)} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <Input
                placeholder="Adicionar nota ou lembrete (Ex.: Revisar PDI dos alunos)..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
              <Button type="submit" variant="secondary" loading={addingTask}>
                <Plus size={16} />
              </Button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {tasksQuery.isLoading ? (
                <LoadingState label="Carregando notas…" />
              ) : (tasksQuery.data ?? []).length === 0 ? (
                <p style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.875rem', margin: '0.5rem 0' }}>
                  Nenhuma nota cadastrada. Use este espaço para fixar combinados e avisos pedagógicos.
                </p>
              ) : (
                (tasksQuery.data ?? []).map((task) => (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.625rem 0.75rem',
                      borderRadius: '0.5rem',
                      background: task.is_pinned ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                      border: task.is_pinned ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1 }}>
                      <button
                        type="button"
                        onClick={() => toggleTask.mutate({ id: task.id, isCompleted: !task.is_completed })}
                        style={{
                          width: '1.25rem',
                          height: '1.25rem',
                          borderRadius: '0.25rem',
                          border: '1px solid rgba(255,255,255,0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: task.is_completed ? '#10b981' : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        {task.is_completed && <Check size={12} color="#000" />}
                      </button>
                      <span
                        style={{
                          fontSize: '0.875rem',
                          textDecoration: task.is_completed ? 'line-through' : 'none',
                          color: task.is_completed ? 'var(--color-text-muted, #94a3b8)' : 'inherit',
                        }}
                      >
                        {task.title}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={task.is_pinned ? 'Desafixar nota' : 'Fixar no topo'}
                        onClick={() => pinTask.mutate({ id: task.id, isPinned: !task.is_pinned })}
                      >
                        {task.is_pinned ? <Pin size={15} color="#10b981" /> : <PinOff size={15} />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Excluir nota"
                        onClick={() => deleteTask.mutate(task.id)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Linha do Tempo / Próximas Aulas */}
          <Card className="section-card" style={{ marginTop: '1.5rem' }}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Cronograma</p>
                <h2>Próximas aulas</h2>
              </div>
            </div>
            <div className="simple-timeline">
              {classEvents
                .filter((event) => event.eventDate >= new Date().toISOString().slice(0, 10))
                .slice(0, 8)
                .map((event) => (
                  <div key={event.id}>
                    <span className={`timeline-dot color-${color}`} />
                    <time>
                      {formatDate(event.eventDate)}
                      <small>{event.startTime ?? 'A confirmar'}</small>
                    </time>
                    <strong>{event.title}</strong>
                    {event.actionText && <Badge tone="warning">Ação</Badge>}
                  </div>
                ))}
            </div>
          </Card>
        </div>

        {/* Coluna Direita: Personalização, Links e Mini-CRUD de Contatos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Card de Personalização & Links Operacionais */}
          <Card className="preference-card">
            <p className="eyebrow">Personalização & Links</p>
            <h2>Cockpit da Turma</h2>

            <form onSubmit={(event) => void handleSavePreferences(event)}>
              <label className="field">
                <span className="field-label"><Palette size={15} /> Cor da turma</span>
                <div className="color-picker">
                  {COLORS.map((item) => (
                    <button
                      type="button"
                      aria-label={`Cor ${item}`}
                      aria-pressed={color === item}
                      key={item}
                      className={`color-${item} ${color === item ? 'active' : ''}`}
                      onClick={() => setColor(item)}
                    />
                  ))}
                </div>
              </label>

              <Field label="Link da Sala Virtual (Teams / Meet / Zoom)">
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div className="input-icon" style={{ flex: 1 }}>
                    <Video size={17} />
                    <Input
                      placeholder="https://teams.microsoft.com/l/meetup-join/..."
                      value={meetingUrl}
                      onChange={(e) => setMeetingUrl(e.target.value)}
                    />
                  </div>
                  {meetingUrl ? (
                    <a
                      href={meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button button-secondary button-sm"
                      title="Testar e abrir sala"
                      style={{ padding: '0 0.75rem', display: 'inline-flex', alignItems: 'center' }}
                    >
                      <ExternalLink size={15} />
                    </a>
                  ) : null}
                </div>
              </Field>

              <Field label="Link do Drive / Repositório de Slides">
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div className="input-icon" style={{ flex: 1 }}>
                    <Link2 size={17} />
                    <Input
                      placeholder="https://drive.google.com/drive/folders/..."
                      value={driveUrl}
                      onChange={(e) => setDriveUrl(e.target.value)}
                    />
                  </div>
                  {driveUrl ? (
                    <a
                      href={driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button button-secondary button-sm"
                      title="Abrir pasta no Drive"
                      style={{ padding: '0 0.75rem', display: 'inline-flex', alignItems: 'center' }}
                    >
                      <ExternalLink size={15} />
                    </a>
                  ) : null}
                </div>
              </Field>

              <Button type="submit" loading={savingPrefs} style={{ marginTop: '0.5rem' }}>
                Salvar configurações
              </Button>
            </form>
          </Card>

          {/* Mini-CRUD de Contatos de Apoio / Monitores */}
          <Card className="preference-card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Equipe da Turma</p>
                <h2 style={{ fontSize: '1.125rem', margin: 0 }}>Monitores & Apoio</h2>
              </div>
              <Button variant="secondary" size="sm" onClick={handleOpenNewContactModal}>
                <Plus size={15} /> Adicionar
              </Button>
            </div>

            {contacts.length === 0 ? (
              <div
                style={{
                  padding: '1.25rem',
                  border: '1px dashed var(--line, rgba(255,255,255,0.15))',
                  borderRadius: '0.75rem',
                  textAlign: 'center',
                  color: 'var(--color-text-muted, #94a3b8)',
                  fontSize: '0.85rem',
                }}
              >
                <p style={{ margin: '0 0 0.75rem 0' }}>Nenhum responsável cadastrado para esta turma.</p>
                <Button variant="ghost" size="sm" onClick={handleOpenNewContactModal}>
                  <Plus size={14} /> Cadastrar monitor ou apoio
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {contacts.map((contact) => {
                  const itemWhats = contact.whatsapp ? formatWhatsAppUrl(contact.whatsapp) : ''
                  const itemTeams = contact.teams ? formatTeamsUrl(contact.teams) : ''
                  return (
                    <div
                      key={contact.id}
                      style={{
                        padding: '0.875rem 1rem',
                        borderRadius: '0.625rem',
                        background: contact.is_primary ? 'rgba(16, 185, 129, 0.07)' : 'var(--surface-2, rgba(255,255,255,0.03))',
                        border: contact.is_primary
                          ? '1px solid rgba(16, 185, 129, 0.25)'
                          : '1px solid var(--line, rgba(255,255,255,0.08))',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.95rem' }}>{contact.name}</strong>
                            <Badge tone="neutral">{contact.role}</Badge>
                            {contact.is_primary && (
                              <Badge tone="positive">
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <Star size={11} fill="currentColor" /> Principal
                                </span>
                              </Badge>
                            )}
                          </div>
                          {contact.notes && (
                            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                              {contact.notes}
                            </p>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar ${contact.name}`}
                            onClick={() => handleOpenEditContactModal(contact)}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Excluir ${contact.name}`}
                            onClick={() => void handleDeleteContact(contact.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>

                      {/* Botões de Ação Direta para o Contato */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.625rem' }}>
                        {itemWhats ? (
                          <a
                            href={itemWhats}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="button button-sm"
                            style={{
                              background: 'rgba(37, 211, 102, 0.15)',
                              color: '#4ade80',
                              border: '1px solid rgba(37, 211, 102, 0.3)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.375rem',
                              fontSize: '0.78rem',
                              padding: '0.25rem 0.625rem',
                            }}
                          >
                            <MessageCircle size={13} /> {contact.whatsapp}
                          </a>
                        ) : null}

                        {itemTeams ? (
                          <a
                            href={itemTeams}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="button button-sm"
                            style={{
                              background: 'rgba(99, 102, 241, 0.15)',
                              color: '#a5b4fc',
                              border: '1px solid rgba(99, 102, 241, 0.3)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.375rem',
                              fontSize: '0.78rem',
                              padding: '0.25rem 0.625rem',
                            }}
                          >
                            <Users size={13} /> Abrir Teams
                          </a>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Modal / Drawer de Dinâmica de Aula com Gemini */}
      {showAiModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <Card className="settings-card" style={{ maxWidth: '580px', width: '100%', padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', color: '#10b981', marginBottom: '0.5rem' }}>
              <Sparkles size={20} />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Dinâmicas Ativas · Google Gemini</h2>
            </div>
            <p style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              Sugestões práticas de 15 minutos para a aula: <strong>"{next?.title}"</strong>
            </p>

            {loadingAi ? (
              <LoadingState label="Criando sugestões de dinâmicas com serenidade…" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                {dynamics.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '0.75rem',
                      padding: '1rem',
                      fontSize: '0.875rem',
                      lineHeight: 1.6,
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button variant="secondary" onClick={() => void handleGenerateDynamics()} loading={loadingAi}>
                <Sparkles size={14} /> Gerar outras ideias
              </Button>
              <Button variant="ghost" onClick={() => setShowAiModal(false)}>
                Fechar
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Modal / Pop-up de Adicionar / Editar Contato da Turma */}
      {showContactModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <Card className="settings-card" style={{ maxWidth: '520px', width: '100%', padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
              <Users size={20} color="#10b981" />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
                {editingContactId ? 'Editar Responsável' : 'Novo Responsável / Apoio'}
              </h2>
            </div>
            <p style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              Cadastre monitores ou pontos de contato pedagógico da turma <strong>{teachingClass.code}</strong>.
            </p>

            <form onSubmit={(e) => void handleSaveContactModal(e)}>
              <Field label="1. Nome do Responsável">
                <Input
                  placeholder="Ex.: Franciely Santos"
                  value={contactFormName}
                  onChange={(e) => setContactFormName(e.target.value)}
                  required
                />
              </Field>

              <Field label="2. Função na Turma">
                <Input
                  placeholder="Ex.: Monitor(a), Apoio Pedagógico, Coordenador(a)"
                  value={contactFormRole}
                  onChange={(e) => setContactFormRole(e.target.value)}
                  required
                />
              </Field>

              <Field label="3. WhatsApp (número com DDD)">
                <Input
                  placeholder="Ex.: 11 95440-3048"
                  value={contactFormWhatsApp}
                  onChange={(e) => setContactFormWhatsApp(e.target.value)}
                />
                <small style={{ display: 'block', marginTop: '0.25rem', color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.75rem' }}>
                  Ao clicar no botão, abrirá o aplicativo do WhatsApp instalado no celular ou computador.
                </small>
              </Field>

              <Field label="4. Microsoft Teams (e-mail institucional ou link)">
                <Input
                  placeholder="Ex.: franciely@instituicao.edu.br ou link do chat"
                  value={contactFormTeams}
                  onChange={(e) => setContactFormTeams(e.target.value)}
                />
                <small style={{ display: 'block', marginTop: '0.25rem', color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.75rem' }}>
                  Ao clicar no botão, direcionará diretamente para o chat do Teams.
                </small>
              </Field>

              <Field label="5. Observações / Disponibilidade (opcional)">
                <Input
                  placeholder="Ex.: Presente às terças e quintas; plantão no Discord"
                  value={contactFormNotes}
                  onChange={(e) => setContactFormNotes(e.target.value)}
                />
              </Field>

              <label className="switch-row" style={{ marginTop: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <strong>Contato Principal</strong>
                  <span>Exibir em destaque no card de Próxima Aula e cockpit da turma.</span>
                </div>
                <input
                  type="checkbox"
                  checked={contactFormIsPrimary}
                  onChange={(e) => setContactFormIsPrimary(e.target.checked)}
                />
              </label>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <Button type="button" variant="ghost" onClick={() => setShowContactModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary">
                  <Check size={16} /> Salvar Responsável
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}

function formatHours(value: number) {
  return `${String(value).replace('.', ',')}h`
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`)
  )
}