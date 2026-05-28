create extension if not exists pgcrypto;

do $$
begin
  create type public.user_role as enum ('pemilik', 'kasir');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.metode_bayar as enum ('tunai', 'qris', 'transfer');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.jenis_digital as enum ('pulsa', 'kuota', 'voucher_game', 'token_listrik', 'lainnya');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  nama text not null,
  role user_role not null default 'kasir',
  created_at timestamptz default now()
);

create table if not exists public.produk (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  kategori text not null,
  stok integer not null default 0 check (stok >= 0),
  stok_minimum integer not null default 3 check (stok_minimum >= 0),
  harga_beli integer not null default 0 check (harga_beli >= 0),
  harga_jual integer not null check (harga_jual >= 0),
  satuan text not null default 'pcs',
  aktif boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.transaksi (
  id uuid primary key default gen_random_uuid(),
  kasir_id uuid references public.users(id),
  no_transaksi text unique not null,
  total_bayar integer not null,
  uang_diterima integer not null,
  kembalian integer not null,
  metode_bayar metode_bayar not null default 'tunai',
  catatan text,
  created_at timestamptz default now()
);

create table if not exists public.item_transaksi (
  id uuid primary key default gen_random_uuid(),
  transaksi_id uuid references public.transaksi(id) on delete cascade,
  produk_id uuid references public.produk(id),
  nama_produk text not null,
  qty integer not null,
  harga_satuan integer not null,
  subtotal integer not null
);

create table if not exists public.transaksi_digital (
  id uuid primary key default gen_random_uuid(),
  kasir_id uuid references public.users(id),
  no_transaksi text unique not null,
  jenis jenis_digital not null,
  provider text not null,
  nomor_tujuan text not null,
  nominal integer not null,
  harga_jual integer not null,
  modal integer not null,
  keuntungan integer generated always as (harga_jual - modal) stored,
  catatan text,
  created_at timestamptz default now()
);

create table if not exists public.stok_masuk (
  id uuid primary key default gen_random_uuid(),
  produk_id uuid not null references public.produk(id) on delete cascade,
  jumlah integer not null check (jumlah > 0),
  created_at timestamptz default now()
);

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

grant execute on function public.current_user_role() to authenticated;

alter table public.users enable row level security;
alter table public.produk enable row level security;
alter table public.transaksi enable row level security;
alter table public.item_transaksi enable row level security;
alter table public.transaksi_digital enable row level security;
alter table public.stok_masuk enable row level security;

create policy "users read own or owner"
on public.users
for select
to authenticated
using (id = auth.uid() or public.current_user_role() = 'pemilik');

create policy "owner manage users"
on public.users
for all
to authenticated
using (public.current_user_role() = 'pemilik')
with check (public.current_user_role() = 'pemilik');

create policy "authenticated read produk"
on public.produk
for select
to authenticated
using (true);

create policy "owner manage produk"
on public.produk
for all
to authenticated
using (public.current_user_role() = 'pemilik')
with check (public.current_user_role() = 'pemilik');

create policy "kasir insert transaksi"
on public.transaksi
for insert
to authenticated
with check (kasir_id = auth.uid());

create policy "kasir or owner read transaksi"
on public.transaksi
for select
to authenticated
using (kasir_id = auth.uid() or public.current_user_role() = 'pemilik');

create policy "kasir insert item transaksi"
on public.item_transaksi
for insert
to authenticated
with check (
  exists (
    select 1
    from public.transaksi t
    where t.id = transaksi_id
      and t.kasir_id = auth.uid()
  )
);

create policy "kasir or owner read item transaksi"
on public.item_transaksi
for select
to authenticated
using (
  exists (
    select 1
    from public.transaksi t
    where t.id = transaksi_id
      and (t.kasir_id = auth.uid() or public.current_user_role() = 'pemilik')
  )
);

create policy "kasir insert transaksi digital"
on public.transaksi_digital
for insert
to authenticated
with check (kasir_id = auth.uid());

create policy "kasir or owner read transaksi digital"
on public.transaksi_digital
for select
to authenticated
using (kasir_id = auth.uid() or public.current_user_role() = 'pemilik');

create policy "owner manage stok masuk"
on public.stok_masuk
for all
to authenticated
using (public.current_user_role() = 'pemilik')
with check (public.current_user_role() = 'pemilik');
