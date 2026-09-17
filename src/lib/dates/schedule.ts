import { Temporal } from 'temporal-polyfill'
import type { ScheduleEvent } from '../../types/domain'

export type TemporalEventState = 'future' | 'soon' | 'in_progress' | 'finished' | 'pending_time'

function splitDate(date: string): [number, number, number] {
  if (!date) return [2026, 1, 1]
  const [year, month, day] = date.split('-').map(Number)
  return [year || 2026, month || 1, day || 1]
}

function splitTime(time: string): [number, number] {
  if (!time) return [0, 0]
  const [hour, minute] = time.split(':').map(Number)
  return [hour ?? 0, minute ?? 0]
}

export function zonedEpochMilliseconds(date: string, time: string, timeZone: string): number {
  try {
    const [year, month, day] = splitDate(date)
    const [hour, minute] = splitTime(time)
    return Number(Temporal.ZonedDateTime.from({ year, month, day, hour, minute, timeZone }).epochMilliseconds)
  } catch {
    return 0
  }
}

export function todayIso(now: Date, timeZone: string): string {
  return Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(timeZone).toPlainDate().toString()
}

export function getTemporalEventState(
  event: ScheduleEvent,
  now: Date,
  timeZone = 'America/Sao_Paulo',
  soonMinutes = 30,
): TemporalEventState {
  if (event.timeStatus === 'pending' || !event.startTime || !event.endTime) return 'pending_time'
  const start = zonedEpochMilliseconds(event.eventDate, event.startTime, timeZone)
  const end = zonedEpochMilliseconds(event.eventDate, event.endTime, timeZone)
  const current = now.getTime()
  if (current >= end) return 'finished'
  if (current >= start) return 'in_progress'
  if (start - current <= soonMinutes * 60_000) return 'soon'
  return 'future'
}

export function eventHasElapsed(event: ScheduleEvent, now: Date, timeZone: string): boolean {
  const today = todayIso(now, timeZone)
  if (event.eventDate < today) return true
  if (event.eventDate > today) return false
  if (!event.endTime || event.timeStatus === 'pending') return false
  return now.getTime() >= zonedEpochMilliseconds(event.eventDate, event.endTime, timeZone)
}

export function nextScheduleEvent(
  events: ScheduleEvent[],
  now: Date,
  timeZone = 'America/Sao_Paulo',
): ScheduleEvent | null {
  const today = todayIso(now, timeZone)
  return [...events]
    .filter((event) => event.eventDate >= today && !eventHasElapsed(event, now, timeZone))
    .sort((a, b) => `${a.eventDate}T${a.startTime ?? '99:99'}`.localeCompare(`${b.eventDate}T${b.startTime ?? '99:99'}`))[0] ?? null
}

export function formatLongDate(date: string, locale = 'pt-BR'): string {
  const [year, month, day] = splitDate(date)
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}
