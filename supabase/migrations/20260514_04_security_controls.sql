insert into public.app_settings (key, value)
values (
  'security_controls',
  '{
    "refund": {"enabled": true, "requiredBy": "kasir_owner"},
    "retur": {"enabled": true, "requiredBy": "kasir_owner"},
    "stock": {"enabled": true, "requiredBy": "kasir_owner"},
    "price": {"enabled": true, "requiredBy": "owner_only"},
    "delete_transaction": {"enabled": true, "requiredBy": "owner_only"},
    "closing_shift": {"enabled": true, "requiredBy": "kasir_owner"}
  }'::jsonb
)
on conflict (key) do nothing;

create or replace function public.owner_set_security_controls(p_controls jsonb)
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
    raise exception 'Hanya pemilik yang dapat mengubah kontrol keamanan.';
  end if;

  if jsonb_typeof(coalesce(p_controls, '{}'::jsonb)) <> 'object' then
    raise exception 'Format kontrol keamanan tidak valid.';
  end if;

  select value into v_before
  from public.app_settings
  where key = 'security_controls'
  for update;

  insert into public.app_settings (key, value, updated_by, updated_at)
  values (
    'security_controls',
    coalesce(p_controls, '{}'::jsonb),
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
    'settings.security_controls.update',
    'app_settings',
    null,
    coalesce(v_before, '{}'::jsonb),
    coalesce(v_after, '{}'::jsonb),
    'Operational security controls updated',
    'SECURITY-CONTROLS'
  );

  return v_after;
end;
$$;

grant execute on function public.owner_set_security_controls(jsonb) to authenticated;

notify pgrst, 'reload schema';
