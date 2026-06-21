-- Repair missing logistics transaction table on production databases that skipped
-- the POS v2 logistics module. This keeps product data untouched.

create extension if not exists pgcrypto;

create table if not exists public.transaksi_logistik (
  id uuid primary key default gen_random_uuid(),
  kasir_id uuid references public.users(id),
  no_transaksi text unique not null,
  ekspedisi text not null default '',
  harga_jual integer not null default 0 check (harga_jual >= 0),
  modal integer not null default 0 check (modal >= 0),
  keuntungan integer generated always as (harga_jual - modal) stored,
  no_resi text,
  catatan text,
  created_at timestamptz default now()
);

alter table public.transaksi_logistik
  add column if not exists shift_id uuid references public.shifts(id),
  add column if not exists type text not null default 'logistik',
  add column if not exists sender_name text,
  add column if not exists receiver_name text,
  add column if not exists destination text,
  add column if not exists package_type text,
  add column if not exists weight numeric(10, 2) not null default 0,
  add column if not exists price integer not null default 0,
  add column if not exists payment_method public.nama_platform not null default 'cash',
  add column if not exists platform_sumber public.nama_platform,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists status text not null default 'active',
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id),
  add column if not exists void_reason text not null default '',
  add column if not exists void_reversal_id uuid;

update public.transaksi_logistik
set
  type = coalesce(type, 'logistik'),
  receiver_name = coalesce(receiver_name, no_resi, 'Penerima'),
  destination = coalesce(destination, catatan, '-'),
  package_type = coalesce(package_type, 'Regular'),
  price = case when price > 0 then price else harga_jual end,
  payment_method = coalesce(payment_method, platform_sumber, 'cash'::public.nama_platform),
  status = coalesce(status, 'active'),
  void_reason = coalesce(void_reason, '');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transaksi_logistik_type_check'
  ) then
    alter table public.transaksi_logistik
      add constraint transaksi_logistik_type_check check (type = 'logistik');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'transaksi_logistik_weight_check'
  ) then
    alter table public.transaksi_logistik
      add constraint transaksi_logistik_weight_check check (weight >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'transaksi_logistik_price_check'
  ) then
    alter table public.transaksi_logistik
      add constraint transaksi_logistik_price_check check (price >= 0);
  end if;
end $$;

create index if not exists idx_transaksi_logistik_shift_id
on public.transaksi_logistik (shift_id);

create index if not exists idx_transaksi_logistik_created_at_desc
on public.transaksi_logistik (created_at desc);

create index if not exists idx_transaksi_logistik_deleted_at
on public.transaksi_logistik (deleted_at)
where deleted_at is not null;

grant select, insert, update, delete on public.transaksi_logistik to authenticated;

alter table public.transaksi_logistik enable row level security;

drop policy if exists "kasir insert transaksi logistik" on public.transaksi_logistik;
create policy "kasir insert transaksi logistik"
on public.transaksi_logistik
for insert
to authenticated
with check (kasir_id = auth.uid());

drop policy if exists "kasir or owner read transaksi logistik" on public.transaksi_logistik;
create policy "kasir or owner read transaksi logistik"
on public.transaksi_logistik
for select
to authenticated
using (kasir_id = auth.uid() or public.current_user_role() = 'pemilik'::public.user_role);

drop policy if exists "owner manage transaksi logistik" on public.transaksi_logistik;
create policy "owner manage transaksi logistik"
on public.transaksi_logistik
for all
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role)
with check (public.current_user_role() = 'pemilik'::public.user_role);

notify pgrst, 'reload schema';
