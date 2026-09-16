export interface Profile {
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
  account_status?: 'pending_approval' | 'active' | 'suspended'
  created_at: string
  updated_at: string
}

export interface Institution {
  id: string
  user_id: string
  name: string
  short_name: string | null
  logo_path: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface Cycle {
  id: string
  user_id: string
  institution_id: string
  code: string
  name: string | null
  start_date: string | null
  end_date: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface TeachingClass {
  id: string
  user_id: string
  cycle_id: string
  code: string
  source_label: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
  color_token?: string | null
  note_text?: string | null
  meeting_url?: string | null
  drive_url?: string | null
  contact_info?: string | null
}

export interface EventRow {
  id: string
  user_id: string
  class_id: string
  event_date: string
  title: string
  event_kind: 'class' | 'special' | 'other'
  start_time: string | null
  end_time: string | null
  time_status: 'defined' | 'pending'
  original_time_text: string | null
  instructor_name: string | null
  materials_source_status: true | null
  source_row_number: number | null
  source_order: number | null
  identity_hash: string
  row_hash: string
  source_payload: Record<string, string> | null
  current_import_batch_id: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface EventActionRow {
  id: string
  user_id: string
  event_id: string
  action_text: string
  normalized_action_text: string
  active: boolean
  created_at: string
  updated_at: string
}

export interface ActionProgressRow {
  id: string
  user_id: string
  action_id: string
  status: 'pending' | 'completed'
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface ImportBatch {
  id: string
  user_id: string
  institution_id: string
  cycle_id: string
  template_id: string | null
  file_name: string
  file_hash: string
  storage_path: string | null
  status: 'processing' | 'succeeded' | 'failed' | 'rolled_back'
  version_number: number
  previous_batch_id: string | null
  total_rows: number
  valid_rows: number
  warning_count: number
  error_count: number
  created_count: number
  updated_count: number
  removed_count: number
  unchanged_count: number
  started_at: string
  completed_at: string | null
  created_at: string
}

export interface UserRoleRow {
  id?: string
  user_id: string
  role: 'master' | 'admin' | 'professor' | 'mentor'
  created_at: string
}

export interface ClassTaskRow {
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

export interface UserActionRow {
  id: string
  user_id: string
  institution_id: string | null
  class_id: string | null
  cycle_id: string | null
  title: string
  due_date: string | null
  status: 'pending' | 'completed'
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface InstitutionIntegrationRow {
  id: string
  institution_id: string
  user_id: string
  provider: 'google_calendar' | 'moodle' | 'teams' | 'canvas' | 'airtable' | 'custom_api'
  display_name: string
  api_endpoint: string | null
  auth_type: string
  api_key_encrypted: string | null
  is_active: boolean
  allow_admin_access: boolean
  created_at: string
  updated_at: string
}
