do $$
begin
  create type public.shift_status as enum ('active', 'pending', 'approved', 'flagged');
exception
  when duplicate_object then null;
end $$;

alter type public.shift_status add value if not exists 'pending';
alter type public.shift_status add value if not exists 'approved';
alter type public.shift_status add value if not exists 'flagged';

alter table public.users
  add column if not exists pin_hash text;

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  cashier_id uuid not null references public.users(id),
  start_time timestamptz not null default now(),
  end_time timestamptz,
  opening_cash integer not null default 0 check (opening_cash >= 0),
  total_cash integer not null default 0 check (total_cash >= 0),
  total_digital integer not null default 0 check (total_digital >= 0),
  total_transactions integer not null default 0 check (total_transactions >= 0),
  total_items integer not null default 0 check (total_items >= 0),
  expected_cash integer generated always as (total_cash) stored,
  actual_cash integer check (actual_cash >= 0),
  difference integer generated always as (coalesce(actual_cash, 0) - total_cash) stored,
  notes text,
  approval_notes text,
  status public.shift_status not null default 'active',
  approved_by uuid references public.users(id),
  closed_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shifts
  add column if not exists approval_notes text,
  add column if not exists closed_by uuid references public.users(id),
  add column if not exists total_cash integer not null default 0,
  add column if not exists total_digital integer not null default 0,
  add column if not exists total_transactions integer not null default 0,
  add column if not exists total_items integer not null default 0,
  add column if not exists notes text,
  add column if not exists approved_by uuid references public.users(id),
  add column if not exists updated_at timestamptz not null default now();

update public.shifts
set status = 'pending'::public.shift_status
where status::text in ('pending_close', 'closed');

create unique index if not exists idx_shifts_active_cashier
on public.shifts (cashier_id)
where status = 'active'::public.shift_status;

create index if not exists idx_shifts_status on public.shifts (status);
create index if not exists idx_shifts_cashier_start on public.shifts (cashier_id, start_time desc);

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
for each row execute function public.set_shift_updated_at();

alter table public.transaksi
  add column if not exists shift_id uuid references public.shifts(id);

alter table public.transaksi_digital
  add column if not exists shift_id uuid references public.shifts(id);

alter table public.transaksi_logistik
  add column if not exists shift_id uuid references public.shifts(id);

alter table public.transaksi_digital
  add column if not exists payment_method public.nama_platform not null default 'cash';

create index if not exists idx_transaksi_shift_id on public.transaksi (shift_id);
create index if not exists idx_transaksi_digital_shift_id on public.transaksi_digital (shift_id);
create index if not exists idx_transaksi_logistik_shift_id on public.transaksi_logistik (shift_id);

alter table public.shifts enable row level security;

drop policy if exists "cashier_manage_own_shifts" on public.shifts;
drop policy if exists "owner_manage_all_shifts" on public.shifts;
drop policy if exists "cashier read own shifts" on public.shifts;
drop policy if exists "cashier insert own shifts" on public.shifts;
drop policy if exists "cashier update own shifts" on public.shifts;

create policy "cashier read own shifts"
on public.shifts
for select
to authenticated
using (cashier_id = auth.uid());

create policy "cashier insert own shifts"
on public.shifts
for insert
to authenticated
with check (cashier_id = auth.uid());

create policy "cashier update own shifts"
on public.shifts
for update
to authenticated
using (cashier_id = auth.uid())
with check (cashier_id = auth.uid());

create policy "owner manage all shifts"
on public.shifts
for all
to authenticated
using (public.current_user_role() = 'pemilik')
with check (public.current_user_role() = 'pemilik');

comment on table public.shifts is
  'Opening dan closing shift harian untuk POS Raja Aksesoris.';
