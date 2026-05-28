-- 20260418_08_runtime_schema_repair.sql
-- Runtime repair for product save, service product management, and shift-linked transactions.

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.financial_logs') is null
     and to_regclass('public.finacial_logs') is not null then
    alter table public.finacial_logs rename to financial_logs;
  end if;
end $$;

do $$
begin
  create type public.stock_mutation_type as enum ('masuk', 'keluar', 'penyesuaian');
exception
  when duplicate_object then null;
end $$;

alter type public.metode_bayar add value if not exists 'cash';
alter type public.metode_bayar add value if not exists 'qris';
alter type public.metode_bayar add value if not exists 'transfer';
alter type public.metode_bayar add value if not exists 'dana';
alter type public.metode_bayar add value if not exists 'bank_mas';
alter type public.metode_bayar add value if not exists 'wahana';
alter type public.metode_bayar add value if not exists 'pasar_kuota';
alter type public.metode_bayar add value if not exists 'shopee';
alter type public.metode_bayar add value if not exists 'bca';
alter type public.metode_bayar add value if not exists 'split';

alter type public.nama_platform add value if not exists 'cash';
alter type public.nama_platform add value if not exists 'qris';
alter type public.nama_platform add value if not exists 'dana';
alter type public.nama_platform add value if not exists 'bank_mas';
alter type public.nama_platform add value if not exists 'wahana';
alter type public.nama_platform add value if not exists 'pasar_kuota';
alter type public.nama_platform add value if not exists 'shopee';
alter type public.nama_platform add value if not exists 'bca';
alter type public.nama_platform add value if not exists 'split';
alter type public.nama_platform add value if not exists 'gopay';
alter type public.nama_platform add value if not exists 'ovo';
alter type public.nama_platform add value if not exists 'mandiri';
alter type public.nama_platform add value if not exists 'bri';
alter type public.nama_platform add value if not exists 'bni';

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

alter table public.produk
  add column if not exists aktif boolean default true,
  add column if not exists kode_produk text,
  add column if not exists status text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz;

update public.produk
set status = case
  when status is not null then status
  when coalesce(aktif, true) then 'active'
  else 'inactive'
end;

alter table public.produk
  alter column status set default 'active',
  alter column status set not null;

alter table public.produk
  drop constraint if exists produk_status_check;

alter table public.produk
  add constraint produk_status_check
  check (status in ('active', 'inactive', 'deleted'));

create unique index if not exists produk_kode_produk_unique
on public.produk (kode_produk)
where kode_produk is not null and btrim(kode_produk) <> '';

create index if not exists idx_produk_status
on public.produk (status, created_at desc);

create table if not exists public.stok_mutasi (
  id uuid primary key default gen_random_uuid(),
  produk_id uuid references public.produk(id) on delete set null,
  tipe public.stock_mutation_type not null,
  jumlah integer not null check (jumlah <> 0),
  stok_sebelum integer check (stok_sebelum is null or stok_sebelum >= 0),
  stok_sesudah integer check (stok_sesudah is null or stok_sesudah >= 0),
  referensi text,
  catatan text,
  created_at timestamptz default now()
);

create table if not exists public.product_activity_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.produk(id) on delete set null,
  action text not null,
  actor_id uuid references auth.users(id),
  details jsonb not null default '{}'::jsonb,
  product_snapshot jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.services_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (
    category in ('pulsa', 'kuota', 'voucher_game', 'token_listrik')
  ),
  provider text not null,
  service_type text not null default '',
  cost integer not null default 0 check (cost >= 0),
  default_price integer check (default_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.services_products
  add column if not exists service_type text not null default '',
  add column if not exists default_price integer check (default_price >= 0),
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now();

alter table public.services_products
  drop constraint if exists services_products_category_provider_name_key;

alter table public.services_products
  drop constraint if exists services_products_category_provider_service_type_name_key;

alter table public.services_products
  add constraint services_products_category_provider_service_type_name_key
  unique (category, provider, service_type, name);

alter table public.transaksi
  add column if not exists shift_id uuid references public.shifts(id),
  add column if not exists payments jsonb not null default '[]'::jsonb;

alter table public.transaksi_digital
  add column if not exists shift_id uuid references public.shifts(id),
  add column if not exists nama_tujuan text,
  add column if not exists platform_sumber public.nama_platform,
  add column if not exists payment_method public.nama_platform not null default 'cash',
  add column if not exists service_product_id uuid references public.services_products(id) on delete set null,
  add column if not exists selling_price integer,
  add column if not exists cost integer,
  add column if not exists profit integer,
  add column if not exists target_number text,
  add column if not exists customer_name text,
  add column if not exists transaction_items jsonb not null default '[]'::jsonb,
  add column if not exists transaction_details jsonb not null default '{}'::jsonb;

update public.transaksi_digital
set
  selling_price = coalesce(selling_price, harga_jual),
  cost = coalesce(cost, modal),
  profit = coalesce(profit, harga_jual - modal),
  target_number = coalesce(target_number, nomor_tujuan),
  customer_name = coalesce(customer_name, nama_tujuan),
  payment_method = coalesce(payment_method, 'cash'::public.nama_platform);

alter table public.transaksi_logistik
  add column if not exists shift_id uuid references public.shifts(id),
  add column if not exists type text not null default 'logistik',
  add column if not exists sender_name text,
  add column if not exists receiver_name text,
  add column if not exists destination text,
  add column if not exists package_type text,
  add column if not exists weight numeric(10, 2) not null default 0,
  add column if not exists price integer not null default 0,
  add column if not exists payment_method public.nama_platform not null default 'cash';

update public.transaksi_logistik
set
  type = coalesce(type, 'logistik'),
  receiver_name = coalesce(receiver_name, no_resi, 'Penerima'),
  destination = coalesce(destination, catatan, '-'),
  package_type = coalesce(package_type, 'Regular'),
  price = case when price > 0 then price else harga_jual end,
  payment_method = coalesce(payment_method, 'cash'::public.nama_platform);

create index if not exists idx_transaksi_shift_id on public.transaksi (shift_id);
create index if not exists idx_transaksi_digital_shift_id on public.transaksi_digital (shift_id);
create index if not exists idx_transaksi_logistik_shift_id on public.transaksi_logistik (shift_id);
create index if not exists idx_services_products_type on public.services_products (category, provider, service_type, name);

grant usage on schema public to authenticated;
grant select, insert, update on public.produk to authenticated;
grant select, insert, update on public.stok_mutasi to authenticated;
grant select, insert on public.product_activity_logs to authenticated;
grant select, insert, update on public.services_products to authenticated;
grant select, insert, update on public.transaksi to authenticated;
grant select, insert, update on public.item_transaksi to authenticated;
grant select, insert, update on public.transaksi_digital to authenticated;
grant select, insert, update on public.transaksi_logistik to authenticated;

alter table public.produk enable row level security;
alter table public.stok_mutasi enable row level security;
alter table public.product_activity_logs enable row level security;
alter table public.services_products enable row level security;
alter table public.transaksi enable row level security;
alter table public.transaksi_digital enable row level security;
alter table public.transaksi_logistik enable row level security;

drop policy if exists "authenticated read produk" on public.produk;
drop policy if exists "owner manage produk" on public.produk;
drop policy if exists "cashier read active produk" on public.produk;
drop policy if exists "owner manage all produk" on public.produk;

create policy "cashier read active produk"
on public.produk
for select
to authenticated
using (
  public.current_user_role() = 'pemilik'::public.user_role
  or (
    coalesce(aktif, true) = true
    and coalesce(status, 'active') = 'active'
  )
);

create policy "owner manage all produk"
on public.produk
for all
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role)
with check (public.current_user_role() = 'pemilik'::public.user_role);

drop policy if exists "authenticated read service products" on public.services_products;
drop policy if exists "cashier read active service products" on public.services_products;
drop policy if exists "owner manage service products" on public.services_products;

create policy "cashier read active service products"
on public.services_products
for select
to authenticated
using (
  public.current_user_role() = 'pemilik'::public.user_role
  or active = true
);

create policy "owner manage service products"
on public.services_products
for all
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role)
with check (public.current_user_role() = 'pemilik'::public.user_role);

drop policy if exists "authenticated read stok mutasi" on public.stok_mutasi;
drop policy if exists "owner manage stok mutasi" on public.stok_mutasi;

create policy "authenticated read stok mutasi"
on public.stok_mutasi
for select
to authenticated
using (true);

create policy "owner manage stok mutasi"
on public.stok_mutasi
for all
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role)
with check (public.current_user_role() = 'pemilik'::public.user_role);

drop policy if exists "owner read product activity logs" on public.product_activity_logs;
drop policy if exists "authenticated insert product activity logs" on public.product_activity_logs;

create policy "owner read product activity logs"
on public.product_activity_logs
for select
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role);

create policy "authenticated insert product activity logs"
on public.product_activity_logs
for insert
to authenticated
with check (
  actor_id = auth.uid()
  or public.current_user_role() = 'pemilik'::public.user_role
);

notify pgrst, 'reload schema';
