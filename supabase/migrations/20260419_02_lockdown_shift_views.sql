-- 20260419_02_lockdown_shift_views.sql
-- Lock down shift views that Supabase marks as UNRESTRICTED.

alter table public.shifts enable row level security;
alter table public.transaksi enable row level security;
alter table public.item_transaksi enable row level security;

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

drop view if exists public.shift_reports;
drop view if exists public.shift_transactions;

create or replace view public.current_shifts
with (security_invoker = true)
as
select
  cashier_id,
  id,
  start_time,
  status
from public.shifts
where status::text = 'active';

create or replace function public.get_current_shift_id(cashier_uuid uuid)
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  return (
    select id
    from public.current_shifts
    where cashier_id = cashier_uuid
    limit 1
  );
end;
$$;

create view public.shift_transactions
with (security_invoker = true)
as
select
  s.id as shift_id,
  s.cashier_id,
  s.start_time,
  s.status as shift_status,
  t.id,
  t.kasir_id,
  t.no_transaksi,
  t.total_bayar,
  t.uang_diterima,
  t.kembalian,
  t.metode_bayar,
  t.catatan,
  t.created_at
from public.shifts s
join public.transaksi t
  on t.created_at >= s.start_time
  and t.created_at < coalesce(s.end_time, now())
where s.status::text = 'active';

create view public.shift_reports
with (security_invoker = true)
as
select
  s.*,
  count(t.id)::integer as actual_transactions,
  sum(
    case
      when t.metode_bayar::text in ('cash', 'tunai')
        then t.total_bayar
      else 0
    end
  )::integer as actual_cash_total,
  sum(
    case
      when t.metode_bayar::text not in ('cash', 'tunai')
        then t.total_bayar
      else 0
    end
  )::integer as actual_digital,
  sum(coalesce(it.qty, 0))::integer as actual_items
from public.shifts s
left join public.shift_transactions t on t.shift_id = s.id
left join public.item_transaksi it on it.transaksi_id = t.id
group by s.id
order by s.start_time desc;

revoke all on public.current_shifts from anon, public;
revoke all on public.shift_transactions from anon, public;
revoke all on public.shift_reports from anon, public;

grant select on public.current_shifts to authenticated;
grant select on public.shift_transactions to authenticated;
grant select on public.shift_reports to authenticated;
grant execute on function public.get_current_shift_id(uuid) to authenticated;

comment on view public.current_shifts is
  'Security invoker current shift view; follows RLS on shifts.';

comment on view public.shift_transactions is
  'Security invoker shift transaction view; follows RLS on shifts and transaksi.';

comment on view public.shift_reports is
  'Security invoker shift report view; follows RLS on shifts, transaksi, and item_transaksi.';

notify pgrst, 'reload schema';
