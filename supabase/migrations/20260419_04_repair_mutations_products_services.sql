-- 20260419_04_repair_mutations_products_services.sql
-- Repair runtime objects used by product save, stock mutation, wallet mutation,
-- and digital service product management.

create extension if not exists pgcrypto;

do $$
begin
  create type public.user_role as enum ('pemilik', 'kasir');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.stock_mutation_type as enum ('masuk', 'keluar', 'penyesuaian');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.jenis_dompet_trx as enum ('masuk', 'keluar', 'tarik_tunai', 'transfer_antar');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.nama_platform as enum (
    'cash',
    'qris',
    'dana',
    'bank_mas',
    'wahana',
    'pasar_kuota',
    'shopee',
    'bca',
    'split',
    'gopay',
    'ovo',
    'mandiri',
    'bri',
    'bni'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.metode_bayar as enum (
    'tunai',
    'qris',
    'transfer',
    'cash',
    'dana',
    'bank_mas',
    'wahana',
    'pasar_kuota',
    'shopee',
    'bca',
    'split',
    'gopay',
    'ovo',
    'mandiri',
    'bri',
    'bni'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.jenis_digital as enum (
    'pulsa',
    'kuota',
    'voucher_game',
    'token_listrik',
    'lainnya',
    'transfer_bank',
    'transfer_ewallet'
  );
exception
  when duplicate_object then null;
end $$;

alter type public.stock_mutation_type add value if not exists 'masuk';
alter type public.stock_mutation_type add value if not exists 'keluar';
alter type public.stock_mutation_type add value if not exists 'penyesuaian';

alter type public.jenis_dompet_trx add value if not exists 'masuk';
alter type public.jenis_dompet_trx add value if not exists 'keluar';
alter type public.jenis_dompet_trx add value if not exists 'tarik_tunai';
alter type public.jenis_dompet_trx add value if not exists 'transfer_antar';

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
alter type public.metode_bayar add value if not exists 'gopay';
alter type public.metode_bayar add value if not exists 'ovo';
alter type public.metode_bayar add value if not exists 'mandiri';
alter type public.metode_bayar add value if not exists 'bri';
alter type public.metode_bayar add value if not exists 'bni';

alter type public.jenis_digital add value if not exists 'transfer_bank';
alter type public.jenis_digital add value if not exists 'transfer_ewallet';

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

alter table public.users
  add column if not exists pin_hash text;

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

update public.produk
set aktif = case
  when coalesce(status, 'active') = 'active' then true
  else false
end
where coalesce(status, 'active') in ('active', 'inactive', 'deleted');

alter table public.produk
  alter column aktif set default true,
  alter column status set default 'active',
  alter column status set not null;

alter table public.produk
  drop constraint if exists produk_status_check;

alter table public.produk
  add constraint produk_status_check
  check (status in ('active', 'inactive', 'deleted'));

do $$
begin
  create unique index produk_kode_produk_unique
  on public.produk (kode_produk)
  where kode_produk is not null and btrim(kode_produk) <> '';
exception
  when duplicate_table then null;
  when unique_violation then
    raise notice 'Skip produk_kode_produk_unique because duplicate kode_produk values still exist.';
end $$;

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

alter table public.stok_mutasi
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists produk_id uuid references public.produk(id) on delete set null,
  add column if not exists tipe public.stock_mutation_type,
  add column if not exists jumlah integer,
  add column if not exists stok_sebelum integer,
  add column if not exists stok_sesudah integer,
  add column if not exists referensi text,
  add column if not exists catatan text,
  add column if not exists created_at timestamptz default now();

create table if not exists public.product_activity_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.produk(id) on delete set null,
  action text not null,
  actor_id uuid references auth.users(id),
  details jsonb not null default '{}'::jsonb,
  product_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_activity_logs_product
on public.product_activity_logs (product_id, created_at desc);

create index if not exists idx_product_activity_logs_created
on public.product_activity_logs (created_at desc);

create table if not exists public.services_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
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

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.services_products'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table public.services_products drop constraint %I', constraint_record.conname);
  end loop;
end $$;

alter table public.services_products
  add constraint services_products_category_check
  check (
    category in (
      'pulsa',
      'kuota',
      'voucher_game',
      'token_listrik',
      'transfer_bank',
      'transfer_ewallet'
    )
  );

alter table public.services_products
  drop constraint if exists services_products_category_provider_name_key,
  drop constraint if exists services_products_category_provider_service_type_name_key;

do $$
begin
  alter table public.services_products
    add constraint services_products_category_provider_service_type_name_key
    unique (category, provider, service_type, name);
exception
  when duplicate_object then null;
  when duplicate_table then null;
  when unique_violation then
    raise notice 'Skip services_products unique constraint because duplicate service rows still exist.';
end $$;

create index if not exists idx_services_products_type
on public.services_products (category, provider, service_type, name);

alter table public.transaksi
  add column if not exists payments jsonb not null default '[]'::jsonb;

alter table public.transaksi_dompet
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists source_ref text;

create index if not exists idx_transaksi_dompet_source
on public.transaksi_dompet (source_type, source_id);

alter table public.transaksi_digital
  add column if not exists nama_tujuan text,
  add column if not exists platform_sumber public.nama_platform,
  add column if not exists payment_method public.nama_platform not null default 'cash',
  add column if not exists service_product_id uuid references public.services_products(id) on delete set null,
  add column if not exists selling_price integer,
  add column if not exists cost integer,
  add column if not exists profit integer,
  add column if not exists target_number text,
  add column if not exists customer_name text,
  add column if not exists transfer_platform text,
  add column if not exists admin_fee integer not null default 0 check (admin_fee >= 0),
  add column if not exists total integer not null default 0 check (total >= 0),
  add column if not exists receiver_name text,
  add column if not exists transaction_items jsonb not null default '[]'::jsonb,
  add column if not exists transaction_details jsonb not null default '{}'::jsonb;

update public.transaksi_digital
set
  selling_price = coalesce(selling_price, harga_jual),
  cost = coalesce(cost, modal),
  profit = coalesce(profit, harga_jual - modal),
  target_number = coalesce(target_number, nomor_tujuan),
  customer_name = coalesce(customer_name, nama_tujuan),
  payment_method = coalesce(payment_method, 'cash'::public.nama_platform),
  admin_fee = coalesce(admin_fee, 0),
  total = case
    when coalesce(total, 0) > 0 then total
    else coalesce(harga_jual, nominal, 0)
  end;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.produk to authenticated;
grant select, insert, update, delete on public.stok_mutasi to authenticated;
grant select, insert on public.product_activity_logs to authenticated;
grant select, insert, update, delete on public.services_products to authenticated;
grant select, insert, update on public.transaksi_dompet to authenticated;

alter table public.produk enable row level security;
alter table public.stok_mutasi enable row level security;
alter table public.product_activity_logs enable row level security;
alter table public.services_products enable row level security;
alter table public.transaksi_dompet enable row level security;

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

drop policy if exists "authenticated read stok mutasi" on public.stok_mutasi;
drop policy if exists "owner manage stok mutasi" on public.stok_mutasi;
drop policy if exists "kasir insert stok keluar" on public.stok_mutasi;
drop policy if exists "kasir insert stok masuk" on public.stok_mutasi;

create policy "authenticated read stok mutasi"
on public.stok_mutasi
for select
to authenticated
using (true);

create policy "kasir insert stok masuk"
on public.stok_mutasi
for insert
to authenticated
with check (
  public.current_user_role() in ('kasir'::public.user_role, 'pemilik'::public.user_role)
  and tipe = 'masuk'::public.stock_mutation_type
);

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

drop policy if exists "kasir insert transaksi dompet" on public.transaksi_dompet;
drop policy if exists "kasir or owner read transaksi dompet" on public.transaksi_dompet;
drop policy if exists "owner manage transaksi dompet" on public.transaksi_dompet;

create policy "kasir insert transaksi dompet"
on public.transaksi_dompet
for insert
to authenticated
with check (
  kasir_id = auth.uid()
  or public.current_user_role() = 'pemilik'::public.user_role
);

create policy "kasir or owner read transaksi dompet"
on public.transaksi_dompet
for select
to authenticated
using (
  kasir_id = auth.uid()
  or public.current_user_role() = 'pemilik'::public.user_role
);

create policy "owner manage transaksi dompet"
on public.transaksi_dompet
for all
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role)
with check (public.current_user_role() = 'pemilik'::public.user_role);

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'service_products'
      and c.relkind = 'm'
  ) then
    execute 'drop materialized view public.service_products';
  elsif exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'service_products'
      and c.relkind = 'v'
  ) then
    execute 'drop view public.service_products';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'service_products'
  ) then
    execute $view$
      create view public.service_products
      with (security_invoker = true)
      as
      select
        id,
        name,
        category,
        provider,
        service_type,
        cost,
        default_price,
        case when active then 'active' else 'inactive' end as status,
        created_at
      from public.services_products
    $view$;
  end if;
end $$;

grant select on public.service_products to authenticated;

create or replace function public.pos_wallet_balance(p_platform public.nama_platform)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    case
      when platform = p_platform and jenis = 'masuk'::public.jenis_dompet_trx
        then greatest(nominal - biaya_admin, 0)
      when platform = p_platform and jenis = 'keluar'::public.jenis_dompet_trx
        then -(nominal + biaya_admin)
      when platform = p_platform and jenis in (
        'tarik_tunai'::public.jenis_dompet_trx,
        'transfer_antar'::public.jenis_dompet_trx
      )
        then -(nominal + biaya_admin)
      when platform_tujuan = p_platform and jenis in (
        'tarik_tunai'::public.jenis_dompet_trx,
        'transfer_antar'::public.jenis_dompet_trx
      )
        then greatest(nominal - biaya_admin, 0)
      else 0
    end
  ), 0)::integer
  from public.transaksi_dompet;
$$;

create or replace function public.pos_assert_wallet_balance(
  p_platform public.nama_platform,
  p_amount integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_platform is null or coalesce(p_amount, 0) <= 0 then
    return;
  end if;

  if p_platform::text in ('cash', 'qris', 'split') then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('wallet:' || p_platform::text)::bigint);
  v_balance := public.pos_wallet_balance(p_platform);

  if v_balance = 0 then
    raise exception 'Saldo 0. Isi saldo manual terlebih dahulu agar transaksi dapat divalidasi.';
  end if;

  if v_balance < p_amount then
    raise exception 'Saldo tidak mencukupi, silakan isi saldo terlebih dahulu';
  end if;
end;
$$;

create or replace function public.pos_insert_wallet_movement(
  p_kasir_id uuid,
  p_platform public.nama_platform,
  p_jenis public.jenis_dompet_trx,
  p_nominal integer,
  p_biaya_admin integer default 0,
  p_platform_tujuan public.nama_platform default null,
  p_keterangan text default null,
  p_source_type text default null,
  p_source_id uuid default null,
  p_source_ref text default null,
  p_created_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  if p_platform is null or coalesce(p_nominal, 0) <= 0 then
    return null;
  end if;

  if coalesce(p_biaya_admin, 0) < 0 then
    raise exception 'Biaya admin tidak boleh negatif.';
  end if;

  if p_jenis = 'masuk'::public.jenis_dompet_trx and coalesce(p_biaya_admin, 0) > p_nominal then
    raise exception 'Biaya admin tidak boleh lebih besar dari nominal masuk.';
  end if;

  if p_jenis in (
    'keluar'::public.jenis_dompet_trx,
    'tarik_tunai'::public.jenis_dompet_trx,
    'transfer_antar'::public.jenis_dompet_trx
  ) then
    perform public.pos_assert_wallet_balance(p_platform, p_nominal + coalesce(p_biaya_admin, 0));
  else
    perform pg_advisory_xact_lock(hashtext('wallet:' || p_platform::text)::bigint);
  end if;

  insert into public.transaksi_dompet (
    id,
    kasir_id,
    platform,
    jenis,
    platform_tujuan,
    nominal,
    biaya_admin,
    keterangan,
    source_type,
    source_id,
    source_ref,
    created_at
  )
  values (
    v_id,
    p_kasir_id,
    p_platform,
    p_jenis,
    p_platform_tujuan,
    p_nominal,
    coalesce(p_biaya_admin, 0),
    p_keterangan,
    p_source_type,
    p_source_id,
    p_source_ref,
    coalesce(p_created_at, now())
  );

  return v_id;
end;
$$;

create or replace function public.create_wallet_transaction_atomic(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_kasir_id uuid := coalesce(nullif(p_transaction->>'kasir_id', '')::uuid, v_user_id);
  v_platform public.nama_platform := (p_transaction->>'platform')::public.nama_platform;
  v_jenis public.jenis_dompet_trx := (p_transaction->>'jenis')::public.jenis_dompet_trx;
  v_platform_tujuan public.nama_platform := nullif(p_transaction->>'platform_tujuan', '')::public.nama_platform;
  v_nominal integer := coalesce((p_transaction->>'nominal')::numeric::integer, 0);
  v_biaya_admin integer := coalesce((p_transaction->>'biaya_admin')::numeric::integer, 0);
  v_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
    raise exception 'Kasir tidak berwenang menyimpan mutasi saldo ini.';
  end if;

  if v_nominal <= 0 then
    raise exception 'Nominal mutasi harus lebih besar dari 0.';
  end if;

  if v_biaya_admin < 0 then
    raise exception 'Biaya admin tidak boleh negatif.';
  end if;

  if v_jenis = 'masuk'::public.jenis_dompet_trx and v_biaya_admin > v_nominal then
    raise exception 'Biaya admin tidak boleh lebih besar dari nominal masuk.';
  end if;

  if v_jenis = 'transfer_antar'::public.jenis_dompet_trx then
    if v_platform_tujuan is null then
      raise exception 'Pilih tujuan transfer wallet.';
    end if;

    if v_platform = v_platform_tujuan then
      raise exception 'Wallet asal dan tujuan tidak boleh sama.';
    end if;
  end if;

  v_id := public.pos_insert_wallet_movement(
    v_kasir_id,
    v_platform,
    v_jenis,
    v_nominal,
    v_biaya_admin,
    v_platform_tujuan,
    p_transaction->>'keterangan',
    coalesce(nullif(p_transaction->>'source_type', ''), 'manual_wallet'),
    nullif(p_transaction->>'source_id', '')::uuid,
    p_transaction->>'source_ref',
    nullif(p_transaction->>'created_at', '')::timestamptz
  );

  v_result := (
    select to_jsonb(wallet_row)
    from public.transaksi_dompet as wallet_row
    where wallet_row.id = v_id
  );

  return v_result;
end;
$$;

create or replace function public.save_stock_mutation_atomic(p_mutation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_product_id uuid := (p_mutation->>'produk_id')::uuid;
  v_tipe public.stock_mutation_type := (p_mutation->>'tipe')::public.stock_mutation_type;
  v_jumlah integer := coalesce((p_mutation->>'jumlah')::numeric::integer, 0);
  v_delta integer;
  v_produk_stok integer;
  v_produk_status text;
  v_mutation_id uuid := coalesce(nullif(p_mutation->>'id', '')::uuid, gen_random_uuid());
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role and v_tipe <> 'masuk'::public.stock_mutation_type then
    raise exception 'Kasir hanya boleh menambah stok produk.';
  end if;

  if v_jumlah = 0 then
    raise exception 'Jumlah mutasi harus diisi dan tidak boleh 0.';
  end if;

  v_delta := case
    when v_tipe = 'masuk'::public.stock_mutation_type then abs(v_jumlah)
    when v_tipe = 'keluar'::public.stock_mutation_type then -abs(v_jumlah)
    else v_jumlah
  end;

  select stok, coalesce(status, 'active')
  into v_produk_stok, v_produk_status
  from public.produk
  where id = v_product_id
  for update;

  if not found then
    raise exception 'Produk tidak ditemukan.';
  end if;

  if v_produk_status = 'deleted' then
    raise exception 'Produk yang sudah dihapus tidak bisa dimutasi stoknya.';
  end if;

  if v_produk_stok + v_delta < 0 then
    raise exception 'Stok tidak cukup untuk mutasi ini.';
  end if;

  update public.produk
  set
    stok = public.produk.stok + v_delta,
    updated_at = now()
  where id = v_product_id;

  insert into public.stok_mutasi (
    id,
    produk_id,
    tipe,
    jumlah,
    stok_sebelum,
    stok_sesudah,
    referensi,
    catatan,
    created_at
  )
  values (
    v_mutation_id,
    v_product_id,
    v_tipe,
    v_delta,
    v_produk_stok,
    v_produk_stok + v_delta,
    p_mutation->>'referensi',
    p_mutation->>'catatan',
    coalesce(nullif(p_mutation->>'created_at', '')::timestamptz, now())
  );

  v_result := (
    select to_jsonb(mutation_row)
    from public.stok_mutasi as mutation_row
    where mutation_row.id = v_mutation_id
  );

  return v_result;
end;
$$;

create or replace function public.purge_expired_deleted_products()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product record;
  v_deleted_count integer := 0;
begin
  if v_user_id is null then
    return 0;
  end if;

  if public.current_user_role() is distinct from 'pemilik'::public.user_role then
    return 0;
  end if;

  for v_product in
    select *
    from public.produk
    where status = 'deleted'
      and deleted_at < now() - interval '30 days'
  loop
    insert into public.product_activity_logs (
      product_id,
      action,
      actor_id,
      details,
      product_snapshot,
      created_at
    )
    values (
      v_product.id,
      'permanent_delete_product',
      v_user_id,
      jsonb_build_object(
        'reason', 'auto_delete_after_30_days',
        'deleted_at', v_product.deleted_at
      ),
      to_jsonb(v_product),
      now()
    );

    delete from public.produk
    where id = v_product.id;

    v_deleted_count := v_deleted_count + 1;
  end loop;

  return v_deleted_count;
end;
$$;

grant execute on function public.pos_wallet_balance(public.nama_platform) to authenticated;
grant execute on function public.create_wallet_transaction_atomic(jsonb) to authenticated;
grant execute on function public.save_stock_mutation_atomic(jsonb) to authenticated;
grant execute on function public.purge_expired_deleted_products() to authenticated;

do $$
begin
  if to_regprocedure('public.create_accessory_transaction_atomic(jsonb,jsonb)') is not null then
    execute 'grant execute on function public.create_accessory_transaction_atomic(jsonb, jsonb) to authenticated';
  end if;
end $$;

notify pgrst, 'reload schema';
