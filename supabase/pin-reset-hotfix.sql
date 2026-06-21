-- Hotfix: repair PIN verification and employee PIN reset RPC search_path.
-- Run this in Supabase SQL Editor, then hard refresh the POS app.

create extension if not exists pgcrypto;

create or replace function public.verify_user_pin(p_pin text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select coalesce(
    (
      select case
        when coalesce(app_user.pin_hash, '') = '' then false
        when app_user.pin_hash like '$2%' then
          app_user.pin_hash = crypt(btrim(p_pin)::text, app_user.pin_hash::text)
        else
          app_user.pin_hash = encode(digest(btrim(p_pin)::text, 'sha256'), 'hex')
      end
      from public.users as app_user
      where app_user.id = auth.uid()
        and coalesce(btrim(p_pin), '') <> ''
    ),
    false
  );
$$;

create or replace function public.owner_reset_employee_pin(
  p_user_id uuid,
  p_new_pin text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_before jsonb;
begin
  perform public.ensure_owner_employee_access();

  if coalesce(btrim(p_new_pin), '') !~ '^[0-9]{4,8}$' then
    raise exception 'PIN baru harus berisi 4 sampai 8 digit angka.';
  end if;

  select jsonb_build_object('id', id, 'pin_status', case when pin_hash is null then 'empty' else 'set' end)
  into v_before
  from public.users
  where id = p_user_id
  for update;

  if v_before is null then
    raise exception 'Profil karyawan tidak ditemukan.';
  end if;

  update public.users
  set pin_hash = crypt(btrim(p_new_pin), gen_salt('bf'))
  where id = p_user_id;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'pin'
  where id = p_user_id;

  perform public.write_employee_audit(
    'employee.pin.reset',
    p_user_id,
    v_before,
    jsonb_build_object('id', p_user_id, 'pin_status', 'set'),
    'Reset PIN karyawan'
  );

  return true;
end;
$$;

grant execute on function public.verify_user_pin(text) to authenticated;
grant execute on function public.owner_reset_employee_pin(uuid, text) to authenticated;

notify pgrst, 'reload schema';

select
  p.proname,
  p.proconfig,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('verify_user_pin', 'owner_reset_employee_pin')
order by p.proname;
