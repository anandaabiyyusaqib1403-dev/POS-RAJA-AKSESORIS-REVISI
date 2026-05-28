notify pgrst, 'reload schema';

create or replace function public.get_my_profile()
returns table (
  id uuid,
  nama text,
  email text,
  role public.user_role,
  status text,
  pin_hash text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    u.nama,
    u.email,
    u.role,
    u.status,
    u.pin_hash
  from public.users as u
  where u.id = auth.uid()
  limit 1;
$$;

revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

notify pgrst, 'reload schema';
