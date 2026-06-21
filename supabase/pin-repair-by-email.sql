-- Repair PIN for one Supabase Auth user.
-- Run in Supabase SQL Editor, replace the email with the exact email used to login.

create extension if not exists pgcrypto;
set search_path = public, extensions;

with target_auth_user as (
  select
    id,
    email,
    coalesce(raw_user_meta_data->>'name', email) as display_name
  from auth.users
  where lower(email) = lower('amri@raja.pos')
)
insert into public.users (id, nama, role, pin_hash, status, archived_at)
select
  id,
  display_name,
  'pemilik'::public.user_role,
  crypt('1234', gen_salt('bf')),
  'active',
  null
from target_auth_user
on conflict (id) do update
set nama = excluded.nama,
    role = excluded.role,
    pin_hash = excluded.pin_hash,
    status = 'active',
    archived_at = null;

update auth.users
set raw_user_meta_data =
  (coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'pemilik')) - 'pin'
where lower(email) = lower('GANTI_DENGAN_EMAIL_LOGIN');

notify pgrst, 'reload schema';

select
  auth_user.email,
  app_user.role,
  app_user.status,
  coalesce(app_user.pin_hash, '') <> '' as has_pin_hash,
  case
    when app_user.pin_hash like '$2%' then app_user.pin_hash = crypt('1234', app_user.pin_hash)
    else app_user.pin_hash = encode(digest('1234', 'sha256'), 'hex')
  end as pin_1234_matches
from auth.users as auth_user
left join public.users as app_user on app_user.id = auth_user.id
where lower(auth_user.email) = lower('GANTI_DENGAN_EMAIL_LOGIN');
