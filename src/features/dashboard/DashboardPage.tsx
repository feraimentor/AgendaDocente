import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  CalendarCheck2,
  Check,
  CheckSquare2,
  Clock3,
  FolderOpen,
  Import,
  MessageCircle,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Users,
  Video,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState } from '../../components/ui'
import { useAuth } from '../auth/AuthProvider'
import {
  useAllCycleClassTasks,
  useClasses,
  useEvents,
  useImports,
  useProfile,
  useToggleAction,
  useToggleClassTask,
  useToggleUserAction,
  useUserActions,
} from '../data/queries'
import { useWorkspace } from '../../app/providers/WorkspaceProvider'
import { cycleProgress, findScheduleConflicts, totalKnownHours } from '../../lib/schedule/metrics'
import { formatLongDate, getTemporalEventState, nextScheduleEvent, todayIso } from '../../lib/dates/schedule'
import { generateDailyBriefing } from '../../lib/ai/gemini'
import { formatTeamsUrl, formatWhatsAppUrl, parseClassContacts } from '../../lib/contacts/classContacts'
import type { EventWithRelations } from '../../types/domain'

export function DashboardPage() {
  const { user } = useAuth()
  const profile = useProfile(user?.id)
  const { selectedCycleId, selectedClassId } = useWorkspace()
  const eventsQuery = useEvents(selectedCycleId)
  const classesQuery = useClasses(selectedCycleId)
  const userActionsQuery = useUserActions(selectedCycleId)
  const cycleTasksQuery = useAllCycleClassTasks(selectedCycleId)
  const imports = useImports(selectedCycleId)
  const toggleAction = useToggleAction(selectedCycleId)
  const toggleUserAction = useToggleUserAction(selectedCycleId)
  const toggleClassTask = useToggleClassTask()

  const [briefing, setBriefing] = useState<string>('')
  const [loadingBriefing, setLoadingBriefing] = useState(false)
  const [dismissedConflicts, setDismissedConflicts] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('dismissed_conflicts') || '[]')
    } catch {
      return []
    }
  })

  const timeZone = profile.data?.timezone ?? 'America/Sao_Paulo'
  const now = useMemo(() => new Date(), [])
  const today = todayIso(now, timeZone)

  const allEvents = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data])
  const events = useMemo(
    () => (selectedClassId ? allEvents.filter((event) => event.classId === selectedClassId) : allEvents),
    [allEvents, selectedClassId]
  )

  const classes = useMemo(() => classesQuery.data ?? [], [classesQuery.data])
  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes])

  const todayEvents = useMemo(() => events.filter((event) => event.eventDate === today), [events, today])
  const next = useMemo(
    () => (events.length ? (nextScheduleEvent(events, now, timeZone) as EventWithRelations | null) : null),
    [events, now, timeZone]
  )
  const nextTeachingClass = useMemo(
    () => (next?.classId ? classMap.get(next.classId) : undefined),
    [classMap, next]
  )

  // 1. Institucionais pendentes
  const institutionalPending = useMemo(() => {
    return events
      .filter((event) => event.actionId && event.actionStatus !== 'completed')
      .map((event) => ({
        id: event.actionId!,
        title: event.actionText || 'Ação do cronograma',
        subtitle: `${event.classCode} · ${shortDate(event.eventDate)}`,
        origin: 'institutional' as const,
        originLabel: 'Cronograma',
        classColor: event.classColor ?? 'teal',
        onComplete: () => event.actionId && toggleAction.mutate({ actionId: event.actionId, status: 'completed' }),
      }))
  }, [events, toggleAction])

  // 2. Ações autorais pendentes
  const authorialPending = useMemo(() => {
    return (userActionsQuery.data ?? [])
      .filter((ua) => ua.status !== 'completed')
      .filter((ua) => !selectedClassId || ua.class_id === selectedClassId)
      .map((ua) => {
        const classObj = ua.class_id ? classMap.get(ua.class_id) : undefined
        return {
          id: ua.id,
          title: ua.title,
          subtitle: `${classObj ? classObj.code : 'Geral'}${ua.due_date ? ` · Prazo: ${shortDate(ua.due_date)}` : ''}`,
          origin: 'authorial' as const,
          originLabel: 'Autoral',
          classColor: classObj?.color_token ?? 'indigo',
          onComplete: () => toggleUserAction.mutate({ id: ua.id, status: 'completed' }),
        }
      })
  }, [userActionsQuery.data, selectedClassId, classMap, toggleUserAction])

  // 3. Notas / Tarefas do Quadro da Turma pendentes
  const classTasksPending = useMemo(() => {
    return (cycleTasksQuery.data ?? [])
      .filter((ct) => !ct.is_completed)
      .filter((ct) => !selectedClassId || ct.class_id === selectedClassId)
      .map((ct) => ({
        id: ct.id,
        title: ct.title,
        subtitle: `Turma ${ct.classCode}`,
        origin: 'class_task' as const,
        originLabel: ct.classCode,
        classColor: ct.classColor ?? 'teal',
        onComplete: () => toggleClassTask.mutate({ id: ct.id, isCompleted: true }),
      }))
  }, [cycleTasksQuery.data, selectedClassId, toggleClassTask])

  // Unificação de todas as ações pendentes
  const unifiedPendingActions = useMemo(() => {
    return [...institutionalPending, ...authorialPending, ...classTasksPending]
  }, [institutionalPending, authorialPending, classTasksPending])
  const weekEvents = useMemo(() => filterCurrentWeek(events, today), [events, today])
  const progress = useMemo(() => cycleProgress(events, now, timeZone), [events, now, timeZone])

  const conflicts = useMemo(
    () =>
      findScheduleConflicts(events).filter(
        (c) => c.date >= today && !dismissedConflicts.includes(`${c.date}_${c.first.classCode}_${c.second.classCode}`)
      ),
    [dismissedConflicts, events, today]
  )

  const displayName = profile.data?.display_name || profile.data?.full_name?.split(' ')[0] || 'Professor'
  const greeting = greetingFor(now, timeZone)

  const handleDismissConflict = (conflictKey: string) => {
    const updated = [...dismissedConflicts, conflictKey]
    setDismissedConflicts(updated)
    try {
      sessionStorage.setItem('dismissed_conflicts', JSON.stringify(updated))
    } catch {
      // noop
    }
  }

  const loadBriefing = useCallback(async () => {
    if (!events.length) return
    setLoadingBriefing(true)
    try {
      const text = await generateDailyBriefing({
        teacherName: displayName,
        dateStr: formatLongDate(today),
        todayCount: todayEvents.length,
        nextEvent: next ? { title: next.title, time: next.startTime || 'A definir', classCode: next.classCode } : undefined,
        pendingActionsCount: unifiedPendingActions.length,
      })
      setBriefing(text)
    } finally {
      setLoadingBriefing(false)
    }
  }, [displayName, events.length, next, unifiedPendingActions.length, today, todayEvents.length])

  useEffect(() => {
    if (events.length > 0) {
      void loadBriefing()
    }
  }, [events.length, loadBriefing])

  // Retornos condicionais estritamente após a declaração de todos os hooks:
  if (!selectedCycleId || eventsQuery.isLoading || profile.isLoading) {
    return <LoadingState label="Montando seu cockpit sereno…" />
  }

  if (eventsQuery.isError) {
    return <ErrorState message={eventsQuery.error.message} retry={() => void eventsQuery.refetch()} />
  }

  if (!events.length) {
    return (
      <EmptyState
        icon={<CalendarCheck2 size={36} />}
        title="Sua agenda está vazia."
        description="Importe seu primeiro cronograma para descobrir sua próxima aula com zero cliques."
        action={
          <Link className="button button-primary button-md" to="/imports/new">
            <Import size={16} /> Importar CSV
          </Link>
        }
      />
    )
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">{greeting}, {displayName}</p>
          <h1>{formatLongDate(today)}</h1>
          <p>{todayEvents.length ? 'Aqui está o ritmo do seu dia.' : 'Um dia mais leve por aqui.'}</p>
        </div>
        <div className="header-meta">
          <span>Última atualização</span>
          <strong>{imports.data?.[0]?.completed_at ? relativeDate(imports.data[0].completed_at) : 'Ainda não importado'}</strong>
          <Link className="button button-secondary button-sm" to="/imports/new">
            <Import size={15} /> Atualizar cronograma
          </Link>
        </div>
      </header>

      {/* Calm Tech: Briefing Matinal Inteligente com Google Gemini */}
      {briefing && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(56, 189, 248, 0.05) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: '1rem',
            padding: '1.25rem 1.5rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
            <span style={{ color: '#10b981', marginTop: '0.125rem' }}>
              <Sparkles size={20} />
            </span>
            <div>
              <strong
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#10b981',
                  marginBottom: '0.25rem',
                }}
              >
                Briefing Sereno · Gemini AI
              </strong>
              <p style={{ margin: 0, fontSize: '0.9375rem', lineHeight: 1.5, color: 'var(--color-text, #f8fafc)' }}>
                {briefing}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Atualizar briefing"
            onClick={() => void loadBriefing()}
            loading={loadingBriefing}
          >
            <RefreshCw size={15} />
          </Button>
        </div>
      )}

      <section className="hero-grid">
        <Card className="now-card">
          <div className="now-card-top">
            <span className="live-dot" />
            <span>Agora / próxima aula</span>
            <Sparkles size={17} />
          </div>
          {next ? (
            <NextEvent
              event={next}
              teachingClass={nextTeachingClass}
              now={now}
              timeZone={timeZone}
              todayCount={todayEvents.length}
            />
          ) : (
            <div className="now-empty">
              <h2>Ciclo concluído</h2>
              <p>Não há próximos eventos neste cronograma.</p>
            </div>
          )}
        </Card>
        <div className="kpi-grid">
          <Kpi label="Aulas hoje" value={String(todayEvents.length)} icon={<CalendarCheck2 />} />
          <Kpi label="Aulas na semana" value={String(weekEvents.length)} icon={<CalendarCheck2 />} />
          <Kpi label="Horas na semana" value={formatHours(totalKnownHours(weekEvents))} icon={<Clock3 />} />
          <Kpi label="Ações pendentes" value={String(unifiedPendingActions.length)} icon={<CheckSquare2 />} />
        </div>
      </section>

      {/* Conflito de Horário Inteligente com Botão de Dispensar */}
      {conflicts.length > 0 && conflicts[0] && (
        <div className="warning-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <TriangleAlert size={18} />
            <div>
              <strong>Conflito de horário detectado</strong>
              <span>
                {conflicts[0].date} · {conflicts[0].first.classCode} e {conflicts[0].second.classCode}
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Dispensar aviso de conflito"
            onClick={() => {
              const firstConflict = conflicts[0]
              if (firstConflict) {
                handleDismissConflict(
                  `${firstConflict.date}_${firstConflict.first.classCode}_${firstConflict.second.classCode}`
                )
              }
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              padding: '0.25rem',
              opacity: 0.8,
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      <section className="dashboard-columns">
        <Card className="section-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Próximos dias</p>
              <h2>Compromissos</h2>
            </div>
            <Link to="/agenda">
              Ver agenda <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="upcoming-list">
            {events
              .filter((event) => event.eventDate >= today)
              .slice(0, 5)
              .map((event) => (
                <EventRow key={event.id ?? event.identityHash} event={event} today={today} />
              ))}
          </div>
        </Card>

        {/* Foco: Ações Unificadas (Cronograma, Autorais e Anotações da Turma) */}
        <Card className="section-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Foco</p>
              <h2>Minhas ações</h2>
            </div>
            <Link to="/actions">
              Ver todas <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="action-list">
            {unifiedPendingActions.length ? (
              unifiedPendingActions.slice(0, 5).map((item) => (
                <div className="quick-action" key={`${item.origin}_${item.id}`}>
                  <span className={`class-dot color-${item.classColor}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.125rem' }}>
                      <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>
                        {item.title}
                      </strong>
                      <Badge
                        tone={
                          item.origin === 'institutional'
                            ? 'warning'
                            : item.origin === 'authorial'
                            ? 'accent'
                            : 'positive'
                        }
                      >
                        {item.originLabel}
                      </Badge>
                    </div>
                    <span>{item.subtitle}</span>
                  </div>
                  <Button
                    size="icon"
                    variant="secondary"
                    aria-label={`Concluir ${item.title}`}
                    onClick={() => item.onComplete()}
                  >
                    <Check size={16} />
                  </Button>
                </div>
              ))
            ) : (
              <p className="muted-block">Tudo em dia. Nenhuma ação pendente.</p>
            )}
          </div>
        </Card>
      </section>

      <section className="dashboard-columns lower">
        <Card className="section-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Visão rápida</p>
              <h2>Minha semana</h2>
            </div>
          </div>
          <WeekStrip events={weekEvents} today={today} />
        </Card>
        <Card className="progress-card">
          <p className="eyebrow">Progresso do ciclo</p>
          <div className="progress-number">
            <strong>{progress}%</strong>
            <span>das aulas transcorridas</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
          <p>
            {events.filter((event) => event.eventDate < today).length} de {events.length} encontros já passaram
          </p>
        </Card>
      </section>
    </div>
  )
}

function NextEvent({
  event,
  teachingClass,
  now,
  timeZone,
  todayCount,
}: {
  event: EventWithRelations
  teachingClass?: {
    id: string
    code: string
    meeting_url?: string | null
    drive_url?: string | null
    contact_info?: string | null
  }
  now: Date
  timeZone: string
  todayCount: number
}) {
  const state = getTemporalEventState(event, now, timeZone)
  const isToday = event.eventDate === todayIso(now, timeZone)
  const heading =
    state === 'in_progress'
      ? 'Aula em andamento'
      : state === 'soon'
      ? 'Começa em breve'
      : isToday
      ? `Você tem ${todayCount} ${todayCount === 1 ? 'aula' : 'aulas'} hoje`
      : 'Sua próxima aula'

  const meetingUrl = teachingClass?.meeting_url
  const driveUrl = teachingClass?.drive_url
  const contacts = useMemo(() => parseClassContacts(teachingClass?.contact_info), [teachingClass?.contact_info])
  const primaryContact = contacts.find((c) => c.is_primary) ?? contacts[0]
  const whatsUrl = primaryContact?.whatsapp ? formatWhatsAppUrl(primaryContact.whatsapp) : ''
  const teamsUrl = primaryContact?.teams ? formatTeamsUrl(primaryContact.teams) : ''
  const hasQuickActions = Boolean(meetingUrl || driveUrl || whatsUrl || teamsUrl)

  return (
    <div className="next-event">
      <Badge tone={state === 'in_progress' ? 'positive' : state === 'pending_time' ? 'warning' : 'accent'}>
        {heading}
      </Badge>
      <div className="next-class">
        <span className={`class-bar color-${event.classColor ?? 'teal'}`} />
        <div>
          <strong>{event.classCode}</strong>
          <span>{isToday ? 'Hoje' : formatLongDate(event.eventDate).replace(/ de 2026$/, '')}</span>
        </div>
      </div>
      <h2>{event.title}</h2>
      <div className="event-time">
        <Clock3 size={19} />
        <strong>
          {event.timeStatus === 'pending' ? 'Horário a confirmar' : `${event.startTime} → ${event.endTime}`}
        </strong>
      </div>
      {state === 'in_progress' && <p>Termina às {event.endTime}</p>}

      {/* Botões redondos translúcidos de acesso rápido (Sala Virtual, Drive, WhatsApp, Teams) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        {meetingUrl && (
          <a
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Entrar na Sala Virtual"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.16)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            }}
          >
            <Video size={18} />
          </a>
        )}

        {driveUrl && (
          <a
            href={driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir pasta no Google Drive"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.16)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            }}
          >
            <FolderOpen size={18} />
          </a>
        )}

        {primaryContact && whatsUrl && (
          <a
            href={whatsUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`WhatsApp: ${primaryContact.name} (${primaryContact.role})`}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(37, 211, 102, 0.22)',
              border: '1px solid rgba(37, 211, 102, 0.45)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#4ade80',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            }}
          >
            <MessageCircle size={18} />
          </a>
        )}

        {primaryContact && teamsUrl && (
          <a
            href={teamsUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Microsoft Teams: ${primaryContact.name} (${primaryContact.role})`}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(99, 102, 241, 0.25)',
              border: '1px solid rgba(99, 102, 241, 0.45)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a5b4fc',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            }}
          >
            <Users size={18} />
          </a>
        )}

        {!hasQuickActions && event.classId && (
          <Link
            to={`/classes/${event.classId}`}
            style={{
              fontSize: '0.75rem',
              color: 'rgba(255, 255, 255, 0.7)',
              textDecoration: 'underline',
              marginTop: '0.25rem',
            }}
          >
            Configurar links da turma (Meet, Drive, Monitor)
          </Link>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="kpi">
      <span>{icon}</span>
      <div>
        <strong>{value}</strong>
        <p>{label}</p>
      </div>
    </Card>
  )
}

function EventRow({ event, today }: { event: EventWithRelations; today: string }) {
  return (
    <div className="event-row">
      <div className="date-tile">
        <strong>{new Date(`${event.eventDate}T00:00:00Z`).getUTCDate()}</strong>
        <span>
          {new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
            .format(new Date(`${event.eventDate}T00:00:00Z`))
            .replace('.', '')}
        </span>
      </div>
      <span className={`class-line color-${event.classColor ?? 'teal'}`} />
      <div className="event-row-copy">
        <div>
          <Badge>{event.classCode}</Badge>
          {event.actionText && <Badge tone="warning">Ação</Badge>}
        </div>
        <strong>{event.title}</strong>
        <span>
          {event.eventDate === today ? 'Hoje' : formatLongDate(event.eventDate).split(',')[0]} ·{' '}
          {event.startTime ?? 'A confirmar'}
        </span>
      </div>
    </div>
  )
}

function WeekStrip({ events, today }: { events: EventWithRelations[]; today: string }) {
  const start = weekStart(today)
  return (
    <div className="week-strip">
      {Array.from({ length: 7 }, (_, index) => addDays(start, index)).map((date) => {
        const items = events.filter((event) => event.eventDate === date)
        return (
          <div key={date} className={date === today ? 'today' : ''}>
            <span>
              {new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
                .format(new Date(`${date}T00:00:00Z`))
                .replace('.', '')}
            </span>
            <strong>{Number(date.slice(-2))}</strong>
            <div>
              {items.map((item) => (
                <i key={item.id} className={`color-${item.classColor ?? 'teal'}`} title={item.classCode} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function greetingFor(now: Date, timeZone: string) {
  const hour = Number(
    new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', hour12: false, timeZone }).format(now)
  )
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
}

function relativeDate(value: string) {
  return new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' }).format(
    Math.round((new Date(value).getTime() - Date.now()) / 86_400_000),
    'day'
  )
}

function shortDate(value?: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`)
  )
}

function formatHours(value: number) {
  return Number.isInteger(value) ? `${value}h` : `${String(value).replace('.', ',')}h`
}

function weekStart(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`)
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - day + 1)
  return date.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function filterCurrentWeek(events: EventWithRelations[], today: string) {
  const start = weekStart(today)
  const end = addDays(start, 6)
  return events.filter((event) => event.eventDate >= start && event.eventDate <= end)
}
