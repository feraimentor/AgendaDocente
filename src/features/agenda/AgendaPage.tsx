import { useEffect, useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import type { EventClickArg, EventInput } from '@fullcalendar/core'
import { CalendarRange, Search } from 'lucide-react'
import { EmptyState, ErrorState, Input, LoadingState, PageTitle } from '../../components/ui'
import { useWorkspace } from '../../app/providers/WorkspaceProvider'
import { useEvents } from '../data/queries'
import type { EventWithRelations } from '../../types/domain'
import { EventDetailSheet } from './EventDetailSheet'
import { useAuth } from '../auth/AuthProvider'
import { useProfile } from '../data/queries'

export function AgendaPage() {
  const { user } = useAuth()
  const profile = useProfile(user?.id)
  const { selectedCycleId, selectedClassId } = useWorkspace()
  const events = useEvents(selectedCycleId)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState<'all' | 'with' | 'pending'>('all')
  const [selected, setSelected] = useState<EventWithRelations | null>(null)
  const [mobile, setMobile] = useState(() => window.innerWidth < 760)
  useEffect(() => { const update = () => setMobile(window.innerWidth < 760); window.addEventListener('resize', update); return () => window.removeEventListener('resize', update) }, [])

  const filtered = useMemo(() => (events.data ?? []).filter((event) => {
    if (selectedClassId && event.classId !== selectedClassId) return false
    if (actionFilter === 'with' && !event.actionText) return false
    if (actionFilter === 'pending' && (!event.actionText || event.actionStatus === 'completed')) return false
    const haystack = [event.classCode, event.title, event.actionText, event.instructorName, event.note].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR')
    return haystack.includes(search.toLocaleLowerCase('pt-BR'))
  }), [actionFilter, events.data, search, selectedClassId])

  const calendarEvents: EventInput[] = filtered.map((event) => ({
    id: event.id,
    title: `${event.classCode} · ${event.title}`,
    start: event.startTime ? `${event.eventDate}T${event.startTime}:00` : event.eventDate,
    end: event.endTime ? `${event.eventDate}T${event.endTime}:00` : undefined,
    allDay: !event.startTime,
    classNames: [`calendar-color-${event.classColor ?? 'teal'}`, event.timeStatus === 'pending' ? 'pending-time' : ''],
    extendedProps: { source: event },
  }))

  if (events.isLoading) return <LoadingState label="Carregando agenda…" />
  if (events.isError) return <ErrorState message={events.error.message} />
  return <div><PageTitle eyebrow="Explorar" title="Agenda" description="Dia, semana ou mês — com os detalhes certos na hora certa." />
    <div className="agenda-toolbar"><div className="search-box"><Search size={17} /><Input aria-label="Buscar na agenda" placeholder="Buscar turma, aula, ação ou nota…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><label className="select-wrap"><span className="sr-only">Filtrar por ação</span><select value={actionFilter} onChange={(event) => setActionFilter(event.target.value as typeof actionFilter)}><option value="all">Todas as ações</option><option value="with">Com ação</option><option value="pending">Ação pendente</option></select></label></div>
    {!calendarEvents.length ? <EmptyState icon={<CalendarRange />} title="Nenhum evento encontrado." description="Ajuste sua busca ou os filtros da agenda." /> : <div className="calendar-wrap"><FullCalendar plugins={[dayGridPlugin, timeGridPlugin, listPlugin]} locale={ptBrLocale} initialView={mobile ? 'listWeek' : ({ day: 'timeGridDay', week: 'timeGridWeek', month: 'dayGridMonth' })[profile.data?.default_agenda_view ?? 'week']} headerToolbar={{ left: 'prev,next today', center: 'title', right: mobile ? 'listWeek,dayGridMonth' : 'timeGridDay,timeGridWeek,dayGridMonth' }} buttonText={{ today: 'Hoje', day: 'Dia', week: 'Semana', month: 'Mês', list: 'Lista' }} events={calendarEvents} eventClick={(argument: EventClickArg) => setSelected(argument.event.extendedProps.source as EventWithRelations)} nowIndicator scrollTime="07:00:00" slotMinTime="06:00:00" slotMaxTime="23:00:00" allDayText="Sem horário" height="auto" weekends={profile.data?.show_weekends ?? true} firstDay={profile.data?.week_starts_on ?? 1} /></div>}
    <EventDetailSheet event={selected} cycleId={selectedCycleId} onClose={() => setSelected(null)} />
  </div>
}
