-- Migration: Fix is_master resilience and atomic roles RPC
-- Prevents RLS self-lockout and race condition on user_roles updates

create or replace function public.is_master(user_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = user_uuid
      and role = 'master'
  ) or exists (
    select 1
    from auth.users
    where id = user_uuid
      and lower(email) = 'feraimentor@gmail.com'
  );
$$;

create or replace function public.admin_set_user_roles(
  target_user_id uuid,
  target_roles text[],
  target_account_status text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  calling_user_id uuid := auth.uid();
  target_email text;
  clean_roles text[];
  r text;
begin
  if current_user not in ('postgres', 'supabase_admin') then
    if calling_user_id is null or not public.is_master(calling_user_id) then
      raise exception 'Apenas usuários Master podem alterar permissões e cargos.';
    end if;
  end if;

  select lower(email) into target_email
  from auth.users
  where id = target_user_id;

  clean_roles := target_roles;
  if target_email = 'feraimentor@gmail.com' and not ('master' = any(clean_roles)) then
    clean_roles := array_append(clean_roles, 'master');
  end if;

  if target_account_status is not null then
    update public.profiles
    set account_status = target_account_status,
        updated_at = now()
    where id = target_user_id;
  end if;

  delete from public.user_roles where user_id = target_user_id;

  foreach r in array clean_roles
  loop
    if r in ('master', 'admin', 'professor', 'mentor') then
      insert into public.user_roles (user_id, role)
      values (target_user_id, r)
      on conflict (user_id, role) do nothing;
    end if;
  end loop;
end;
$$;

grant execute on function public.admin_set_user_roles(uuid, text[], text) to authenticated;
