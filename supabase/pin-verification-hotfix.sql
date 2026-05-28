-- Hotfix: ensure PIN verification RPC exists and is visible to authenticated users.
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

grant execute on function public.verify_user_pin(text) to authenticated;

notify pgrst, 'reload schema';

select
  to_regprocedure('public.verify_user_pin(text)') is not null as function_exists,
  coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure('public.verify_user_pin(text)'),
      'EXECUTE'
    ),
    false
  ) as authenticated_can_execute;
