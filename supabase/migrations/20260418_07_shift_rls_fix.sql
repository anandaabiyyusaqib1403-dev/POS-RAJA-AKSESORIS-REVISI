-- 20260418_07_shift_rls_fix.sql
-- Fix shift insert/update after RLS lockdown.

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.users
  where id = auth.uid();
$$;

grant execute on function public.current_user_role() to authenticated;

alter table public.shifts enable row level security;

drop policy if exists "cashier_manage_own_shifts" on public.shifts;
drop policy if exists "owner_manage_all_shifts" on public.shifts;
drop policy if exists "cashier read own shifts" on public.shifts;
drop policy if exists "cashier insert own shifts" on public.shifts;
drop policy if exists "cashier update own shifts" on public.shifts;
drop policy if exists "owner manage all shifts" on public.shifts;
drop policy if exists "shift read own or owner" on public.shifts;
drop policy if exists "shift insert own or owner" on public.shifts;
drop policy if exists "shift update own or owner" on public.shifts;

create policy "shift read own or owner"
on public.shifts
for select
to authenticated
using (
  cashier_id = auth.uid()
  or public.current_user_role() = 'pemilik'::public.user_role
);

create policy "shift insert own or owner"
on public.shifts
for insert
to authenticated
with check (
  cashier_id = auth.uid()
  or public.current_user_role() = 'pemilik'::public.user_role
);

create policy "shift update own or owner"
on public.shifts
for update
to authenticated
using (
  cashier_id = auth.uid()
  or public.current_user_role() = 'pemilik'::public.user_role
)
with check (
  cashier_id = auth.uid()
  or public.current_user_role() = 'pemilik'::public.user_role
);
