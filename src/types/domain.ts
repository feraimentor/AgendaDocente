export type TimeStatus = 'defined' | 'pending'
export type EventKind = 'class' | 'special' | 'other'
export type ActionStatus = 'pending' | 'completed'

export interface ScheduleEvent {
  id?: string
  classCode: string
  classSourceLabel: string
  eventDate: string
  title: string
  eventKind: EventKind
  startTime: string | null
  endTime: string | null
  timeStatus: TimeStatus
  originalTimeText: string | null
  instructorName: string | null
  materialsSourceStatus: true | null
  actionText: string | null
  normalizedActionText: string | null
  sourceRowNumber: number
  sourceOrder: number
  identityHash: string
  rowHash: string
  sourcePayload: Record<string, string>
}

export interface ImportIssue {
  level: 'info' | 'warning' | 'error'
  code: string
  message: string
  row?: number
}

export type CsvCanonicalField = 'date' | 'class' | 'title' | 'time' | 'instructor' | 'action' | 'materials'
export type CsvColumnMapping = Partial<Record<CsvCanonicalField, string>>

export interface ImportPreview {
  events: ScheduleEvent[]
  issues: ImportIssue[]
  rawRowCount: number
  validRowCount: number
  classes: string[]
  periodStart: string | null
  periodEnd: string | null
  pendingTimeCount: number
  actionRowCount: number
  distinctActions: string[]
  structuredTimeFormats: string[]
  headers: string[]
  columnMapping: CsvColumnMapping
  fatal: boolean
}

export interface ImportDiffItem {
  type: 'created' | 'updated' | 'removed' | 'unchanged'
  identityHash: string
  before: ScheduleEvent | null
  after: ScheduleEvent | null
  changedFields: string[]
}

export interface ImportDiff {
  created: ImportDiffItem[]
  updated: ImportDiffItem[]
  removed: ImportDiffItem[]
  unchanged: ImportDiffItem[]
  warnings: ImportIssue[]
}

export interface EventWithRelations extends ScheduleEvent {
  classId?: string
  actionId?: string
  actionStatus?: ActionStatus
  actionCompletedAt?: string | null
  note?: string | null
  classColor?: string | null
  isAuthorialAction?: boolean
}

export type UserRole = 'master' | 'admin' | 'professor' | 'mentor'
export type AccountStatus = 'pending_approval' | 'active' | 'suspended'

export interface UserRoleRecord {
  id?: string
  userId: string
  role: UserRole
  createdAt: string
}

export interface UserProfile {
  id: string
  full_name: string
  display_name: string | null
  avatar_path: string | null
  job_title: string | null
  phone: string | null
  timezone: string
  locale: string
  theme: 'system' | 'light' | 'dark'
  default_agenda_view: 'day' | 'week' | 'month'
  week_starts_on: number
  show_weekends: boolean
  hour_format: '24h'
  account_status: AccountStatus
  created_at: string
  updated_at: string
}

export interface ClassTask {
  id: string
  user_id: string
  class_id: string
  title: string
  is_pinned: boolean
  is_completed: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface UserAction {
  id: string
  user_id: string
  institution_id?: string | null
  class_id?: string | null
  cycle_id?: string | null
  title: string
  due_date?: string | null
  status: ActionStatus
  completed_at?: string | null
  created_at: string
  updated_at: string
  classCode?: string | null
  classColor?: string | null
}

export interface InstitutionIntegration {
  id: string
  institution_id: string
  user_id: string
  provider: 'google_calendar' | 'moodle' | 'teams' | 'canvas' | 'airtable' | 'custom_api'
  display_name: string
  api_endpoint?: string | null
  auth_type: string
  is_active: boolean
  allow_admin_access: boolean
  created_at: string
  updated_at: string
}

export interface ClassPreferencesData {
  id?: string
  user_id: string
  class_id: string
  color_token?: string | null
  note_text?: string | null
  meeting_url?: string | null
  drive_url?: string | null
  contact_info?: string | null
}
