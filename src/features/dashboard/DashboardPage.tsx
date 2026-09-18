import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, CalendarCheck2, Check, CheckSquare2, Clock3, Import, RefreshCw, Sparkles, TriangleAlert, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState } from '../../components/ui'
import { useAuth } from '../auth/AuthProvider'
import { useEvents, useImports, useProfile, useToggleAction } from '../data/queries'
import { useWorkspace } from '../../app/providers/WorkspaceProvider'
import { cycleProgress, findScheduleConflicts, totalKnownHours } from '../../lib/schedule/metrics'
import { formatLongDate, getTemporalEventState, nextScheduleEvent, todayIso } from '../../lib/dates/schedule'
import { generateDailyBriefing } from '../../lib/ai/gemini'
import type { EventWithRelations } from '../../types/domain'

export function DashboardPage() {
  const { user } = useAuth()
  const profile = useProfile(user?.id)
  const { selectedCycleId, selectedClassId } = useWorkspace()
  const eventsQuery = useEvents(selectedCycleId)
  const imports = useImports(selectedCycleId)
  const toggleAction = useToggleAction(selectedCycleId)

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

  const todayEvents = useMemo(() => events.filter((event) => event.eventDate === today), [events, today])
  const next = useMemo(
    () => (events.length ? (nextScheduleEvent(events, now, timeZone) as EventWithRelations | null) : null),
    [events, now, timeZone]
  )
  const pendingActions = useMemo(
    () => events.filter((event) => event.actionId && event.actionStatus !== 'completed'),
    [events]
  )
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
        pendingActionsCount: pendingActions.length,
      })
      setBriefing(text)
    } finally {
      setLoadingBriefing(false)
    }
  }, [displayName, events.length, next, pendingActions.length, today, todayEvents.length])

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
            <NextEvent event={next} now={now} timeZone={timeZone} todayCount={todayEvents.length} />
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
          <Kpi label="Ações pendentes" value={String(pendingActions.length)} icon={<CheckSquare2 />} />
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
                );
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
            {pendingActions.length ? (
              pendingActions.slice(0, 4).map((event) => (
                <div className="quick-action" key={event.actionId}>
                  <span className={`class-dot color-${event.classColor ?? 'teal'}`} />
                  <div>
                    <strong>{event.actionText}</strong>
                    <span>
                      {event.classCode} · {shortDate(event.eventDate)}
                    </span>
                  </div>
                  <Button
                    size="icon"
                    variant="secondary"
                    aria-label={`Concluir ${event.actionText}`}
                    onClick={() =>
                      event.actionId && toggleAction.mutate({ actionId: event.actionId, status: 'completed' })
                    }
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
  now,
  timeZone,
  todayCount,
}: {
  event: EventWithRelations
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

function shortDate(value: string) {
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
