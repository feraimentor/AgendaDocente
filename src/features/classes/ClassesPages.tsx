import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, CalendarClock, Check, Clock3, Link2, Palette, Pin, PinOff, Plus, Sparkles, Trash2, UsersRound, Video } from 'lucide-react'
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
  const [contactInfo, setContactInfo] = useState(teachingClass?.contact_info ?? '')
  const [savingPrefs, setSavingPrefs] = useState(false)

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
      setContactInfo(teachingClass.contact_info ?? '')
    }
  }, [teachingClass])

  if (classes.isLoading || events.isLoading) return <LoadingState />
  if (!teachingClass) {
    return <EmptyState title="Turma não encontrada." description="Ela pode ter sido arquivada ou pertencer a outro ciclo." />
  }

  const cycle = cycles.data?.find((item) => item.id === teachingClass.cycle_id)
  const next = nextScheduleEvent(classEvents, new Date())

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
          contact_info: contactInfo.trim() || null,
        },
        { onConflict: 'user_id,class_id' }
      )
      if (result.error) throw result.error
      toast.success('Configurações e links da turma salvos!')
      void queryClient.invalidateQueries({ queryKey: queryKeys.classes(selectedCycleId) })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar.')
    } finally {
      setSavingPrefs(false)
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
                <strong style={{ display: 'block', marginBottom: '1rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                  {formatDate(next.eventDate)} · {next.startTime ?? 'Horário a confirmar'}
                </strong>

                {meetingUrl && (
                  <a
                    href={meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button button-primary button-md"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <Video size={16} /> Entrar na Sala Virtual
                  </a>
                )}
              </div>
            ) : (
              <p style={{ marginTop: '0.5rem' }}>Não há próximos encontros cadastrados.</p>
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
              <div className="input-icon">
                <Video size={17} />
                <Input
                  placeholder="https://teams.microsoft.com/l/meetup-join/..."
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                />
              </div>
            </Field>

            <Field label="Link do Drive / Repositório de Slides">
              <div className="input-icon">
                <Link2 size={17} />
                <Input
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                />
              </div>
            </Field>

            <Field label="Contato do Monitor / Apoio Pedagógico">
              <Input
                placeholder="Ex.: Monitor Carlos (11 99999-0000)"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
              />
            </Field>

            <Button type="submit" loading={savingPrefs}>
              Salvar configurações
            </Button>
          </form>
        </Card>
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