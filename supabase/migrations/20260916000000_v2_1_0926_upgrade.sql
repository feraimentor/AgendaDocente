-- V2.1.0926 Upgrade: Multi-Roles, Account Status, Class Tasks, Integrations, Custom Actions

-- 1. Helper functions para checagem de roles
create or replace function public.is_master(user_uuid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as \$\$
  select exists (
    select 1
    from public.user_roles
    where user_id = user_uuid
      and role = 'master'
  );
\$\$;

create or replace function public.has_role(user_uuid uuid, role_name text)
returns boolean
language sql
security definer
stable
set search_path = ''
as \$\$
  select exists (
    select 1
    from public.user_roles
    where user_id = user_uuid
      and role = role_name
  );
\$\$;

-- 2. Refatorar user_roles para permitir múltiplos papéis por usuário
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check check (role in ('master', 'admin', 'professor', 'mentor'));
alter table public.user_roles drop constraint if exists user_roles_pkey;
alter table public.user_roles add primary key (user_id, role);

-- 3. Adicionar account_status no perfil
alter table public.profiles 
  add column if not exists account_status text not null default 'active'
  check (account_status in ('pending_approval', 'active', 'suspended'));

-- 4. Central de Tarefas/Notas da Turma (To-Do dinâmico com Pin)
create table if not exists public.class_tasks (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null,
  title text not null check (length(trim(title)) > 0),
  is_pinned boolean not null default false,
  is_completed boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_tasks_owner_fk foreign key (class_id, user_id)
    references public.teaching_classes(id, user_id) on delete cascade
);

-- 5. Campos operacionais em class_preferences
alter table public.class_preferences
  add column if not exists meeting_url text,
  add column if not exists drive_url text,
  add column if not exists contact_info text;

-- 6. Tabela de Ações Autorais (user_actions)
create table if not exists public.user_actions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  institution_id uuid,
  class_id uuid,
  cycle_id uuid,
  title text not null check (length(trim(title)) > 0),
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_actions_institution_fk foreign key (institution_id, user_id)
    references public.institutions(id, user_id) on delete set null,
  constraint user_actions_class_fk foreign key (class_id, user_id)
    references public.teaching_classes(id, user_id) on delete set null,
  constraint user_actions_cycle_fk foreign key (cycle_id, user_id)
    references public.cycles(id, user_id) on delete set null
);

-- 7. Tabela de Conectores/Integrações de API Institucionais
create table if not exists public.institution_integrations (
  id uuid primary key default extensions.gen_random_uuid(),
  institution_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_calendar', 'moodle', 'teams', 'canvas', 'airtable', 'custom_api')),
  display_name text not null,
  api_endpoint text,
  auth_type text not null default 'bearer',
  api_key_encrypted text,
  is_active boolean not null default true,
  allow_admin_access boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_integrations_owner_fk foreign key (institution_id, user_id)
    references public.institutions(id, user_id) on delete cascade
);

-- 8. Triggers de atualização de updated_at
drop trigger if exists set_class_tasks_updated_at on public.class_tasks;
create trigger set_class_tasks_updated_at
  before update on public.class_tasks
  for each row execute function public.set_updated_at();

drop trigger if exists set_user_actions_updated_at on public.user_actions;
create trigger set_user_actions_updated_at
  before update on public.user_actions
  for each row execute function public.set_updated_at();

drop trigger if exists set_institution_integrations_updated_at on public.institution_integrations;
create trigger set_institution_integrations_updated_at
  before update on public.institution_integrations
  for each row execute function public.set_updated_at();

-- 9. Habilitar RLS nas novas tabelas
alter table public.class_tasks enable row level security;
alter table public.user_actions enable row level security;
alter table public.institution_integrations enable row level security;

-- Policies para class_tasks
create policy "class_tasks_select" on public.class_tasks for select to authenticated
  using ((select auth.uid()) = user_id or public.is_master(auth.uid()));
create policy "class_tasks_insert" on public.class_tasks for insert to authenticated
  with check ((select auth.uid()) = user_id or public.is_master(auth.uid()));
create policy "class_tasks_update" on public.class_tasks for update to authenticated
  using ((select auth.uid()) = user_id or public.is_master(auth.uid()))
  with check ((select auth.uid()) = user_id or public.is_master(auth.uid()));
create policy "class_tasks_delete" on public.class_tasks for delete to authenticated
  using ((select auth.uid()) = user_id or public.is_master(auth.uid()));

-- Policies para user_actions
create policy "user_actions_select" on public.user_actions for select to authenticated
  using ((select auth.uid()) = user_id or public.is_master(auth.uid()));
create policy "user_actions_insert" on public.user_actions for insert to authenticated
  with check ((select auth.uid()) = user_id or public.is_master(auth.uid()));
create policy "user_actions_update" on public.user_actions for update to authenticated
  using ((select auth.uid()) = user_id or public.is_master(auth.uid()))
  with check ((select auth.uid()) = user_id or public.is_master(auth.uid()));
create policy "user_actions_delete" on public.user_actions for delete to authenticated
  using ((select auth.uid()) = user_id or public.is_master(auth.uid()));

-- Policies para institution_integrations (Master sempre, Admin se allow_admin_access for true)
create policy "institution_integrations_select" on public.institution_integrations for select to authenticated
  using (
    (select auth.uid()) = user_id 
    or public.is_master(auth.uid()) 
    or (public.has_role(auth.uid(), 'admin') and allow_admin_access)
  );
create policy "institution_integrations_insert" on public.institution_integrations for insert to authenticated
  with check (
    (select auth.uid()) = user_id 
    or public.is_master(auth.uid()) 
    or (public.has_role(auth.uid(), 'admin') and allow_admin_access)
  );
create policy "institution_integrations_update" on public.institution_integrations for update to authenticated
  using (
    (select auth.uid()) = user_id 
    or public.is_master(auth.uid()) 
    or (public.has_role(auth.uid(), 'admin') and allow_admin_access)
  )
  with check (
    (select auth.uid()) = user_id 
    or public.is_master(auth.uid()) 
    or (public.has_role(auth.uid(), 'admin') and allow_admin_access)
  );
create policy "institution_integrations_delete" on public.institution_integrations for delete to authenticated
  using (
    (select auth.uid()) = user_id 
    or public.is_master(auth.uid())
  );

-- Policies do Master para gestão de user_roles e profiles
create policy "user_roles_master_manage" on public.user_roles for all to authenticated
  using (public.is_master(auth.uid()))
  with check (public.is_master(auth.uid()));

create policy "profiles_master_select" on public.profiles for select to authenticated
  using (public.is_master(auth.uid()));

create policy "profiles_master_update" on public.profiles for update to authenticated
  using (public.is_master(auth.uid()))
  with check (public.is_master(auth.uid()));

-- 10. Concessões de permissão
grant select, insert, update, delete on public.class_tasks to authenticated;
grant select, insert, update, delete on public.user_actions to authenticated;
grant select, insert, update, delete on public.institution_integrations to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;
grant select, update on public.profiles to authenticated;
grant execute on function public.is_master(uuid) to authenticated;
grant execute on function public.has_role(uuid, text) to authenticated;