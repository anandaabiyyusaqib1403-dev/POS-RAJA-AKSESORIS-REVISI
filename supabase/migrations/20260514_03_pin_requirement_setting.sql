create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "authenticated read app settings" on public.app_settings;
create policy "authenticated read app settings"
on public.app_settings
for select
to authenticated
using (true);

drop policy if exists "owner manage app settings" on public.app_settings;
create policy "owner manage app settings"
on public.app_settings
for all
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role)
with check (public.current_user_role() = 'pemilik'::public.user_role);

insert into public.app_settings (key, value)
values ('pin_required_enabled', '{"enabled": true}'::jsonb)
on conflict (key) do nothing;

create or replace function public.owner_set_pin_required_enabled(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_actor_role text;
begin
  if auth.uid() is null then
    raise exception 'User belum login.';
  end if;

  if public.current_user_role() <> 'pemilik'::public.user_role then
    raise exception 'Hanya pemilik yang dapat mengubah pengaturan PIN.';
  end if;

  select value into v_before
  from public.app_settings
  where key = 'pin_required_enabled'
  for update;

  insert into public.app_settings (key, value, updated_by, updated_at)
  values (
    'pin_required_enabled',
    jsonb_build_object('enabled', coalesce(p_enabled, true)),
    auth.uid(),
    now()
  )
  on conflict (key)
  do update set
    value = excluded.value,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning value into v_after;

  select role::text into v_actor_role from public.users where id = auth.uid();

  insert into public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_table,
    target_id,
    before_value,
    after_value,
    reason,
    incident_code
  )
  values (
    auth.uid(),
    coalesce(v_actor_role, 'unknown'),
    'settings.pin_required.update',
    'app_settings',
    null,
    coalesce(v_before, '{}'::jsonb),
    coalesce(v_after, '{}'::jsonb),
    case when coalesce(p_enabled, true) then 'PIN protection enabled' else 'PIN protection disabled' end,
    'PIN-SETTINGS'
  );

  return v_after;
end;
$$;

grant select on public.app_settings to authenticated;
grant execute on function public.owner_set_pin_required_enabled(boolean) to authenticated;

notify pgrst, 'reload schema';
