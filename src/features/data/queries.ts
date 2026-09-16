import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requireSupabase } from '../../lib/supabase/client'
import type { EventWithRelations } from '../../types/domain'
import type {
  ActionProgressRow, ClassTaskRow, Cycle, EventActionRow, EventRow, ImportBatch, Institution, Profile, TeachingClass, UserActionRow,
} from '../../types/database'

export const queryKeys = {
  profile: ['profile'] as const,
  institutions: ['institutions'] as const,
  cycles: ['cycles'] as const,
  classes: (cycleId?: string) => ['classes', cycleId ?? 'none'] as const,
  events: (cycleId?: string) => ['events', cycleId ?? 'none'] as const,
  imports: (cycleId?: string) => ['imports', cycleId ?? 'all'] as const,
}

function dataOrThrow<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('Resposta vazia do Supabase.')
  return data
}

export function useProfile(userId?: string) {
  return useQuery({
    queryKey: queryKeys.profile,
    enabled: Boolean(userId),
    queryFn: async () => {
      const result = await requireSupabase().from('profiles').select('*').eq('id', userId!).maybeSingle()
      if (result.error) throw new Error(result.error.message)
      return result.data as Profile | null
    },
  })
}

export function useInstitutions() {
  return useQuery({
    queryKey: queryKeys.institutions,
    queryFn: async () => {
      const result = await requireSupabase().from('institutions').select('*').is('archived_at', null).order('name')
      return dataOrThrow(result.data as Institution[] | null, result.error)
    },
  })
}

export function useCycles() {
  return useQuery({
    queryKey: queryKeys.cycles,
    queryFn: async () => {
      const result = await requireSupabase().from('cycles').select('*').is('archived_at', null).order('start_date', { ascending: false })
      return dataOrThrow(result.data as Cycle[] | null, result.error)
    },
  })
}

export function useClasses(cycleId?: string) {
  return useQuery({
    queryKey: queryKeys.classes(cycleId),
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const client = requireSupabase()
      const classResult = await client.from('teaching_classes').select('*').eq('cycle_id', cycleId!).is('archived_at', null).order('code')
      const classes = dataOrThrow(classResult.data as TeachingClass[] | null, classResult.error)
      if (!classes.length) return classes
      const prefResult = await client.from('class_preferences').select('class_id,color_token,note_text').in('class_id', classes.map((item) => item.id))
      if (prefResult.error) throw new Error(prefResult.error.message)
      const preferences = new Map((prefResult.data as { class_id: string; color_token: string | null; note_text: string | null }[]).map((item) => [item.class_id, item]))
      return classes.map((item) => ({ ...item, ...preferences.get(item.id) }))
    },
  })
}

export function useEvents(cycleId?: string) {
  const classesQuery = useClasses(cycleId)
  return useQuery({
    queryKey: queryKeys.events(cycleId),
    enabled: Boolean(cycleId) && classesQuery.isSuccess,
    queryFn: async (): Promise<EventWithRelations[]> => {
      const classes = classesQuery.data ?? []
      if (!classes.length) return []
      const client = requireSupabase()
      const eventResult = await client.from('events').select('*').in('class_id', classes.map((item) => item.id)).eq('active', true).order('event_date').order('start_time')
      const rows = dataOrThrow(eventResult.data as EventRow[] | null, eventResult.error)
      if (!rows.length) return []
      const ids = rows.map((item) => item.id)
      const [actionsResult, notesResult] = await Promise.all([
        client.from('event_actions').select('*').in('event_id', ids).eq('active', true),
        client.from('event_notes').select('event_id,content').in('event_id', ids),
      ])
      if (actionsResult.error) throw new Error(actionsResult.error.message)
      if (notesResult.error) throw new Error(notesResult.error.message)
      const actions = actionsResult.data as EventActionRow[]
      const actionIds = actions.map((item) => item.id)
      let progress: ActionProgressRow[] = []
      if (actionIds.length) {
        const progressResult = await client.from('action_progress').select('*').in('action_id', actionIds)
        if (progressResult.error) throw new Error(progressResult.error.message)
        progress = progressResult.data as ActionProgressRow[]
      }
      const classMap = new Map(classes.map((item) => [item.id, item]))
      const actionMap = new Map(actions.map((item) => [item.event_id, item]))
      const progressMap = new Map(progress.map((item) => [item.action_id, item]))
      const notes = new Map((notesResult.data as { event_id: string; content: string }[]).map((item) => [item.event_id, item.content]))
      return rows.map((row) => {
        const teachingClass = classMap.get(row.class_id)
        const action = actionMap.get(row.id)
        const actionProgress = action ? progressMap.get(action.id) : undefined
        return {
          id: row.id,
          classId: row.class_id,
          classCode: teachingClass?.code ?? 'Turma',
          classSourceLabel: teachingClass?.source_label ?? teachingClass?.code ?? 'Turma',
          classColor: teachingClass?.color_token,
          eventDate: row.event_date,
          title: row.title,
          eventKind: row.event_kind,
          startTime: row.start_time?.slice(0, 5) ?? null,
          endTime: row.end_time?.slice(0, 5) ?? null,
          timeStatus: row.time_status,
          originalTimeText: row.original_time_text,
          instructorName: row.instructor_name,
          materialsSourceStatus: row.materials_source_status,
          actionText: action?.action_text ?? null,
          normalizedActionText: action?.normalized_action_text ?? null,
          actionId: action?.id,
          actionStatus: actionProgress?.status,
          actionCompletedAt: actionProgress?.completed_at,
          note: notes.get(row.id) ?? null,
          sourceRowNumber: row.source_row_number ?? 0,
          sourceOrder: row.source_order ?? 0,
          identityHash: row.identity_hash,
          rowHash: row.row_hash,
          sourcePayload: row.source_payload ?? {},
        }
      })
    },
  })
}

export function useImports(cycleId?: string) {
  return useQuery({
    queryKey: queryKeys.imports(cycleId),
    queryFn: async () => {
      let query = requireSupabase().from('import_batches').select('*').order('version_number', { ascending: false })
      if (cycleId) query = query.eq('cycle_id', cycleId)
      const result = await query
      return dataOrThrow(result.data as ImportBatch[] | null, result.error)
    },
  })
}

export function useToggleAction(cycleId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ actionId, status }: { actionId: string; status: 'pending' | 'completed' }) => {
      const result = await requireSupabase().from('action_progress').update({
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      }).eq('action_id', actionId).select().single()
      if (result.error) throw new Error(result.error.message)
      return result.data
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.events(cycleId) }),
  })
}

export function useSaveEventNote(cycleId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ eventId, userId, content }: { eventId: string; userId: string; content: string }) => {
      const result = await requireSupabase().from('event_notes').upsert({ user_id: userId, event_id: eventId, content }, { onConflict: 'user_id,event_id' })
      if (result.error) throw new Error(result.error.message)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.events(cycleId) }),
  })
}

export function useUserActions(cycleId?: string) {
  return useQuery({
    queryKey: ['user_actions', cycleId ?? 'all'],
    queryFn: async () => {
      let query = requireSupabase().from('user_actions').select('*').order('created_at', { ascending: false })
      if (cycleId) query = query.or(`cycle_id.eq.${cycleId},cycle_id.is.null`)
      const result = await query
      if (result.error) throw new Error(result.error.message)
      return (result.data || []) as UserActionRow[]
    },
  })
}

export function useCreateUserAction(_cycleId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { userId: string; title: string; dueDate?: string; classId?: string; cycleId?: string }) => {
      const result = await requireSupabase().from('user_actions').insert({
        user_id: payload.userId,
        title: payload.title,
        due_date: payload.dueDate || null,
        class_id: payload.classId || null,
        cycle_id: payload.cycleId || null,
        status: 'pending',
      }).select().single()
      if (result.error) throw new Error(result.error.message)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user_actions'] })
    },
  })
}

export function useToggleUserAction(_cycleId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'pending' | 'completed' }) => {
      const result = await requireSupabase().from('user_actions').update({
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      }).eq('id', id).select().single()
      if (result.error) throw new Error(result.error.message)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user_actions'] })
    },
  })
}

export function useDeleteUserAction(_cycleId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await requireSupabase().from('user_actions').delete().eq('id', id)
      if (result.error) throw new Error(result.error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user_actions'] })
    },
  })
}

export function useClassTasks(classId?: string) {
  return useQuery({
    queryKey: ['class_tasks', classId ?? 'none'],
    enabled: Boolean(classId),
    queryFn: async () => {
      const result = await requireSupabase()
        .from('class_tasks')
        .select('*')
        .eq('class_id', classId!)
        .is('archived_at', null)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
      if (result.error) throw new Error(result.error.message)
      return (result.data || []) as ClassTaskRow[]
    },
  })
}

export function useCreateClassTask(classId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, classId, title }: { userId: string; classId: string; title: string }) => {
      const result = await requireSupabase().from('class_tasks').insert({
        user_id: userId,
        class_id: classId,
        title,
        is_pinned: false,
        is_completed: false,
      }).select().single()
      if (result.error) throw new Error(result.error.message)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['class_tasks', classId] })
    },
  })
}

export function useToggleClassTask(classId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, isCompleted }: { id: string; isCompleted: boolean }) => {
      const result = await requireSupabase().from('class_tasks').update({
        is_completed: isCompleted,
      }).eq('id', id).select().single()
      if (result.error) throw new Error(result.error.message)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['class_tasks', classId] })
    },
  })
}

export function usePinClassTask(classId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, isPinned }: { id: string; isPinned: boolean }) => {
      const result = await requireSupabase().from('class_tasks').update({
        is_pinned: isPinned,
      }).eq('id', id).select().single()
      if (result.error) throw new Error(result.error.message)
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['class_tasks', classId] })
    },
  })
}

export function useDeleteClassTask(classId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await requireSupabase().from('class_tasks').delete().eq('id', id)
      if (result.error) throw new Error(result.error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['class_tasks', classId] })
    },
  })
}

