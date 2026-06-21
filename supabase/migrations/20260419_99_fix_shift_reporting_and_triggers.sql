-- ============================================================
-- 20260419_99_fix_shift_reporting_and_triggers.sql
-- ============================================================

-- 1) Rapikan trigger updated_at agar hanya satu yang aktif
drop trigger if exists update_shifts_updated_at on public.shifts;
drop function if exists public.update_updated_at_column();

create or replace function public.set_shift_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_shifts_updated_at on public.shifts;
create trigger trg_shifts_updated_at
before update on public.shifts
for each row
execute function public.set_shift_updated_at();


-- 2) Backfill shift_id untuk transaksi lama yang masih null
update public.transaksi t
set shift_id = s.id
from public.shifts s
where t.shift_id is null
  and t.kasir_id = s.cashier_id
  and t.created_at >= s.start_time
  and t.created_at < coalesce(s.end_time, now());


-- 3) Perbaiki view reporting shift
drop view if exists public.shift_reports;
drop view if exists public.shift_transactions;

create or replace view public.current_shifts
with (security_invoker = true)
as
select
  cashier_id,
  id,
  start_time,
  end_time,
  status
from public.shifts
where status = 'active'::public.shift_status;

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

create or replace view public.shift_transactions
with (security_invoker = true)
as
select
  s.id as shift_id,
  s.cashier_id,
  s.start_time,
  s.end_time,
  s.status as shift_status,
  t.id as transaksi_id,
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
  on t.shift_id = s.id;

create or replace view public.shift_reports
with (security_invoker = true)
as
select
  s.id,
  s.cashier_id,
  s.start_time,
  s.end_time,
  s.status,
  s.opening_cash,
  s.total_cash,
  s.total_digital,
  s.total_transactions,
  s.total_items,
  s.expected_cash,
  s.actual_cash,
  s.difference,
  s.notes,
  s.approval_notes,
  s.approved_by,
  s.closed_by,
  s.created_at,
  s.updated_at,

  count(distinct t.transaksi_id)::integer as system_transactions,

  coalesce(sum(
    case
      when t.metode_bayar::text in ('cash', 'tunai')
        then t.total_bayar
      else 0
    end
  ), 0)::integer as system_cash_total,

  coalesce(sum(
    case
      when t.metode_bayar::text not in ('cash', 'tunai')
        then t.total_bayar
      else 0
    end
  ), 0)::integer as system_digital,

  coalesce(sum(it.qty), 0)::integer as system_items

from public.shifts s
left join public.shift_transactions t
  on t.shift_id = s.id
left join public.item_transaksi it
  on it.transaksi_id = t.transaksi_id
group by
  s.id,
  s.cashier_id,
  s.start_time,
  s.end_time,
  s.status,
  s.opening_cash,
  s.total_cash,
  s.total_digital,
  s.total_transactions,
  s.total_items,
  s.expected_cash,
  s.actual_cash,
  s.difference,
  s.notes,
  s.approval_notes,
  s.approved_by,
  s.closed_by,
  s.created_at,
  s.updated_at
order by s.start_time desc;

revoke all on public.current_shifts from anon, public;
revoke all on public.shift_transactions from anon, public;
revoke all on public.shift_reports from anon, public;

grant select on public.current_shifts to authenticated;
grant select on public.shift_transactions to authenticated;
grant select on public.shift_reports to authenticated;
grant execute on function public.get_current_shift_id(uuid) to authenticated;

comment on view public.current_shifts is
  'Shift aktif yang sedang berjalan.';

comment on view public.shift_transactions is
  'Transaksi shift berbasis shift_id, bukan window waktu.';

comment on view public.shift_reports is
  'Laporan shift historis berbasis shift_id.';

-- Additional RLS policy fixes for security hardening
drop policy if exists "users read own or owner" on public.users;
create policy "users read own or owner"
on public.users
for select
to authenticated
using (id = auth.uid() or public.current_user_role() = 'pemilik');

drop policy if exists "owner manage users" on public.users;
create policy "owner manage users"
on public.users
for all
to authenticated
using (public.current_user_role() = 'pemilik')
with check (public.current_user_role() = 'pemilik');

drop policy if exists "authenticated read produk" on public.produk;
create policy "authenticated read produk"
on public.produk
for select
to authenticated
using (true);

drop policy if exists "owner manage produk" on public.produk;
create policy "owner manage produk"
on public.produk
for all
to authenticated
using (public.current_user_role() = 'pemilik')
with check (public.current_user_role() = 'pemilik');

notify pgrst, 'reload schema';