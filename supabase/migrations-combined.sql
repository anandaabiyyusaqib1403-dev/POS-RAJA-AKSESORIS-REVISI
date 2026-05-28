-- ============================================================
-- 20260412_raja_aksesoris_pos.sql
-- ============================================================
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

-- ============================================================
-- 20260412_product_code_and_stock_mutations.sql
-- ============================================================
do $$
begin
  create type stock_mutation_type as enum ('masuk', 'keluar', 'penyesuaian');
exception
  when duplicate_object then null;
end $$;

alter table public.produk
add column if not exists kode_produk text;

create unique index if not exists produk_kode_produk_unique
on public.produk (kode_produk)
where kode_produk is not null and btrim(kode_produk) <> '';

create table if not exists public.stok_mutasi (
  id uuid primary key default gen_random_uuid(),
  produk_id uuid not null references public.produk(id) on delete cascade,
  tipe stock_mutation_type not null,
  jumlah integer not null check (jumlah <> 0),
  stok_sebelum integer check (stok_sebelum is null or stok_sebelum >= 0),
  stok_sesudah integer check (stok_sesudah is null or stok_sesudah >= 0),
  referensi text,
  catatan text,
  created_at timestamptz default now()
);

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
select
  sm.id,
  sm.produk_id,
  'masuk'::stock_mutation_type,
  sm.jumlah,
  null,
  null,
  null,
  'Migrasi dari stok_masuk',
  sm.created_at
from public.stok_masuk sm
on conflict (id) do nothing;

alter table public.stok_mutasi enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stok_mutasi'
      and policyname = 'authenticated read stok mutasi'
  ) then
    create policy "authenticated read stok mutasi"
    on public.stok_mutasi
    for select
    to authenticated
    using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stok_mutasi'
      and policyname = 'owner manage stok mutasi'
  ) then
    create policy "owner manage stok mutasi"
    on public.stok_mutasi
    for all
    to authenticated
    using (public.current_user_role() = 'pemilik')
    with check (public.current_user_role() = 'pemilik');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stok_mutasi'
      and policyname = 'kasir insert stok masuk'
  ) then
    create policy "kasir insert stok masuk"
    on public.stok_mutasi
    for insert
    to authenticated
    with check (
      public.current_user_role() in ('kasir', 'pemilik')
      and tipe = 'masuk'
    );
  end if;
end $$;

-- ============================================================
-- 20260412_pos_v2_modules.sql
-- ============================================================
do $$
begin
  create type jenis_dompet_trx as enum ('masuk', 'keluar', 'tarik_tunai', 'transfer_antar');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type nama_platform as enum (
    'tunai', 'dana', 'gopay', 'shopeepay', 'ovo', 'linkaja',
    'bca', 'mandiri', 'bri', 'bni', 'lainnya'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.transaksi_dompet (
  id uuid primary key default gen_random_uuid(),
  kasir_id uuid references public.users(id),
  platform nama_platform not null,
  jenis jenis_dompet_trx not null,
  platform_tujuan nama_platform,
  nominal integer not null check (nominal > 0),
  biaya_admin integer not null default 0 check (biaya_admin >= 0),
  keterangan text,
  created_at timestamptz default now()
);

create table if not exists public.transaksi_logistik (
  id uuid primary key default gen_random_uuid(),
  kasir_id uuid references public.users(id),
  no_transaksi text unique not null,
  ekspedisi text not null,
  harga_jual integer not null check (harga_jual >= 0),
  modal integer not null check (modal >= 0),
  keuntungan integer generated always as (harga_jual - modal) stored,
  no_resi text,
  catatan text,
  created_at timestamptz default now()
);

do $$
begin
  create type jenis_kas as enum ('pemasukan', 'pengeluaran');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type kategori_kas as enum (
    'saldo_awal', 'tambah_saldo', 'setor_bank', 'tarik_tunai',
    'restock', 'listrik', 'sewa', 'gaji', 'operasional', 'lainnya'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.kas (
  id uuid primary key default gen_random_uuid(),
  kasir_id uuid references public.users(id),
  jenis jenis_kas not null,
  kategori kategori_kas not null,
  nominal integer not null check (nominal > 0),
  keterangan text,
  tanggal date not null default current_date,
  created_at timestamptz default now()
);

alter table public.transaksi_dompet enable row level security;
alter table public.transaksi_logistik enable row level security;
alter table public.kas enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaksi_dompet'
      and policyname = 'kasir insert transaksi dompet'
  ) then
    create policy "kasir insert transaksi dompet"
    on public.transaksi_dompet
    for insert
    to authenticated
    with check (kasir_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaksi_dompet'
      and policyname = 'kasir or owner read transaksi dompet'
  ) then
    create policy "kasir or owner read transaksi dompet"
    on public.transaksi_dompet
    for select
    to authenticated
    using (kasir_id = auth.uid() or public.current_user_role() = 'pemilik');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaksi_dompet'
      and policyname = 'owner manage transaksi dompet'
  ) then
    create policy "owner manage transaksi dompet"
    on public.transaksi_dompet
    for all
    to authenticated
    using (public.current_user_role() = 'pemilik')
    with check (public.current_user_role() = 'pemilik');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaksi_logistik'
      and policyname = 'kasir insert transaksi logistik'
  ) then
    create policy "kasir insert transaksi logistik"
    on public.transaksi_logistik
    for insert
    to authenticated
    with check (kasir_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaksi_logistik'
      and policyname = 'kasir or owner read transaksi logistik'
  ) then
    create policy "kasir or owner read transaksi logistik"
    on public.transaksi_logistik
    for select
    to authenticated
    using (kasir_id = auth.uid() or public.current_user_role() = 'pemilik');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaksi_logistik'
      and policyname = 'owner manage transaksi logistik'
  ) then
    create policy "owner manage transaksi logistik"
    on public.transaksi_logistik
    for all
    to authenticated
    using (public.current_user_role() = 'pemilik')
    with check (public.current_user_role() = 'pemilik');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'kas'
      and policyname = 'kasir insert kas'
  ) then
    create policy "kasir insert kas"
    on public.kas
    for insert
    to authenticated
    with check (kasir_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'kas'
      and policyname = 'kasir or owner read kas'
  ) then
    create policy "kasir or owner read kas"
    on public.kas
    for select
    to authenticated
    using (kasir_id = auth.uid() or public.current_user_role() = 'pemilik');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'kas'
      and policyname = 'owner manage kas'
  ) then
    create policy "owner manage kas"
    on public.kas
    for all
    to authenticated
    using (public.current_user_role() = 'pemilik')
    with check (public.current_user_role() = 'pemilik');
  end if;
end $$;

-- ============================================================
-- 20260412_layanan_fields.sql
-- ============================================================
alter type public.jenis_digital add value if not exists 'transfer_bank';
alter type public.jenis_digital add value if not exists 'transfer_ewallet';
alter type public.jenis_digital add value if not exists 'tarik_tunai';

alter table public.transaksi_digital
  add column if not exists nama_tujuan text;

do $$
begin
  if exists (
    select 1
    from pg_type
    where typname = 'nama_platform'
  ) then
    alter table public.transaksi_digital
      add column if not exists platform_sumber nama_platform;
  end if;
end $$;

-- ============================================================
-- 20260416_01_wallet_manual_control_enums.sql
-- ============================================================
alter type public.metode_bayar add value if not exists 'cash';
alter type public.metode_bayar add value if not exists 'dana';
alter type public.metode_bayar add value if not exists 'bank_mas';
alter type public.metode_bayar add value if not exists 'wahana';
alter type public.metode_bayar add value if not exists 'pasar_kuota';
alter type public.metode_bayar add value if not exists 'shopee';
alter type public.metode_bayar add value if not exists 'bca';

alter type public.nama_platform add value if not exists 'cash';
alter type public.nama_platform add value if not exists 'bank_mas';
alter type public.nama_platform add value if not exists 'wahana';
alter type public.nama_platform add value if not exists 'pasar_kuota';
alter type public.nama_platform add value if not exists 'shopee';
alter type public.nama_platform add value if not exists 'qris';

-- ============================================================
-- 20260416_02_wallet_manual_control_backfill.sql
-- ============================================================
alter table public.transaksi
  alter column metode_bayar set default 'cash';

update public.transaksi
set metode_bayar = 'cash'::public.metode_bayar
where metode_bayar::text = 'tunai';

update public.transaksi_dompet
set platform = 'cash'::public.nama_platform
where platform::text = 'tunai';

update public.transaksi_dompet
set platform_tujuan = 'cash'::public.nama_platform
where platform_tujuan::text = 'tunai';

update public.transaksi_dompet
set platform = 'shopee'::public.nama_platform
where platform::text = 'shopeepay';

update public.transaksi_dompet
set platform_tujuan = 'shopee'::public.nama_platform
where platform_tujuan::text = 'shopeepay';

-- ============================================================
-- 20260416_03_logistics_service_recording.sql
-- ============================================================
alter table public.transaksi_logistik
  add column if not exists type text not null default 'logistik',
  add column if not exists sender_name text,
  add column if not exists receiver_name text,
  add column if not exists destination text,
  add column if not exists package_type text,
  add column if not exists weight numeric(10, 2) not null default 0,
  add column if not exists price integer not null default 0,
  add column if not exists payment_method nama_platform;

update public.transaksi_logistik
set
  type = coalesce(type, 'logistik'),
  receiver_name = coalesce(receiver_name, no_resi, 'Penerima'),
  destination = coalesce(destination, catatan, '-'),
  package_type = coalesce(package_type, 'Regular'),
  price = case when price > 0 then price else harga_jual end,
  payment_method = coalesce(payment_method, 'cash'::public.nama_platform);

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
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transaksi_logistik_weight_check'
  ) then
    alter table public.transaksi_logistik
      add constraint transaksi_logistik_weight_check check (weight >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transaksi_logistik_price_check'
  ) then
    alter table public.transaksi_logistik
      add constraint transaksi_logistik_price_check check (price >= 0);
  end if;
end $$;

-- ============================================================
-- 20260417_01_split_payment_method.sql
-- ============================================================
alter type public.metode_bayar add value if not exists 'split';

alter table public.transaksi
  add column if not exists payments jsonb not null default '[]'::jsonb;

-- ============================================================
-- 20260417_02_shift_management.sql
-- ============================================================
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

-- ============================================================
-- 20260417_03_atomic_pos_consistency.sql
-- ============================================================
alter type public.metode_bayar add value if not exists 'cash';
  alter type public.metode_bayar add value if not exists 'dana';
  alter type public.metode_bayar add value if not exists 'bank_mas';
  alter type public.metode_bayar add value if not exists 'wahana';
  alter type public.metode_bayar add value if not exists 'pasar_kuota';
  alter type public.metode_bayar add value if not exists 'shopee';
  alter type public.metode_bayar add value if not exists 'bca';
  alter type public.metode_bayar add value if not exists 'split';

  alter type public.nama_platform add value if not exists 'cash';
  alter type public.nama_platform add value if not exists 'bank_mas';
  alter type public.nama_platform add value if not exists 'wahana';
  alter type public.nama_platform add value if not exists 'pasar_kuota';
  alter type public.nama_platform add value if not exists 'shopee';
  alter type public.nama_platform add value if not exists 'qris';

  alter table public.transaksi
    add column if not exists payments jsonb not null default '[]'::jsonb;

  alter table public.produk
    add column if not exists aktif boolean default true;

  alter table public.transaksi_dompet
    add column if not exists source_type text,
    add column if not exists source_id uuid,
    add column if not exists source_ref text;

  create index if not exists idx_transaksi_dompet_source
  on public.transaksi_dompet (source_type, source_id);

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

    if p_platform::text in ('cash', 'qris') then
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

    if p_jenis in ('keluar'::public.jenis_dompet_trx, 'tarik_tunai'::public.jenis_dompet_trx, 'transfer_antar'::public.jenis_dompet_trx) then
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
      p_transaction->>'source_type',
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

  create or replace function public.create_accessory_transaction_atomic(
    p_transaction jsonb,
    p_items jsonb
  )
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_user_id uuid := auth.uid();
    v_role public.user_role := public.current_user_role();
    v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
    v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
    v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
    v_no_transaksi text := p_transaction->>'no_transaksi';
    v_method public.metode_bayar := coalesce(nullif(p_transaction->>'metode_bayar', ''), 'cash')::public.metode_bayar;
    v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
    v_total integer := coalesce((p_transaction->>'total_bayar')::numeric::integer, 0);
    v_uang_diterima integer := coalesce((p_transaction->>'uang_diterima')::numeric::integer, v_total);
    v_kembalian integer := coalesce((p_transaction->>'kembalian')::numeric::integer, 0);
    v_payments jsonb := p_transaction->'payments';
    v_payment jsonb;
    v_payment_method text;
    v_payment_amount integer;
    v_payment_total integer := 0;
    v_item jsonb;
    v_produk public.produk%rowtype;
    v_qty integer;
    v_harga_satuan integer;
    v_subtotal integer;
    v_items_total integer := 0;
    v_result jsonb;
  begin
    if v_user_id is null then
      raise exception 'User belum login.';
    end if;

    if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
      raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
    end if;

    perform 1
    from public.shifts s
    where s.id = v_shift_id
      and s.cashier_id = v_kasir_id
      and s.status = 'active'::public.shift_status
    for update;

    if not found then
      raise exception 'Mulai shift dulu sebelum menyimpan transaksi.';
    end if;

    if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Keranjang masih kosong.';
    end if;

    if jsonb_typeof(v_payments) <> 'array' or jsonb_array_length(v_payments) = 0 then
      v_payments := jsonb_build_array(
        jsonb_build_object('method', v_method::text, 'amount', v_total)
      );
    end if;

    for v_payment in select value from jsonb_array_elements(v_payments)
    loop
      v_payment_method := coalesce(nullif(v_payment->>'method', ''), v_method::text);
      v_payment_amount := coalesce((v_payment->>'amount')::numeric::integer, 0);

      if v_payment_amount <= 0 then
        raise exception 'Nominal pembayaran harus lebih besar dari 0.';
      end if;

      perform v_payment_method::public.nama_platform;
      v_payment_total := v_payment_total + v_payment_amount;
    end loop;

    if v_payment_total <> v_total then
      raise exception 'Total pembayaran harus sama dengan total transaksi.';
    end if;

    insert into public.transaksi (
      id,
      kasir_id,
      shift_id,
      no_transaksi,
      total_bayar,
      uang_diterima,
      kembalian,
      metode_bayar,
      payments,
      catatan,
      created_at
    )
    values (
      v_transaction_id,
      v_kasir_id,
      v_shift_id,
      v_no_transaksi,
      v_total,
      v_uang_diterima,
      v_kembalian,
      v_method,
      v_payments,
      p_transaction->>'catatan',
      v_created_at
    );

    for v_item in select value from jsonb_array_elements(p_items)
    loop
      v_qty := coalesce((v_item->>'qty')::numeric::integer, 0);
      v_harga_satuan := coalesce((v_item->>'harga_satuan')::numeric::integer, 0);
      v_subtotal := coalesce((v_item->>'subtotal')::numeric::integer, 0);

      if v_qty <= 0 then
        raise exception 'Qty item transaksi harus lebih besar dari 0.';
      end if;

      if v_harga_satuan < 0 or v_subtotal <> v_qty * v_harga_satuan then
        raise exception 'Subtotal item transaksi tidak valid.';
      end if;

      select *
      into v_produk
      from public.produk
      where id = (v_item->>'produk_id')::uuid
      for update;

      if not found then
        raise exception 'Produk tidak ditemukan.';
      end if;

      if coalesce(v_produk.aktif, true) is false then
        raise exception 'Produk % tidak aktif.', v_produk.nama;
      end if;

      if v_produk.stok < v_qty then
        raise exception 'Stok % tidak cukup. Sisa stok %.', v_produk.nama, v_produk.stok;
      end if;

      insert into public.item_transaksi (
        id,
        transaksi_id,
        produk_id,
        nama_produk,
        qty,
        harga_satuan,
        subtotal
      )
      values (
        coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()),
        v_transaction_id,
        v_produk.id,
        coalesce(nullif(v_item->>'nama_produk', ''), v_produk.nama),
        v_qty,
        v_harga_satuan,
        v_subtotal
      );

      update public.produk
      set stok = stok - v_qty
      where id = v_produk.id;

      insert into public.stok_mutasi (
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
        v_produk.id,
        'keluar'::public.stock_mutation_type,
        -v_qty,
        v_produk.stok,
        v_produk.stok - v_qty,
        v_no_transaksi,
        'Penjualan aksesoris',
        v_created_at
      );

      v_items_total := v_items_total + v_subtotal;
    end loop;

    if v_items_total <> v_total then
      raise exception 'Total item tidak sama dengan total transaksi.';
    end if;

    for v_payment in select value from jsonb_array_elements(v_payments)
    loop
      v_payment_method := coalesce(nullif(v_payment->>'method', ''), v_method::text);
      v_payment_amount := coalesce((v_payment->>'amount')::numeric::integer, 0);

      if v_payment_method not in ('cash', 'qris', 'split') then
        perform public.pos_insert_wallet_movement(
          v_kasir_id,
          v_payment_method::public.nama_platform,
          'masuk'::public.jenis_dompet_trx,
          v_payment_amount,
          0,
          null,
          'Pembayaran aksesoris ' || v_no_transaksi,
          'accessory_sale',
          v_transaction_id,
          v_no_transaksi,
          v_created_at
        );
      end if;
    end loop;

    v_result := (
      select to_jsonb(t) || jsonb_build_object(
        'items',
        coalesce(
          (
            select jsonb_agg(to_jsonb(i) order by i.id)
            from public.item_transaksi i
            where i.transaksi_id = t.id
          ),
          '[]'::jsonb
        )
      )
      from public.transaksi t
      where t.id = v_transaction_id
    );

    return v_result;
  end;
  $$;

  create or replace function public.create_digital_transaction_atomic(p_transaction jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_user_id uuid := auth.uid();
    v_role public.user_role := public.current_user_role();
    v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
    v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
    v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
    v_no_transaksi text := p_transaction->>'no_transaksi';
    v_jenis public.jenis_digital := (p_transaction->>'jenis')::public.jenis_digital;
    v_source_platform public.nama_platform := nullif(p_transaction->>'platform_sumber', '')::public.nama_platform;
    v_payment_method public.nama_platform := coalesce(nullif(p_transaction->>'payment_method', ''), 'cash')::public.nama_platform;
    v_harga_jual integer := coalesce((p_transaction->>'harga_jual')::numeric::integer, 0);
    v_modal integer := coalesce((p_transaction->>'modal')::numeric::integer, 0);
    v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
    v_result jsonb;
  begin
    if v_user_id is null then
      raise exception 'User belum login.';
    end if;

    if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
      raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
    end if;

    perform 1
    from public.shifts s
    where s.id = v_shift_id
      and s.cashier_id = v_kasir_id
      and s.status = 'active'::public.shift_status
    for update;

    if not found then
      raise exception 'Mulai shift dulu sebelum menyimpan transaksi layanan.';
    end if;

    if v_modal > 0 and v_source_platform is null then
      raise exception 'Pilih sumber saldo toko.';
    end if;

    insert into public.transaksi_digital (
      id,
      kasir_id,
      shift_id,
      no_transaksi,
      jenis,
      provider,
      nomor_tujuan,
      nama_tujuan,
      platform_sumber,
      payment_method,
      nominal,
      harga_jual,
      modal,
      catatan,
      created_at
    )
    values (
      v_transaction_id,
      v_kasir_id,
      v_shift_id,
      v_no_transaksi,
      v_jenis,
      p_transaction->>'provider',
      p_transaction->>'nomor_tujuan',
      p_transaction->>'nama_tujuan',
      v_source_platform,
      v_payment_method,
      coalesce((p_transaction->>'nominal')::numeric::integer, 0),
      v_harga_jual,
      v_modal,
      p_transaction->>'catatan',
      v_created_at
    );

    if v_source_platform is not null and v_modal > 0 then
      perform public.pos_insert_wallet_movement(
        v_kasir_id,
        v_source_platform,
        'keluar'::public.jenis_dompet_trx,
        v_modal,
        0,
        null,
        'Modal layanan ' || v_no_transaksi,
        'digital_modal',
        v_transaction_id,
        v_no_transaksi,
        v_created_at
      );
    end if;

    if v_payment_method::text not in ('cash', 'qris') and v_harga_jual > 0 then
      perform public.pos_insert_wallet_movement(
        v_kasir_id,
        v_payment_method,
        'masuk'::public.jenis_dompet_trx,
        v_harga_jual,
        0,
        null,
        'Pembayaran layanan ' || v_no_transaksi,
        'digital_sale',
        v_transaction_id,
        v_no_transaksi,
        v_created_at
      );
    end if;

    v_result := (
      select to_jsonb(digital_row)
      from public.transaksi_digital as digital_row
      where digital_row.id = v_transaction_id
    );

    return v_result;
  end;
  $$;

  create or replace function public.create_logistics_transaction_atomic(p_transaction jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_user_id uuid := auth.uid();
    v_role public.user_role := public.current_user_role();
    v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
    v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
    v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
    v_no_transaksi text := p_transaction->>'no_transaksi';
    v_payment_method public.nama_platform := coalesce(nullif(p_transaction->>'payment_method', ''), 'cash')::public.nama_platform;
    v_price integer := coalesce((p_transaction->>'price')::numeric::integer, (p_transaction->>'harga_jual')::numeric::integer, 0);
    v_modal integer := coalesce((p_transaction->>'modal')::numeric::integer, 0);
    v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
    v_result jsonb;
  begin
    if v_user_id is null then
      raise exception 'User belum login.';
    end if;

    if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
      raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
    end if;

    perform 1
    from public.shifts s
    where s.id = v_shift_id
      and s.cashier_id = v_kasir_id
      and s.status = 'active'::public.shift_status
    for update;

    if not found then
      raise exception 'Mulai shift dulu sebelum menyimpan transaksi logistik.';
    end if;

    insert into public.transaksi_logistik (
      id,
      kasir_id,
      shift_id,
      no_transaksi,
      ekspedisi,
      harga_jual,
      modal,
      no_resi,
      catatan,
      created_at,
      type,
      sender_name,
      receiver_name,
      destination,
      package_type,
      weight,
      price,
      payment_method
    )
    values (
      v_transaction_id,
      v_kasir_id,
      v_shift_id,
      v_no_transaksi,
      p_transaction->>'ekspedisi',
      v_price,
      v_modal,
      p_transaction->>'no_resi',
      p_transaction->>'catatan',
      v_created_at,
      coalesce(nullif(p_transaction->>'type', ''), 'logistik'),
      p_transaction->>'sender_name',
      p_transaction->>'receiver_name',
      p_transaction->>'destination',
      p_transaction->>'package_type',
      coalesce((p_transaction->>'weight')::numeric, 0),
      v_price,
      v_payment_method
    );

    if v_payment_method::text not in ('cash', 'qris') and v_price > 0 then
      perform public.pos_insert_wallet_movement(
        v_kasir_id,
        v_payment_method,
        'masuk'::public.jenis_dompet_trx,
        v_price,
        0,
        null,
        'Pembayaran logistik ' || v_no_transaksi,
        'logistics_sale',
        v_transaction_id,
        v_no_transaksi,
        v_created_at
      );
    end if;

    v_result := (
      select to_jsonb(logistics_row)
      from public.transaksi_logistik as logistics_row
      where logistics_row.id = v_transaction_id
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
    v_produk record;
    v_produk_found boolean := false;
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

    for v_produk in
      select *
      from public.produk
      where id = v_product_id
      for update
    loop
      v_produk_found := true;
      exit;
    end loop;

    if not v_produk_found then
      raise exception 'Produk tidak ditemukan.';
    end if;

    if (v_produk).stok + v_delta < 0 then
      raise exception 'Stok tidak cukup untuk mutasi ini.';
    end if;

    update public.produk
    set stok = stok + v_delta
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
      (v_produk).stok,
      (v_produk).stok + v_delta,
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

  grant execute on function public.pos_wallet_balance(public.nama_platform) to authenticated;
  grant execute on function public.create_wallet_transaction_atomic(jsonb) to authenticated;
  grant execute on function public.create_accessory_transaction_atomic(jsonb, jsonb) to authenticated;
  grant execute on function public.create_digital_transaction_atomic(jsonb) to authenticated;
  grant execute on function public.create_logistics_transaction_atomic(jsonb) to authenticated;
  grant execute on function public.save_stock_mutation_atomic(jsonb) to authenticated;

-- ============================================================
-- 20260417_05_product_recycle_bin.sql
-- ============================================================
alter table public.produk
  add column if not exists aktif boolean default true,
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

update public.produk
set
  aktif = case when status = 'active' then true else false end,
  deleted_at = case when status = 'deleted' then coalesce(deleted_at, now()) else null end
where status in ('active', 'inactive', 'deleted');

create index if not exists idx_produk_status on public.produk (status, created_at desc);
create index if not exists idx_produk_deleted_at on public.produk (deleted_at)
where status = 'deleted';

create table if not exists public.product_activity_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.produk(id) on delete set null,
  action text not null check (
    action in (
      'edit_product',
      'delete_product',
      'restore_product',
      'permanent_delete_product',
      'update_stock',
      'toggle_product_status'
    )
  ),
  actor_id uuid references auth.users(id),
  details jsonb not null default '{}'::jsonb,
  product_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_activity_logs_product
on public.product_activity_logs (product_id, created_at desc);

create index if not exists idx_product_activity_logs_created
on public.product_activity_logs (created_at desc);

alter table public.product_activity_logs enable row level security;

drop policy if exists "owner read product activity logs" on public.product_activity_logs;
create policy "owner read product activity logs"
on public.product_activity_logs
for select
to authenticated
using (public.current_user_role() = 'pemilik');

drop policy if exists "authenticated insert product activity logs" on public.product_activity_logs;
create policy "authenticated insert product activity logs"
on public.product_activity_logs
for insert
to authenticated
with check (actor_id = auth.uid() or public.current_user_role() = 'pemilik');

drop policy if exists "kasir insert stok keluar" on public.stok_mutasi;
drop policy if exists "kasir insert stok masuk" on public.stok_mutasi;
create policy "kasir insert stok masuk"
on public.stok_mutasi
for insert
to authenticated
with check (
  public.current_user_role() in ('kasir', 'pemilik')
  and tipe = 'masuk'
);

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.item_transaksi'::regclass
      and confrelid = 'public.produk'::regclass
  loop
    execute format('alter table public.item_transaksi drop constraint %I', constraint_record.conname);
  end loop;

  alter table public.item_transaksi
    add constraint item_transaksi_produk_id_fkey
    foreign key (produk_id)
    references public.produk(id)
    on delete set null;
end $$;

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
  v_produk record;
  v_produk_found boolean := false;
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

  for v_produk in
    select *
    from public.produk
    where id = v_product_id
    for update
  loop
    v_produk_found := true;
    exit;
  end loop;

  if not v_produk_found then
    raise exception 'Produk tidak ditemukan.';
  end if;

  if (v_produk).status = 'deleted' then
    raise exception 'Produk yang sudah dihapus tidak bisa dimutasi stoknya.';
  end if;

  if (v_produk).stok + v_delta < 0 then
    raise exception 'Stok tidak cukup untuk mutasi ini.';
  end if;

  update public.produk
  set
    stok = stok + v_delta,
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
    (v_produk).stok,
    (v_produk).stok + v_delta,
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
      (v_product).id,
      'permanent_delete_product',
      v_user_id,
      jsonb_build_object(
        'reason', 'auto_delete_after_30_days',
        'deleted_at', (v_product).deleted_at
      ),
      to_jsonb(v_product),
      now()
    );

    delete from public.produk
    where id = (v_product).id;

    v_deleted_count := v_deleted_count + 1;
  end loop;

  return v_deleted_count;
end;
$$;

grant execute on function public.purge_expired_deleted_products() to authenticated;

-- ============================================================
-- 20260417_06_digital_service_cashier_fields.sql
-- ============================================================
alter table public.transaksi_digital
  add column if not exists transaction_items jsonb not null default '[]'::jsonb,
  add column if not exists transaction_details jsonb not null default '{}'::jsonb;

create or replace function public.create_digital_transaction_atomic(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
  v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
  v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
  v_no_transaksi text := p_transaction->>'no_transaksi';
  v_jenis public.jenis_digital := (p_transaction->>'jenis')::public.jenis_digital;
  v_source_platform public.nama_platform := nullif(p_transaction->>'platform_sumber', '')::public.nama_platform;
  v_payment_method public.nama_platform := coalesce(nullif(p_transaction->>'payment_method', ''), 'cash')::public.nama_platform;
  v_harga_jual integer := coalesce((p_transaction->>'harga_jual')::numeric::integer, 0);
  v_modal integer := coalesce((p_transaction->>'modal')::numeric::integer, 0);
  v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
    raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
  end if;

  perform 1
  from public.shifts s
  where s.id = v_shift_id
    and s.cashier_id = v_kasir_id
    and s.status = 'active'::public.shift_status
  for update;

  if not found then
    raise exception 'Mulai shift dulu sebelum menyimpan transaksi layanan.';
  end if;

  insert into public.transaksi_digital (
    id,
    kasir_id,
    shift_id,
    no_transaksi,
    jenis,
    provider,
    nomor_tujuan,
    nama_tujuan,
    platform_sumber,
    payment_method,
    nominal,
    harga_jual,
    modal,
    catatan,
    transaction_items,
    transaction_details,
    created_at
  )
  values (
    v_transaction_id,
    v_kasir_id,
    v_shift_id,
    v_no_transaksi,
    v_jenis,
    p_transaction->>'provider',
    p_transaction->>'nomor_tujuan',
    p_transaction->>'nama_tujuan',
    v_source_platform,
    v_payment_method,
    coalesce((p_transaction->>'nominal')::numeric::integer, 0),
    v_harga_jual,
    v_modal,
    p_transaction->>'catatan',
    coalesce(p_transaction->'transaction_items', '[]'::jsonb),
    coalesce(p_transaction->'transaction_details', '{}'::jsonb),
    v_created_at
  );

  if v_source_platform is not null and v_modal > 0 then
    perform public.pos_insert_wallet_movement(
      v_kasir_id,
      v_source_platform,
      'keluar'::public.jenis_dompet_trx,
      v_modal,
      0,
      null,
      'Modal layanan ' || v_no_transaksi,
      'digital_modal',
      v_transaction_id,
      v_no_transaksi,
      v_created_at
    );
  end if;

  if v_payment_method::text not in ('cash', 'qris') and v_harga_jual > 0 then
    perform public.pos_insert_wallet_movement(
      v_kasir_id,
      v_payment_method,
      'masuk'::public.jenis_dompet_trx,
      v_harga_jual,
      0,
      null,
      'Pembayaran layanan ' || v_no_transaksi,
      'digital_sale',
      v_transaction_id,
      v_no_transaksi,
      v_created_at
    );
  end if;

  v_result := (
    select to_jsonb(digital_row)
    from public.transaksi_digital as digital_row
    where digital_row.id = v_transaction_id
  );

  return v_result;
end;
$$;

grant execute on function public.create_digital_transaction_atomic(jsonb) to authenticated;

-- ============================================================
-- 20260417_07_service_products_and_transaction_fields.sql
-- ============================================================
create table if not exists public.services_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (
    category in ('pulsa', 'kuota', 'voucher_game', 'token_listrik')
  ),
  provider text not null,
  cost integer not null default 0 check (cost >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category, provider, name)
);

alter table public.services_products enable row level security;

drop policy if exists "authenticated read service products" on public.services_products;
create policy "authenticated read service products"
on public.services_products
for select
to authenticated
using (active = true);

drop policy if exists "owner manage service products" on public.services_products;
create policy "owner manage service products"
on public.services_products
for all
to authenticated
using (public.current_user_role() = 'pemilik')
with check (public.current_user_role() = 'pemilik');

-- Product rows are intentionally not seeded here.
-- Service products must be managed dynamically from the app or Excel import.

alter table public.transaksi_digital
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
  customer_name = coalesce(customer_name, nama_tujuan);

create or replace function public.create_digital_transaction_atomic(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
  v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
  v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
  v_no_transaksi text := p_transaction->>'no_transaksi';
  v_jenis public.jenis_digital := (p_transaction->>'jenis')::public.jenis_digital;
  v_source_platform public.nama_platform := nullif(p_transaction->>'platform_sumber', '')::public.nama_platform;
  v_payment_method public.nama_platform := coalesce(nullif(p_transaction->>'payment_method', ''), 'cash')::public.nama_platform;
  v_harga_jual integer := coalesce(
    nullif(p_transaction->>'selling_price', '')::numeric::integer,
    nullif(p_transaction->>'harga_jual', '')::numeric::integer,
    0
  );
  v_modal integer := coalesce(
    nullif(p_transaction->>'cost', '')::numeric::integer,
    nullif(p_transaction->>'modal', '')::numeric::integer,
    0
  );
  v_profit integer := coalesce(
    nullif(p_transaction->>'profit', '')::numeric::integer,
    v_harga_jual - v_modal
  );
  v_target_number text := coalesce(
    nullif(p_transaction->>'target_number', ''),
    p_transaction->>'nomor_tujuan'
  );
  v_customer_name text := coalesce(
    nullif(p_transaction->>'customer_name', ''),
    p_transaction->>'nama_tujuan'
  );
  v_service_product_id uuid := nullif(p_transaction->>'service_product_id', '')::uuid;
  v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
    raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
  end if;

  perform 1
  from public.shifts s
  where s.id = v_shift_id
    and s.cashier_id = v_kasir_id
    and s.status = 'active'::public.shift_status
  for update;

  if not found then
    raise exception 'Mulai shift dulu sebelum menyimpan transaksi layanan.';
  end if;

  insert into public.transaksi_digital (
    id,
    kasir_id,
    shift_id,
    no_transaksi,
    jenis,
    provider,
    nomor_tujuan,
    nama_tujuan,
    platform_sumber,
    payment_method,
    nominal,
    harga_jual,
    modal,
    catatan,
    service_product_id,
    selling_price,
    cost,
    profit,
    target_number,
    customer_name,
    transaction_items,
    transaction_details,
    created_at
  )
  values (
    v_transaction_id,
    v_kasir_id,
    v_shift_id,
    v_no_transaksi,
    v_jenis,
    p_transaction->>'provider',
    v_target_number,
    v_customer_name,
    v_source_platform,
    v_payment_method,
    coalesce((p_transaction->>'nominal')::numeric::integer, 0),
    v_harga_jual,
    v_modal,
    p_transaction->>'catatan',
    v_service_product_id,
    v_harga_jual,
    v_modal,
    v_profit,
    v_target_number,
    v_customer_name,
    coalesce(p_transaction->'transaction_items', '[]'::jsonb),
    coalesce(p_transaction->'transaction_details', '{}'::jsonb),
    v_created_at
  );

  if v_source_platform is not null and v_modal > 0 then
    perform public.pos_insert_wallet_movement(
      v_kasir_id,
      v_source_platform,
      'keluar'::public.jenis_dompet_trx,
      v_modal,
      0,
      null,
      'Modal layanan ' || v_no_transaksi,
      'digital_modal',
      v_transaction_id,
      v_no_transaksi,
      v_created_at
    );
  end if;

  if v_payment_method::text not in ('cash', 'qris') and v_harga_jual > 0 then
    perform public.pos_insert_wallet_movement(
      v_kasir_id,
      v_payment_method,
      'masuk'::public.jenis_dompet_trx,
      v_harga_jual,
      0,
      null,
      'Pembayaran layanan ' || v_no_transaksi,
      'digital_sale',
      v_transaction_id,
      v_no_transaksi,
      v_created_at
    );
  end if;

  v_result := (
    select to_jsonb(digital_row)
    from public.transaksi_digital as digital_row
    where digital_row.id = v_transaction_id
  );

  return v_result;
end;
$$;

grant execute on function public.create_digital_transaction_atomic(jsonb) to authenticated;

-- ============================================================
-- 20260417_08_digital_wallet_payment_validation.sql
-- ============================================================
create or replace function public.create_digital_transaction_atomic(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
  v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
  v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
  v_no_transaksi text := p_transaction->>'no_transaksi';
  v_jenis public.jenis_digital := (p_transaction->>'jenis')::public.jenis_digital;
  v_source_platform public.nama_platform := nullif(p_transaction->>'platform_sumber', '')::public.nama_platform;
  v_payment_method public.nama_platform := coalesce(nullif(p_transaction->>'payment_method', ''), 'cash')::public.nama_platform;
  v_deduct_platform public.nama_platform := case
    when v_source_platform::text not in ('cash', 'qris', 'split') then v_source_platform
    when v_payment_method::text not in ('cash', 'qris', 'split') then v_payment_method
    else null
  end;
  v_harga_jual integer := coalesce(
    nullif(p_transaction->>'selling_price', '')::numeric::integer,
    nullif(p_transaction->>'harga_jual', '')::numeric::integer,
    0
  );
  v_modal integer := coalesce(
    nullif(p_transaction->>'cost', '')::numeric::integer,
    nullif(p_transaction->>'modal', '')::numeric::integer,
    0
  );
  v_profit integer := coalesce(
    nullif(p_transaction->>'profit', '')::numeric::integer,
    v_harga_jual - v_modal
  );
  v_target_number text := coalesce(
    nullif(p_transaction->>'target_number', ''),
    p_transaction->>'nomor_tujuan'
  );
  v_customer_name text := coalesce(
    nullif(p_transaction->>'customer_name', ''),
    p_transaction->>'nama_tujuan'
  );
  v_service_product_id uuid := nullif(p_transaction->>'service_product_id', '')::uuid;
  v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
  v_wallet_balance integer;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
    raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
  end if;

  perform 1
  from public.shifts s
  where s.id = v_shift_id
    and s.cashier_id = v_kasir_id
    and s.status = 'active'::public.shift_status
  for update;

  if not found then
    raise exception 'Mulai shift dulu sebelum menyimpan transaksi layanan.';
  end if;

  if v_deduct_platform is not null and v_modal > 0 then
    perform pg_advisory_xact_lock(hashtext('wallet:' || v_deduct_platform::text)::bigint);
    v_wallet_balance := public.pos_wallet_balance(v_deduct_platform);

    if v_wallet_balance < v_modal then
      raise exception
        'Saldo % tidak mencukupi',
        upper(replace(v_deduct_platform::text, '_', ' '));
    end if;
  end if;

  insert into public.transaksi_digital (
    id,
    kasir_id,
    shift_id,
    no_transaksi,
    jenis,
    provider,
    nomor_tujuan,
    nama_tujuan,
    platform_sumber,
    payment_method,
    nominal,
    harga_jual,
    modal,
    catatan,
    service_product_id,
    selling_price,
    cost,
    profit,
    target_number,
    customer_name,
    transaction_items,
    transaction_details,
    created_at
  )
  values (
    v_transaction_id,
    v_kasir_id,
    v_shift_id,
    v_no_transaksi,
    v_jenis,
    p_transaction->>'provider',
    v_target_number,
    v_customer_name,
    v_deduct_platform,
    v_payment_method,
    coalesce((p_transaction->>'nominal')::numeric::integer, 0),
    v_harga_jual,
    v_modal,
    p_transaction->>'catatan',
    v_service_product_id,
    v_harga_jual,
    v_modal,
    v_profit,
    v_target_number,
    v_customer_name,
    coalesce(p_transaction->'transaction_items', '[]'::jsonb),
    coalesce(p_transaction->'transaction_details', '{}'::jsonb),
    v_created_at
  );

  if v_deduct_platform is not null and v_modal > 0 then
    perform public.pos_insert_wallet_movement(
      v_kasir_id,
      v_deduct_platform,
      'keluar'::public.jenis_dompet_trx,
      v_modal,
      0,
      null,
      'Modal layanan ' || v_no_transaksi,
      'digital_modal',
      v_transaction_id,
      v_no_transaksi,
      v_created_at
    );
  end if;

  v_result := (
    select to_jsonb(digital_row)
    from public.transaksi_digital as digital_row
    where digital_row.id = v_transaction_id
  );

  return v_result;
end;
$$;

grant execute on function public.create_digital_transaction_atomic(jsonb) to authenticated;

-- ============================================================
-- 20260417_09_digital_services_complete.sql
-- ============================================================
-- 20260417_09_digital_services_complete.sql
-- Add default_price to services_products
-- Ensure snapshots in transaksi_digital

alter table public.services_products
  add column if not exists default_price integer check (default_price >= 0);

-- Update existing records with sample default_prices
update public.services_products
set default_price = greatest(cost * 1.05::numeric, cost + 1000)::integer
where default_price is null;

-- Ensure transaction snapshots (already mostly there, add indexes)
create index if not exists idx_transaksi_digital_service_product
  on public.transaksi_digital (service_product_id);

create index if not exists idx_transaksi_digital_created
  on public.transaksi_digital (created_at desc);

-- RLS for services_products (owner full, cashier read active only)
drop policy if exists "cashier read active service products" on public.services_products;
create policy "cashier read active service products"
  on public.services_products
  for select
  to authenticated
  using (
    public.current_user_role() = 'kasir' and active = true
    or public.current_user_role() = 'pemilik'
  );

-- Owner full access
drop policy if exists "owner manage service products" on public.services_products;
create policy "owner manage service products"
  on public.services_products
  for all
  to authenticated
  using (public.current_user_role() = 'pemilik')
  with check (public.current_user_role() = 'pemilik');

comment on column public.services_products.default_price
  is 'Harga default untuk prefill di kasir (opsional)';

-- Product rows are intentionally not seeded here.
-- Use the app form or Excel import so the catalog stays fully dynamic.

-- ============================================================
-- 20260418_01_digital_services_pasarkuota_deduction.sql
-- ============================================================
alter table public.services_products
    add column if not exists status text
    generated always as (
      case when active then 'active' else 'inactive' end
    ) stored;

  create or replace function public.create_digital_transaction_atomic(p_transaction jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_user_id uuid := auth.uid();
    v_role public.user_role := public.current_user_role();
    v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
    v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
    v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
    v_no_transaksi text := p_transaction->>'no_transaksi';
    v_jenis public.jenis_digital := (p_transaction->>'jenis')::public.jenis_digital;
    v_source_platform public.nama_platform := nullif(p_transaction->>'platform_sumber', '')::public.nama_platform;
    v_payment_method public.nama_platform := coalesce(nullif(p_transaction->>'payment_method', ''), 'cash')::public.nama_platform;
    v_deduct_platform public.nama_platform := case
      when v_source_platform::text = 'pasar_kuota' then v_source_platform
      when v_payment_method::text = 'pasar_kuota' then v_payment_method
      else null
    end;
    v_harga_jual integer := coalesce(
      nullif(p_transaction->>'selling_price', '')::numeric::integer,
      nullif(p_transaction->>'harga_jual', '')::numeric::integer,
      0
    );
    v_modal integer := coalesce(
      nullif(p_transaction->>'cost', '')::numeric::integer,
      nullif(p_transaction->>'modal', '')::numeric::integer,
      0
    );
    v_profit integer := coalesce(
      nullif(p_transaction->>'profit', '')::numeric::integer,
      v_harga_jual - v_modal
    );
    v_target_number text := coalesce(
      nullif(p_transaction->>'target_number', ''),
      p_transaction->>'nomor_tujuan'
    );
    v_customer_name text := coalesce(
      nullif(p_transaction->>'customer_name', ''),
      p_transaction->>'nama_tujuan'
    );
    v_service_product_id uuid := nullif(p_transaction->>'service_product_id', '')::uuid;
    v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
    v_wallet_balance integer;
    v_result jsonb;
  begin
    if v_user_id is null then
      raise exception 'User belum login.';
    end if;

    if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
      raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
    end if;

    perform 1
    from public.shifts s
    where s.id = v_shift_id
      and s.cashier_id = v_kasir_id
      and s.status = 'active'::public.shift_status
    for update;

    if not found then
      raise exception 'Mulai shift dulu sebelum menyimpan transaksi layanan.';
    end if;

    if v_deduct_platform is not null and v_modal > 0 then
      perform pg_advisory_xact_lock(hashtext('wallet:' || v_deduct_platform::text)::bigint);
      v_wallet_balance := public.pos_wallet_balance(v_deduct_platform);

      if v_wallet_balance < v_modal then
        raise exception 'Saldo PASAR KUOTA tidak mencukupi';
      end if;
    end if;

    insert into public.transaksi_digital (
      id,
      kasir_id,
      shift_id,
      no_transaksi,
      jenis,
      provider,
      nomor_tujuan,
      nama_tujuan,
      platform_sumber,
      payment_method,
      nominal,
      harga_jual,
      modal,
      catatan,
      service_product_id,
      selling_price,
      cost,
      profit,
      target_number,
      customer_name,
      transaction_items,
      transaction_details,
      created_at
    )
    values (
      v_transaction_id,
      v_kasir_id,
      v_shift_id,
      v_no_transaksi,
      v_jenis,
      p_transaction->>'provider',
      v_target_number,
      v_customer_name,
      v_deduct_platform,
      v_payment_method,
      coalesce((p_transaction->>'nominal')::numeric::integer, 0),
      v_harga_jual,
      v_modal,
      p_transaction->>'catatan',
      v_service_product_id,
      v_harga_jual,
      v_modal,
      v_profit,
      v_target_number,
      v_customer_name,
      coalesce(p_transaction->'transaction_items', '[]'::jsonb),
      coalesce(p_transaction->'transaction_details', '{}'::jsonb),
      v_created_at
    );

    if v_deduct_platform is not null and v_modal > 0 then
      perform public.pos_insert_wallet_movement(
        v_kasir_id,
        v_deduct_platform,
        'keluar'::public.jenis_dompet_trx,
        v_modal,
        0,
        null,
        'Modal layanan ' || v_no_transaksi,
        'digital_modal',
        v_transaction_id,
        v_no_transaksi,
        v_created_at
      );
    end if;

    v_result := (
      select to_jsonb(digital_row)
      from public.transaksi_digital as digital_row
      where digital_row.id = v_transaction_id
    );

    return v_result;
  end;
  $$;

  grant execute on function public.create_digital_transaction_atomic(jsonb) to authenticated;

-- ============================================================
-- 20260418_02_service_product_transaction_views.sql
-- ============================================================
drop view if exists public.service_transactions;
drop view if exists public.service_products;

alter table public.transaksi_digital
  add column if not exists payment_method public.nama_platform not null default 'cash';

create view public.service_products as
select
  id,
  name,
  category,
  provider,
  cost,
  default_price,
  case when active then 'active' else 'inactive' end as status,
  created_at
from public.services_products;

create view public.service_transactions as
select
  id,
  service_product_id as product_id,
  coalesce(transaction_items->0->>'product_name_snapshot', catatan, '') as product_name,
  jenis::text as category,
  provider,
  cost,
  selling_price,
  profit,
  target_number,
  customer_name,
  payment_method::text as payment_method,
  created_at
from public.transaksi_digital;

grant select on public.service_products to authenticated;
grant select on public.service_transactions to authenticated;

comment on view public.service_products is
  'Compatibility view for the digital service product schema; source table is services_products.';

comment on view public.service_transactions is
  'Compatibility view for digital service transaction reporting; source table is transaksi_digital.';

-- ============================================================
-- 20260418_03_shift_approve_with_correction.sql
-- ============================================================
alter type public.shift_status add value if not exists 'approved_with_correction';

do $$
begin
  if to_regclass('public.financial_logs') is null
     and to_regclass('public.finacial_logs') is not null then
    alter table public.finacial_logs rename to financial_logs;
  end if;
end $$;

create table if not exists public.financial_logs (
  id uuid primary key default gen_random_uuid(),
  kasir_id uuid references public.users(id),
  log_type text not null,
  direction text not null,
  amount integer not null,
  payment_method text,
  source_type text,
  source_id uuid,
  reference text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.financial_logs enable row level security;

alter table public.shifts
  add column if not exists approved_at timestamptz,
  add column if not exists correction_difference integer not null default 0,
  add column if not exists correction_type text not null default '';

do $$
begin
  alter table public.shifts
    drop constraint if exists shifts_correction_type_check;

  alter table public.shifts
    add constraint shifts_correction_type_check
    check (correction_type in ('', 'Kas Lebih', 'Kas Kurang'));
end $$;

alter table public.financial_logs
  drop constraint if exists finacial_logs_log_type_check,
  drop constraint if exists financial_logs_log_type_check;

alter table public.financial_logs
  add constraint financial_logs_log_type_check
  check (
    log_type in (
      'adjustment',
      'Kas Lebih',
      'Kas Kurang'
    )
  );

drop policy if exists "owner insert financial logs" on public.financial_logs;
create policy "owner insert financial logs"
on public.financial_logs
for insert
to authenticated
with check (public.current_user_role() = 'pemilik');

comment on column public.shifts.approved_at is
  'Timestamp saat owner menyetujui shift.';

comment on column public.shifts.correction_difference is
  'Nilai selisih kas yang disetujui owner saat approve with correction.';

comment on column public.shifts.correction_type is
  'Jenis koreksi kas: Kas Lebih atau Kas Kurang.';

create or replace function public.approve_shift_with_correction_atomic(
  p_shift_id uuid,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_shift public.shifts%rowtype;
  v_shift_found boolean := false;
  v_notes text := btrim(coalesce(p_notes, ''));
  v_difference integer;
  v_correction_type text;
  v_approved_at timestamptz := now();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role then
    raise exception 'Hanya owner yang bisa setujui shift dengan koreksi.';
  end if;

  if v_notes = '' then
    raise exception 'Catatan owner wajib diisi untuk setujui dengan koreksi.';
  end if;

  for v_shift in
    select *
    from public.shifts
    where id = p_shift_id
      and status in ('pending'::public.shift_status, 'flagged'::public.shift_status)
    for update
  loop
    v_shift_found := true;
    exit;
  end loop;

  if not v_shift_found then
    raise exception 'Shift tidak ditemukan atau belum siap disetujui.';
  end if;

  v_difference := coalesce((v_shift).difference, coalesce((v_shift).actual_cash, 0) - (v_shift).total_cash);

  if v_difference = 0 then
    raise exception 'Setujui dengan koreksi hanya untuk shift yang memiliki selisih.';
  end if;

  v_correction_type := case when v_difference > 0 then 'Kas Lebih' else 'Kas Kurang' end;

  update public.shifts
  set
    status = 'approved_with_correction'::public.shift_status,
    approved_by = v_user_id,
    approved_at = v_approved_at,
    approval_notes = v_notes,
    correction_difference = v_difference,
    correction_type = v_correction_type
  where id = p_shift_id;

  insert into public.financial_logs (
    kasir_id,
    log_type,
    direction,
    amount,
    payment_method,
    source_type,
    source_id,
    reference,
    notes,
    created_by,
    created_at
  )
  values (
    (v_shift).cashier_id,
    v_correction_type,
    case when v_difference > 0 then 'in' else 'out' end,
    abs(v_difference),
    'cash',
    'shift_correction',
    p_shift_id,
    'SHIFT-' || p_shift_id::text,
    v_notes,
    v_user_id,
    v_approved_at
  );

  v_result := (
    select to_jsonb(shift_row)
    from public.shifts as shift_row
    where shift_row.id = p_shift_id
  );
  return v_result;
end;
$$;

grant execute on function public.approve_shift_with_correction_atomic(uuid, text) to authenticated;

-- ============================================================
-- 20260418_04_service_product_service_type.sql
-- ============================================================
alter table public.services_products
  add column if not exists service_type text not null default '';

alter table public.transaksi_digital
  add column if not exists payment_method public.nama_platform not null default 'cash';

update public.services_products
set service_type = ''
where service_type is null;

alter table public.services_products
  drop constraint if exists services_products_category_provider_name_key;

alter table public.services_products
  drop constraint if exists services_products_category_provider_service_type_name_key;

alter table public.services_products
  add constraint services_products_category_provider_service_type_name_key
  unique (category, provider, service_type, name);

create index if not exists idx_services_products_type
  on public.services_products (category, provider, service_type, name);

drop view if exists public.service_transactions;
drop view if exists public.service_products;

create view public.service_products as
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
from public.services_products;

create view public.service_transactions as
select
  id,
  service_product_id as product_id,
  coalesce(transaction_items->0->>'product_name_snapshot', catatan, '') as product_name,
  jenis::text as category,
  provider,
  coalesce(transaction_items->0->>'service_type', '') as service_type,
  cost,
  selling_price,
  profit,
  target_number,
  customer_name,
  payment_method::text as payment_method,
  created_at
from public.transaksi_digital;

grant select on public.service_products to authenticated;
grant select on public.service_transactions to authenticated;

comment on column public.services_products.service_type is
  'Jenis layanan/paket untuk grouping produk kuota, contoh: COMBO MAX 28 HARI.';

-- ============================================================
-- 20260418_05_digital_services_flexible_pricing_wallet_deduction.sql
-- ============================================================
create or replace function public.create_digital_transaction_atomic(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
  v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
  v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
  v_no_transaksi text := p_transaction->>'no_transaksi';
  v_jenis public.jenis_digital := (p_transaction->>'jenis')::public.jenis_digital;
  v_source_platform public.nama_platform := nullif(p_transaction->>'platform_sumber', '')::public.nama_platform;
  v_payment_method public.nama_platform := coalesce(nullif(p_transaction->>'payment_method', ''), 'cash')::public.nama_platform;
  v_deduct_platform public.nama_platform := case
    when v_source_platform::text = 'pasar_kuota' then v_source_platform
    when v_payment_method::text = 'pasar_kuota' then v_payment_method
    else null
  end;
  v_harga_jual integer := coalesce(
    nullif(p_transaction->>'selling_price', '')::numeric::integer,
    nullif(p_transaction->>'harga_jual', '')::numeric::integer,
    0
  );
  v_modal integer := coalesce(
    nullif(p_transaction->>'cost', '')::numeric::integer,
    nullif(p_transaction->>'modal', '')::numeric::integer,
    0
  );
  v_profit integer := coalesce(
    nullif(p_transaction->>'profit', '')::numeric::integer,
    v_harga_jual - v_modal
  );
  v_wallet_deduction integer := case
    when v_deduct_platform::text = 'pasar_kuota' then v_harga_jual
    else v_modal
  end;
  v_target_number text := coalesce(
    nullif(p_transaction->>'target_number', ''),
    p_transaction->>'nomor_tujuan'
  );
  v_customer_name text := coalesce(
    nullif(p_transaction->>'customer_name', ''),
    p_transaction->>'nama_tujuan'
  );
  v_service_product_id uuid := nullif(p_transaction->>'service_product_id', '')::uuid;
  v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
  v_wallet_balance integer;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
    raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
  end if;

  perform 1
  from public.shifts s
  where s.id = v_shift_id
    and s.cashier_id = v_kasir_id
    and s.status = 'active'::public.shift_status
  for update;

  if not found then
    raise exception 'Mulai shift dulu sebelum menyimpan transaksi layanan.';
  end if;

  if v_deduct_platform is not null and v_wallet_deduction > 0 then
    perform pg_advisory_xact_lock(hashtext('wallet:' || v_deduct_platform::text)::bigint);
    v_wallet_balance := public.pos_wallet_balance(v_deduct_platform);

    if v_wallet_balance < v_wallet_deduction then
      raise exception 'Saldo PASAR KUOTA tidak mencukupi';
    end if;
  end if;

  insert into public.transaksi_digital (
    id,
    kasir_id,
    shift_id,
    no_transaksi,
    jenis,
    provider,
    nomor_tujuan,
    nama_tujuan,
    platform_sumber,
    payment_method,
    nominal,
    harga_jual,
    modal,
    catatan,
    service_product_id,
    selling_price,
    cost,
    profit,
    target_number,
    customer_name,
    transaction_items,
    transaction_details,
    created_at
  )
  values (
    v_transaction_id,
    v_kasir_id,
    v_shift_id,
    v_no_transaksi,
    v_jenis,
    p_transaction->>'provider',
    v_target_number,
    v_customer_name,
    v_deduct_platform,
    v_payment_method,
    coalesce((p_transaction->>'nominal')::numeric::integer, v_harga_jual),
    v_harga_jual,
    v_modal,
    p_transaction->>'catatan',
    v_service_product_id,
    v_harga_jual,
    v_modal,
    v_profit,
    v_target_number,
    v_customer_name,
    coalesce(p_transaction->'transaction_items', '[]'::jsonb),
    coalesce(p_transaction->'transaction_details', '{}'::jsonb),
    v_created_at
  );

  if v_deduct_platform is not null and v_wallet_deduction > 0 then
    perform public.pos_insert_wallet_movement(
      v_kasir_id,
      v_deduct_platform,
      'keluar'::public.jenis_dompet_trx,
      v_wallet_deduction,
      0,
      null,
      'Pembayaran layanan ' || v_no_transaksi,
      'digital_service_payment',
      v_transaction_id,
      v_no_transaksi,
      v_created_at
    );
  end if;

  v_result := (
    select to_jsonb(digital_row)
    from public.transaksi_digital as digital_row
    where digital_row.id = v_transaction_id
  );

  return v_result;
end;
$$;

grant execute on function public.create_digital_transaction_atomic(jsonb) to authenticated;

-- ============================================================
-- 20241002_shift_system.sql
-- ============================================================
-- 20241002_shift_system.sql
-- POS Raja Aksesoris: Opening & Closing Shift Management

create extension if not exists pgcrypto;

-- Enums
do $$
begin
  create type public.shift_status as enum ('active', 'pending_close', 'closed', 'approved', 'flagged');
exception
  when duplicate_object then null;
end $$;

-- Shifts table
CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id UUID NOT NULL REFERENCES public.users(id),
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  opening_cash INTEGER DEFAULT 0 CHECK (opening_cash >= 0),
  total_transactions INTEGER DEFAULT 0 CHECK (total_transactions >= 0),
  total_cash INTEGER DEFAULT 0 CHECK (total_cash >= 0),
  total_digital INTEGER DEFAULT 0 CHECK (total_digital >= 0),
  total_items INTEGER DEFAULT 0 CHECK (total_items >= 0),
  expected_cash INTEGER GENERATED ALWAYS AS (total_cash) STORED,
  actual_cash INTEGER CHECK (actual_cash >= 0),
  difference INTEGER GENERATED ALWAYS AS (
    COALESCE(actual_cash, 0) - total_cash
  ) STORED,
  notes TEXT,
  status public.shift_status NOT NULL DEFAULT 'active',
  approved_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_shift_per_cashier ON public.shifts(cashier_id)
WHERE status = 'active'::public.shift_status;
CREATE INDEX IF NOT EXISTS idx_shift_cashier_time ON public.shifts(cashier_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_shift_status ON public.shifts(status);

-- RLS Policies
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- Cashier can manage own shifts
DROP POLICY IF EXISTS "cashier_manage_own_shifts" ON public.shifts;
CREATE POLICY "cashier_manage_own_shifts" ON public.shifts
FOR ALL TO authenticated
USING (cashier_id = auth.uid())
WITH CHECK (cashier_id = auth.uid());

-- Owner can manage all shifts
DROP POLICY IF EXISTS "owner_manage_all_shifts" ON public.shifts;
CREATE POLICY "owner_manage_all_shifts" ON public.shifts
FOR ALL TO authenticated
USING (public.current_user_role() = 'pemilik')
WITH CHECK (public.current_user_role() = 'pemilik');

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_shifts_updated_at ON public.shifts;
CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON public.shifts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View: Current shift per cashier
CREATE OR REPLACE VIEW public.current_shifts
WITH (security_invoker = true)
AS
SELECT cashier_id, id, start_time, status 
FROM public.shifts 
WHERE status = 'active'::public.shift_status;

-- Function: Get current shift ID for cashier
CREATE OR REPLACE FUNCTION public.get_current_shift_id(cashier_uuid UUID)
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT id FROM public.current_shifts WHERE cashier_id = cashier_uuid);
END;
$$ LANGUAGE plpgsql STABLE;

-- Ensure only one active shift per cashier (constraint)
CREATE OR REPLACE FUNCTION public.check_single_active_shift()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.shifts 
    WHERE cashier_id = NEW.cashier_id 
    AND status = 'active'::public.shift_status
    AND id != NEW.id
  ) THEN
    RAISE EXCEPTION 'Cashier sudah memiliki shift aktif. Tutup shift lama terlebih dahulu.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_single_active_shift ON public.shifts;
CREATE TRIGGER trg_single_active_shift
BEFORE INSERT OR UPDATE OF status ON public.shifts
FOR EACH ROW WHEN (NEW.status = 'active'::public.shift_status)
EXECUTE FUNCTION public.check_single_active_shift();

-- Link transactions to current shift (view)
DROP VIEW IF EXISTS public.shift_reports;
DROP VIEW IF EXISTS public.shift_transactions;
CREATE OR REPLACE VIEW public.shift_transactions
WITH (security_invoker = true)
AS
SELECT 
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
FROM public.shifts s
JOIN public.transaksi t ON t.created_at >= s.start_time AND t.created_at < COALESCE(s.end_time, now())
WHERE s.status = 'active'::public.shift_status;

-- Shift report view
DROP VIEW IF EXISTS public.shift_reports;
CREATE OR REPLACE VIEW public.shift_reports
WITH (security_invoker = true)
AS
SELECT 
  s.*,
  COUNT(t.id)::INTEGER as system_transactions,
  SUM(CASE WHEN t.metode_bayar = 'cash' OR t.metode_bayar = 'tunai' THEN t.total_bayar ELSE 0 END)::INTEGER as system_cash_total,
  SUM(CASE WHEN t.metode_bayar != 'cash' AND t.metode_bayar != 'tunai' THEN t.total_bayar ELSE 0 END)::INTEGER as system_digital,
  SUM(
    COALESCE(it.qty, 0)
  )::INTEGER as system_items
FROM public.shifts s
LEFT JOIN public.shift_transactions t ON t.shift_id = s.id
LEFT JOIN public.item_transaksi it ON it.transaksi_id = t.id
GROUP BY s.id
ORDER BY s.start_time DESC;

COMMENT ON TABLE public.shifts IS 'Shift management untuk kasir dengan opening cash 0 otomatis, time restrictions, dan owner approval';

-- ============================================================
-- 20260418_06_security_lockdown_views.sql
-- ============================================================
-- 20260418_06_security_lockdown_views.sql
-- Lock down tables/views that Supabase marks as UNRESTRICTED.

alter table public.services_products enable row level security;
alter table public.shifts enable row level security;
alter table public.transaksi enable row level security;
alter table public.transaksi_digital enable row level security;
alter table public.item_transaksi enable row level security;

alter table public.services_products
  add column if not exists default_price integer check (default_price >= 0),
  add column if not exists service_type text not null default '';

alter table public.transaksi_digital
  add column if not exists payment_method public.nama_platform not null default 'cash';

drop policy if exists "authenticated read service products" on public.services_products;
drop policy if exists "cashier read active service products" on public.services_products;
create policy "cashier read active service products"
on public.services_products
for select
to authenticated
using (
  (public.current_user_role() = 'kasir' and active = true)
  or public.current_user_role() = 'pemilik'
);

drop policy if exists "owner manage service products" on public.services_products;
create policy "owner manage service products"
on public.services_products
for all
to authenticated
using (public.current_user_role() = 'pemilik')
with check (public.current_user_role() = 'pemilik');

drop view if exists public.shift_reports;
drop view if exists public.shift_transactions;
drop view if exists public.service_transactions;
drop view if exists public.service_products;

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
from public.services_products;

create view public.service_transactions
with (security_invoker = true)
as
select
  id,
  service_product_id as product_id,
  coalesce(transaction_items->0->>'product_name_snapshot', catatan, '') as product_name,
  jenis::text as category,
  provider,
  coalesce(transaction_items->0->>'service_type', '') as service_type,
  cost,
  selling_price,
  profit,
  target_number,
  customer_name,
  payment_method::text as payment_method,
  created_at
from public.transaksi_digital;

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
where s.status = 'active'::public.shift_status;

create view public.shift_reports
with (security_invoker = true)
as
select
  s.*,
  count(t.id)::integer as system_transactions,
  sum(
    case
      when t.metode_bayar = 'cash' or t.metode_bayar = 'tunai'
        then t.total_bayar
      else 0
    end
  )::integer as system_cash,
  sum(
    case
      when t.metode_bayar != 'cash' and t.metode_bayar != 'tunai'
        then t.total_bayar
      else 0
    end
  )::integer as system_digital,
  sum(coalesce(it.qty, 0))::integer as system_items
from public.shifts s
left join public.shift_transactions t on t.shift_id = s.id
left join public.item_transaksi it on it.transaksi_id = t.id
group by s.id
order by s.start_time desc;

revoke all on public.service_products from anon, public;
revoke all on public.service_transactions from anon, public;
revoke all on public.shift_transactions from anon, public;
revoke all on public.shift_reports from anon, public;

grant select on public.service_products to authenticated;
grant select on public.service_transactions to authenticated;
grant select on public.shift_transactions to authenticated;
grant select on public.shift_reports to authenticated;

comment on view public.service_products is
  'Security invoker compatibility view; source table is services_products.';

comment on view public.service_transactions is
  'Security invoker compatibility view; source table is transaksi_digital.';

comment on view public.shift_transactions is
  'Security invoker shift transaction view; follows RLS on shifts and transaksi.';

comment on view public.shift_reports is
  'Security invoker shift report view; follows RLS on shifts, transaksi, and item_transaksi.';

-- ============================================================
-- 20260418_07_shift_rls_fix.sql
-- ============================================================
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

-- ============================================================
-- 20260418_08_runtime_schema_repair.sql
-- ============================================================
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

-- ============================================================
-- 20260418_09_digital_payment_source_fix.sql
-- ============================================================
-- 20260418_09_digital_payment_source_fix.sql
-- Restore bank/e-wallet service categories and record cashier payment source for digital services.

alter type public.jenis_digital add value if not exists 'transfer_bank';
alter type public.jenis_digital add value if not exists 'transfer_ewallet';

alter type public.nama_platform add value if not exists 'cash';
alter type public.nama_platform add value if not exists 'qris';
alter type public.nama_platform add value if not exists 'dana';
alter type public.nama_platform add value if not exists 'bank_mas';
alter type public.nama_platform add value if not exists 'wahana';
alter type public.nama_platform add value if not exists 'pasar_kuota';
alter type public.nama_platform add value if not exists 'shopee';
alter type public.nama_platform add value if not exists 'bca';
alter type public.nama_platform add value if not exists 'split';

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

create or replace function public.create_digital_transaction_atomic(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
  v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
  v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
  v_no_transaksi text := p_transaction->>'no_transaksi';
  v_jenis public.jenis_digital := (p_transaction->>'jenis')::public.jenis_digital;
  v_raw_source_platform text := nullif(p_transaction->>'platform_sumber', '');
  v_raw_payment_method text := coalesce(nullif(p_transaction->>'payment_method', ''), 'cash');
  v_source_platform public.nama_platform;
  v_payment_method public.nama_platform;
  v_record_platform public.nama_platform;
  v_deduct_platform public.nama_platform;
  v_harga_jual integer := coalesce(
    nullif(p_transaction->>'selling_price', '')::numeric::integer,
    nullif(p_transaction->>'harga_jual', '')::numeric::integer,
    0
  );
  v_modal integer := coalesce(
    nullif(p_transaction->>'cost', '')::numeric::integer,
    nullif(p_transaction->>'modal', '')::numeric::integer,
    0
  );
  v_profit integer := coalesce(
    nullif(p_transaction->>'profit', '')::numeric::integer,
    v_harga_jual - v_modal
  );
  v_wallet_deduction integer;
  v_target_number text := coalesce(
    nullif(p_transaction->>'target_number', ''),
    p_transaction->>'nomor_tujuan'
  );
  v_customer_name text := coalesce(
    nullif(p_transaction->>'customer_name', ''),
    p_transaction->>'nama_tujuan'
  );
  v_service_product_id uuid := nullif(p_transaction->>'service_product_id', '')::uuid;
  v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
  v_wallet_balance integer;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
    raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
  end if;

  v_payment_method := case
    when v_raw_payment_method in ('transfer_bank', 'bank_transfer') then 'bca'::public.nama_platform
    when v_raw_payment_method in ('ewallet', 'transfer_ewallet') then 'dana'::public.nama_platform
    else v_raw_payment_method::public.nama_platform
  end;

  v_source_platform := case
    when v_raw_source_platform is null then null
    when v_raw_source_platform in ('transfer_bank', 'bank_transfer') then 'bca'::public.nama_platform
    when v_raw_source_platform in ('ewallet', 'transfer_ewallet') then 'dana'::public.nama_platform
    else v_raw_source_platform::public.nama_platform
  end;

  v_record_platform := coalesce(v_source_platform, v_payment_method);

  v_deduct_platform := case
    when v_record_platform::text not in ('cash', 'qris', 'split') then v_record_platform
    else null
  end;

  v_wallet_deduction := case
    when v_deduct_platform::text = 'pasar_kuota' then v_harga_jual
    else v_modal
  end;

  perform 1
  from public.shifts s
  where s.id = v_shift_id
    and s.cashier_id = v_kasir_id
    and s.status = 'active'::public.shift_status
  for update;

  if not found then
    raise exception 'Mulai shift dulu sebelum menyimpan transaksi layanan.';
  end if;

  if v_deduct_platform is not null and v_wallet_deduction > 0 then
    perform pg_advisory_xact_lock(hashtext('wallet:' || v_deduct_platform::text)::bigint);
    v_wallet_balance := public.pos_wallet_balance(v_deduct_platform);

    if v_wallet_balance < v_wallet_deduction then
      raise exception
        'Saldo % tidak mencukupi',
        upper(replace(v_deduct_platform::text, '_', ' '));
    end if;
  end if;

  insert into public.transaksi_digital (
    id,
    kasir_id,
    shift_id,
    no_transaksi,
    jenis,
    provider,
    nomor_tujuan,
    nama_tujuan,
    platform_sumber,
    payment_method,
    nominal,
    harga_jual,
    modal,
    catatan,
    service_product_id,
    selling_price,
    cost,
    profit,
    target_number,
    customer_name,
    transaction_items,
    transaction_details,
    created_at
  )
  values (
    v_transaction_id,
    v_kasir_id,
    v_shift_id,
    v_no_transaksi,
    v_jenis,
    p_transaction->>'provider',
    v_target_number,
    v_customer_name,
    v_record_platform,
    v_payment_method,
    coalesce((p_transaction->>'nominal')::numeric::integer, v_harga_jual),
    v_harga_jual,
    v_modal,
    p_transaction->>'catatan',
    v_service_product_id,
    v_harga_jual,
    v_modal,
    v_profit,
    v_target_number,
    v_customer_name,
    coalesce(p_transaction->'transaction_items', '[]'::jsonb),
    coalesce(p_transaction->'transaction_details', '{}'::jsonb),
    v_created_at
  );

  if v_deduct_platform is not null and v_wallet_deduction > 0 then
    perform public.pos_insert_wallet_movement(
      v_kasir_id,
      v_deduct_platform,
      'keluar'::public.jenis_dompet_trx,
      v_wallet_deduction,
      0,
      null,
      case
        when v_deduct_platform::text = 'pasar_kuota'
          then 'Pembayaran layanan PASAR KUOTA ' || v_no_transaksi
        else 'Modal layanan ' || upper(replace(v_deduct_platform::text, '_', ' ')) || ' ' || v_no_transaksi
      end,
      'digital_service_payment',
      v_transaction_id,
      v_no_transaksi,
      v_created_at
    );
  end if;

  v_result := (
    select to_jsonb(digital_row)
    from public.transaksi_digital as digital_row
    where digital_row.id = v_transaction_id
  );

  return v_result;
end;
$$;

grant execute on function public.create_digital_transaction_atomic(jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- 20260418_10_digital_customer_payment_split.sql
-- ============================================================
-- 20260418_10_digital_customer_payment_split.sql
-- Digital service transaction split:
-- - platform_sumber = saldo aplikasi pihak ketiga yang dipotong, default PASAR KUOTA
-- - payment_method = metode bayar customer ke toko

alter type public.jenis_digital add value if not exists 'transfer_bank';
alter type public.jenis_digital add value if not exists 'transfer_ewallet';

alter type public.nama_platform add value if not exists 'cash';
alter type public.nama_platform add value if not exists 'qris';
alter type public.nama_platform add value if not exists 'dana';
alter type public.nama_platform add value if not exists 'bank_mas';
alter type public.nama_platform add value if not exists 'wahana';
alter type public.nama_platform add value if not exists 'pasar_kuota';
alter type public.nama_platform add value if not exists 'shopee';
alter type public.nama_platform add value if not exists 'bca';
alter type public.nama_platform add value if not exists 'split';

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

alter table public.transaksi_digital
  add column if not exists platform_sumber public.nama_platform,
  add column if not exists payment_method public.nama_platform not null default 'cash',
  add column if not exists transaction_details jsonb not null default '{}'::jsonb;

create or replace function public.create_digital_transaction_atomic(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
  v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
  v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
  v_no_transaksi text := p_transaction->>'no_transaksi';
  v_jenis public.jenis_digital := (p_transaction->>'jenis')::public.jenis_digital;
  v_raw_source_platform text := coalesce(nullif(p_transaction->>'platform_sumber', ''), 'pasar_kuota');
  v_raw_payment_method text := coalesce(nullif(p_transaction->>'payment_method', ''), 'cash');
  v_source_platform public.nama_platform;
  v_customer_payment_method public.nama_platform;
  v_deduct_platform public.nama_platform;
  v_harga_jual integer := coalesce(
    nullif(p_transaction->>'selling_price', '')::numeric::integer,
    nullif(p_transaction->>'harga_jual', '')::numeric::integer,
    0
  );
  v_modal integer := coalesce(
    nullif(p_transaction->>'cost', '')::numeric::integer,
    nullif(p_transaction->>'modal', '')::numeric::integer,
    0
  );
  v_profit integer := coalesce(
    nullif(p_transaction->>'profit', '')::numeric::integer,
    v_harga_jual - v_modal
  );
  v_wallet_deduction integer;
  v_target_number text := coalesce(
    nullif(p_transaction->>'target_number', ''),
    p_transaction->>'nomor_tujuan'
  );
  v_customer_name text := coalesce(
    nullif(p_transaction->>'customer_name', ''),
    p_transaction->>'nama_tujuan'
  );
  v_service_product_id uuid := nullif(p_transaction->>'service_product_id', '')::uuid;
  v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
  v_wallet_balance integer;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
    raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
  end if;

  v_source_platform := case
    when v_raw_source_platform in ('transfer_bank', 'bank_transfer') then 'bca'::public.nama_platform
    when v_raw_source_platform in ('ewallet', 'transfer_ewallet') then 'dana'::public.nama_platform
    else v_raw_source_platform::public.nama_platform
  end;

  v_customer_payment_method := case
    when v_raw_payment_method in ('transfer_bank', 'bank_transfer') then 'bca'::public.nama_platform
    when v_raw_payment_method in ('ewallet', 'transfer_ewallet') then 'dana'::public.nama_platform
    else v_raw_payment_method::public.nama_platform
  end;

  v_deduct_platform := case
    when v_source_platform::text not in ('cash', 'qris', 'split') then v_source_platform
    else null
  end;

  v_wallet_deduction := case
    when v_deduct_platform::text = 'pasar_kuota' then v_harga_jual
    else v_modal
  end;

  perform 1
  from public.shifts s
  where s.id = v_shift_id
    and s.cashier_id = v_kasir_id
    and s.status = 'active'::public.shift_status
  for update;

  if not found then
    raise exception 'Mulai shift dulu sebelum menyimpan transaksi layanan.';
  end if;

  if v_deduct_platform is not null and v_wallet_deduction > 0 then
    perform pg_advisory_xact_lock(hashtext('wallet:' || v_deduct_platform::text)::bigint);
    v_wallet_balance := public.pos_wallet_balance(v_deduct_platform);

    if v_wallet_balance < v_wallet_deduction then
      raise exception
        'Saldo % tidak mencukupi',
        upper(replace(v_deduct_platform::text, '_', ' '));
    end if;
  end if;

  insert into public.transaksi_digital (
    id,
    kasir_id,
    shift_id,
    no_transaksi,
    jenis,
    provider,
    nomor_tujuan,
    nama_tujuan,
    platform_sumber,
    payment_method,
    nominal,
    harga_jual,
    modal,
    catatan,
    service_product_id,
    selling_price,
    cost,
    profit,
    target_number,
    customer_name,
    transaction_items,
    transaction_details,
    created_at
  )
  values (
    v_transaction_id,
    v_kasir_id,
    v_shift_id,
    v_no_transaksi,
    v_jenis,
    p_transaction->>'provider',
    v_target_number,
    v_customer_name,
    v_source_platform,
    v_customer_payment_method,
    coalesce((p_transaction->>'nominal')::numeric::integer, v_harga_jual),
    v_harga_jual,
    v_modal,
    p_transaction->>'catatan',
    v_service_product_id,
    v_harga_jual,
    v_modal,
    v_profit,
    v_target_number,
    v_customer_name,
    coalesce(p_transaction->'transaction_items', '[]'::jsonb),
    coalesce(p_transaction->'transaction_details', '{}'::jsonb)
      || jsonb_build_object(
        'source_platform', v_source_platform::text,
        'customer_payment_method', v_customer_payment_method::text
      ),
    v_created_at
  );

  if v_deduct_platform is not null and v_wallet_deduction > 0 then
    perform public.pos_insert_wallet_movement(
      v_kasir_id,
      v_deduct_platform,
      'keluar'::public.jenis_dompet_trx,
      v_wallet_deduction,
      0,
      null,
      case
        when v_deduct_platform::text = 'pasar_kuota'
          then 'Pembayaran layanan PASAR KUOTA ' || v_no_transaksi
        else 'Modal layanan ' || upper(replace(v_deduct_platform::text, '_', ' ')) || ' ' || v_no_transaksi
      end,
      'digital_service_payment',
      v_transaction_id,
      v_no_transaksi,
      v_created_at
    );
  end if;

  v_result := (
    select to_jsonb(digital_row)
    from public.transaksi_digital as digital_row
    where digital_row.id = v_transaction_id
  );

  return v_result;
end;
$$;

grant execute on function public.create_digital_transaction_atomic(jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- 20260418_11_transfer_manual_transactions.sql
-- ============================================================
-- 20260418_11_transfer_manual_transactions.sql
-- Manual Transfer Bank / E-Wallet transaction flow.
-- Transfer is not product-based: no service_product_id is required.

alter type public.jenis_digital add value if not exists 'transfer_bank';
alter type public.jenis_digital add value if not exists 'transfer_ewallet';

alter type public.nama_platform add value if not exists 'gopay';
alter type public.nama_platform add value if not exists 'ovo';
alter type public.nama_platform add value if not exists 'mandiri';
alter type public.nama_platform add value if not exists 'bri';
alter type public.nama_platform add value if not exists 'bni';

alter table public.transaksi_digital
  add column if not exists transfer_platform text,
  add column if not exists admin_fee integer not null default 0 check (admin_fee >= 0),
  add column if not exists total integer not null default 0 check (total >= 0),
  add column if not exists receiver_name text;

do $$
declare
  constraint_record record;
begin
  if to_regclass('public.services_products') is null then
    return;
  end if;

  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.services_products'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table public.services_products drop constraint %I', constraint_record.conname);
  end loop;

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
end $$;

create or replace function public.create_digital_transaction_atomic(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
  v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
  v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
  v_no_transaksi text := p_transaction->>'no_transaksi';
  v_jenis public.jenis_digital := (p_transaction->>'jenis')::public.jenis_digital;
  v_is_manual_transfer boolean := (p_transaction->>'jenis') in ('transfer_bank', 'transfer_ewallet');
  v_raw_source_platform text := nullif(p_transaction->>'platform_sumber', '');
  v_raw_payment_method text := coalesce(nullif(p_transaction->>'payment_method', ''), 'cash');
  v_source_platform public.nama_platform;
  v_customer_payment_method public.nama_platform;
  v_deduct_platform public.nama_platform;
  v_nominal integer := coalesce(nullif(p_transaction->>'nominal', '')::numeric::integer, 0);
  v_admin_fee integer := coalesce(
    nullif(p_transaction->>'admin_fee', '')::numeric::integer,
    nullif(p_transaction->>'biaya_admin', '')::numeric::integer,
    0
  );
  v_total integer := coalesce(
    nullif(p_transaction->>'total', '')::numeric::integer,
    v_nominal + v_admin_fee
  );
  v_harga_jual integer := coalesce(
    nullif(p_transaction->>'selling_price', '')::numeric::integer,
    nullif(p_transaction->>'harga_jual', '')::numeric::integer,
    case when v_is_manual_transfer then v_total else 0 end
  );
  v_modal integer := coalesce(
    nullif(p_transaction->>'cost', '')::numeric::integer,
    nullif(p_transaction->>'modal', '')::numeric::integer,
    case when v_is_manual_transfer then v_total else 0 end
  );
  v_profit integer := coalesce(
    nullif(p_transaction->>'profit', '')::numeric::integer,
    v_harga_jual - v_modal
  );
  v_wallet_deduction integer;
  v_transfer_platform text := coalesce(
    nullif(p_transaction->>'transfer_platform', ''),
    nullif(p_transaction->>'platform', ''),
    p_transaction->>'provider'
  );
  v_target_number text := coalesce(
    nullif(p_transaction->>'target_number', ''),
    p_transaction->>'nomor_tujuan'
  );
  v_receiver_name text := coalesce(
    nullif(p_transaction->>'receiver_name', ''),
    nullif(p_transaction->>'customer_name', ''),
    p_transaction->>'nama_tujuan'
  );
  v_service_product_id uuid := nullif(p_transaction->>'service_product_id', '')::uuid;
  v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
  v_wallet_balance integer;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
    raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
  end if;

  if v_is_manual_transfer then
    if coalesce(v_transfer_platform, '') = '' then
      raise exception 'Platform transfer wajib dipilih.';
    end if;

    if v_nominal <= 0 then
      raise exception 'Nominal transfer wajib lebih besar dari 0.';
    end if;

    if v_admin_fee < 0 then
      raise exception 'Biaya admin tidak boleh negatif.';
    end if;

    if coalesce(v_target_number, '') = '' then
      raise exception 'Nomor tujuan wajib diisi.';
    end if;
  end if;

  if v_harga_jual <= 0 then
    raise exception 'Harga jual wajib lebih besar dari 0.';
  end if;

  v_customer_payment_method := case
    when v_raw_payment_method in ('transfer_bank', 'bank_transfer') then 'bca'::public.nama_platform
    when v_raw_payment_method in ('ewallet', 'transfer_ewallet') then 'dana'::public.nama_platform
    else v_raw_payment_method::public.nama_platform
  end;

  v_source_platform := case
    when v_raw_source_platform is not null and v_raw_source_platform in ('transfer_bank', 'bank_transfer')
      then 'bca'::public.nama_platform
    when v_raw_source_platform is not null and v_raw_source_platform in ('ewallet', 'transfer_ewallet')
      then 'dana'::public.nama_platform
    when v_raw_source_platform is not null
      then v_raw_source_platform::public.nama_platform
    when v_is_manual_transfer and v_customer_payment_method::text = 'pasar_kuota'
      then 'pasar_kuota'::public.nama_platform
    when v_is_manual_transfer
      then 'cash'::public.nama_platform
    else 'pasar_kuota'::public.nama_platform
  end;

  v_deduct_platform := case
    when v_is_manual_transfer and v_customer_payment_method::text = 'pasar_kuota'
      then 'pasar_kuota'::public.nama_platform
    when not v_is_manual_transfer and v_source_platform::text not in ('cash', 'qris', 'split')
      then v_source_platform
    else null
  end;

  v_wallet_deduction := case
    when v_deduct_platform::text = 'pasar_kuota' then v_harga_jual
    else v_modal
  end;

  perform 1
  from public.shifts s
  where s.id = v_shift_id
    and s.cashier_id = v_kasir_id
    and s.status = 'active'::public.shift_status
  for update;

  if not found then
    raise exception 'Mulai shift dulu sebelum menyimpan transaksi layanan.';
  end if;

  if v_deduct_platform is not null and v_wallet_deduction > 0 then
    perform pg_advisory_xact_lock(hashtext('wallet:' || v_deduct_platform::text)::bigint);
    v_wallet_balance := public.pos_wallet_balance(v_deduct_platform);

    if v_wallet_balance < v_wallet_deduction then
      raise exception
        'Saldo % tidak mencukupi',
        upper(replace(v_deduct_platform::text, '_', ' '));
    end if;
  end if;

  insert into public.transaksi_digital (
    id,
    kasir_id,
    shift_id,
    no_transaksi,
    jenis,
    provider,
    nomor_tujuan,
    nama_tujuan,
    platform_sumber,
    payment_method,
    nominal,
    harga_jual,
    modal,
    catatan,
    service_product_id,
    selling_price,
    cost,
    profit,
    target_number,
    customer_name,
    transfer_platform,
    admin_fee,
    total,
    receiver_name,
    transaction_items,
    transaction_details,
    created_at
  )
  values (
    v_transaction_id,
    v_kasir_id,
    v_shift_id,
    v_no_transaksi,
    v_jenis,
    coalesce(nullif(p_transaction->>'provider', ''), v_transfer_platform),
    v_target_number,
    v_receiver_name,
    v_source_platform,
    v_customer_payment_method,
    v_nominal,
    v_harga_jual,
    v_modal,
    p_transaction->>'catatan',
    v_service_product_id,
    v_harga_jual,
    v_modal,
    v_profit,
    v_target_number,
    v_receiver_name,
    v_transfer_platform,
    v_admin_fee,
    v_total,
    v_receiver_name,
    coalesce(p_transaction->'transaction_items', '[]'::jsonb),
    coalesce(p_transaction->'transaction_details', '{}'::jsonb)
      || jsonb_build_object(
        'mode', case when v_is_manual_transfer then 'manual_transfer' else 'product_service' end,
        'platform', v_transfer_platform,
        'nominal', v_nominal,
        'admin_fee', v_admin_fee,
        'total', v_total,
        'selling_price', v_harga_jual,
        'cost', v_modal,
        'profit', v_profit,
        'target_number', v_target_number,
        'receiver_name', v_receiver_name,
        'payment_method', v_customer_payment_method::text,
        'source_platform', v_source_platform::text
      ),
    v_created_at
  );

  if v_deduct_platform is not null and v_wallet_deduction > 0 then
    perform public.pos_insert_wallet_movement(
      v_kasir_id,
      v_deduct_platform,
      'keluar'::public.jenis_dompet_trx,
      v_wallet_deduction,
      0,
      null,
      case
        when v_is_manual_transfer
          then 'Transfer manual ' || coalesce(v_transfer_platform, '') || ' ' || v_no_transaksi
        when v_deduct_platform::text = 'pasar_kuota'
          then 'Pembayaran layanan PASAR KUOTA ' || v_no_transaksi
        else 'Modal layanan ' || upper(replace(v_deduct_platform::text, '_', ' ')) || ' ' || v_no_transaksi
      end,
      case when v_is_manual_transfer then 'manual_transfer_payment' else 'digital_service_payment' end,
      v_transaction_id,
      v_no_transaksi,
      v_created_at
    );
  end if;

  v_result := (
    select to_jsonb(digital_row)
    from public.transaksi_digital as digital_row
    where digital_row.id = v_transaction_id
  );

  return v_result;
end;
$$;

grant execute on function public.create_digital_transaction_atomic(jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- 20260419_01_fix_financial_logs_typo.sql
-- ============================================================
-- 20260419_01_fix_financial_logs_typo.sql
-- Repair databases where financial_logs was accidentally created as finacial_logs.

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.financial_logs') is null
     and to_regclass('public.finacial_logs') is not null then
    alter table public.finacial_logs rename to financial_logs;
  elsif to_regclass('public.financial_logs') is not null
     and to_regclass('public.finacial_logs') is not null then
    insert into public.financial_logs (
      id,
      kasir_id,
      log_type,
      direction,
      amount,
      payment_method,
      source_type,
      source_id,
      reference,
      notes,
      created_by,
      created_at
    )
    select
      typo.id,
      typo.kasir_id,
      coalesce(typo.log_type, 'adjustment'),
      coalesce(typo.direction, 'neutral'),
      coalesce(typo.amount, 0),
      typo.payment_method,
      typo.source_type,
      typo.source_id,
      typo.reference,
      typo.notes,
      typo.created_by,
      coalesce(typo.created_at, now())
    from public.finacial_logs typo
    where not exists (
      select 1
      from public.financial_logs existing
      where existing.id = typo.id
    );

    drop table public.finacial_logs;
  end if;
end $$;

create table if not exists public.financial_logs (
  id uuid primary key default gen_random_uuid(),
  kasir_id uuid references public.users(id),
  log_type text not null,
  direction text not null,
  amount integer not null,
  payment_method text,
  source_type text,
  source_id uuid,
  reference text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.financial_logs
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists kasir_id uuid references public.users(id),
  add column if not exists log_type text,
  add column if not exists direction text,
  add column if not exists amount integer,
  add column if not exists payment_method text,
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists reference text,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists created_at timestamptz default now();

update public.financial_logs
set
  id = coalesce(id, gen_random_uuid()),
  log_type = coalesce(log_type, 'adjustment'),
  direction = coalesce(direction, 'neutral'),
  amount = coalesce(amount, 0),
  created_at = coalesce(created_at, now());

update public.financial_logs
set log_type = 'adjustment'
where log_type not in (
  'adjustment',
  'cash_over',
  'cash_short',
  'Kas Lebih',
  'Kas Kurang'
);

update public.financial_logs
set direction = 'neutral'
where direction not in ('in', 'out', 'neutral');

update public.financial_logs
set amount = 0
where amount < 0;

alter table public.financial_logs
  alter column id set default gen_random_uuid(),
  alter column log_type set not null,
  alter column direction set not null,
  alter column amount set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.financial_logs'::regclass
      and contype = 'p'
  ) then
    alter table public.financial_logs
      add constraint financial_logs_pkey primary key (id);
  end if;
end $$;

alter table public.financial_logs
  drop constraint if exists finacial_logs_log_type_check,
  drop constraint if exists financial_logs_log_type_check,
  drop constraint if exists finacial_logs_direction_check,
  drop constraint if exists financial_logs_direction_check,
  drop constraint if exists finacial_logs_amount_check,
  drop constraint if exists financial_logs_amount_check;

alter table public.financial_logs
  add constraint financial_logs_log_type_check
  check (
    log_type in (
      'adjustment',
      'cash_over',
      'cash_short',
      'Kas Lebih',
      'Kas Kurang'
    )
  ),
  add constraint financial_logs_direction_check
  check (direction in ('in', 'out', 'neutral')),
  add constraint financial_logs_amount_check
  check (amount >= 0);

create index if not exists idx_financial_logs_created
on public.financial_logs (created_at desc);

grant select, insert on public.financial_logs to authenticated;

alter table public.financial_logs enable row level security;

drop policy if exists "kasir or owner read financial logs" on public.financial_logs;
create policy "kasir or owner read financial logs"
on public.financial_logs
for select
to authenticated
using (
  kasir_id = auth.uid()
  or created_by = auth.uid()
  or public.current_user_role() = 'pemilik'
);

drop policy if exists "owner insert financial logs" on public.financial_logs;
create policy "owner insert financial logs"
on public.financial_logs
for insert
to authenticated
with check (public.current_user_role() = 'pemilik');

notify pgrst, 'reload schema';

-- ============================================================
-- 20260419_02_lockdown_shift_views.sql
-- ============================================================
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

-- ============================================================
-- 20260419_03_fix_produk_aktif_column.sql
-- ============================================================
-- 20260419_03_fix_produk_aktif_column.sql
-- Repair databases where public.produk was created without the legacy aktif flag.

alter table public.produk
  add column if not exists aktif boolean,
  add column if not exists status text;

update public.produk
set status = case
  when coalesce(aktif, true) then 'active'
  else 'inactive'
end
where status is null;

update public.produk
set aktif = case
  when coalesce(status, 'active') in ('inactive', 'deleted') then false
  else true
end
where aktif is null;

alter table public.produk
  alter column aktif set default true,
  alter column status set default 'active';

create or replace function public.create_accessory_transaction_atomic(
  p_transaction jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
  v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
  v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
  v_no_transaksi text := p_transaction->>'no_transaksi';
  v_method public.metode_bayar := coalesce(nullif(p_transaction->>'metode_bayar', ''), 'cash')::public.metode_bayar;
  v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
  v_total integer := coalesce((p_transaction->>'total_bayar')::numeric::integer, 0);
  v_uang_diterima integer := coalesce((p_transaction->>'uang_diterima')::numeric::integer, v_total);
  v_kembalian integer := coalesce((p_transaction->>'kembalian')::numeric::integer, 0);
  v_payments jsonb := p_transaction->'payments';
  v_payment jsonb;
  v_payment_method text;
  v_payment_amount integer;
  v_payment_total integer := 0;
  v_item jsonb;
  v_produk public.produk%rowtype;
  v_qty integer;
  v_harga_satuan integer;
  v_subtotal integer;
  v_items_total integer := 0;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
    raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
  end if;

  perform 1
  from public.shifts s
  where s.id = v_shift_id
    and s.cashier_id = v_kasir_id
    and s.status = 'active'::public.shift_status
  for update;

  if not found then
    raise exception 'Mulai shift dulu sebelum menyimpan transaksi.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang masih kosong.';
  end if;

  if jsonb_typeof(v_payments) <> 'array' or jsonb_array_length(v_payments) = 0 then
    v_payments := jsonb_build_array(
      jsonb_build_object('method', v_method::text, 'amount', v_total)
    );
  end if;

  for v_payment in select value from jsonb_array_elements(v_payments)
  loop
    v_payment_method := coalesce(nullif(v_payment->>'method', ''), v_method::text);
    v_payment_amount := coalesce((v_payment->>'amount')::numeric::integer, 0);

    if v_payment_amount <= 0 then
      raise exception 'Nominal pembayaran harus lebih besar dari 0.';
    end if;

    perform v_payment_method::public.nama_platform;
    v_payment_total := v_payment_total + v_payment_amount;
  end loop;

  if v_payment_total <> v_total then
    raise exception 'Total pembayaran harus sama dengan total transaksi.';
  end if;

  insert into public.transaksi (
    id,
    kasir_id,
    shift_id,
    no_transaksi,
    total_bayar,
    uang_diterima,
    kembalian,
    metode_bayar,
    payments,
    catatan,
    created_at
  )
  values (
    v_transaction_id,
    v_kasir_id,
    v_shift_id,
    v_no_transaksi,
    v_total,
    v_uang_diterima,
    v_kembalian,
    v_method,
    v_payments,
    p_transaction->>'catatan',
    v_created_at
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item->>'qty')::numeric::integer, 0);
    v_harga_satuan := coalesce((v_item->>'harga_satuan')::numeric::integer, 0);
    v_subtotal := coalesce((v_item->>'subtotal')::numeric::integer, 0);

    if v_qty <= 0 then
      raise exception 'Qty item transaksi harus lebih besar dari 0.';
    end if;

    if v_harga_satuan < 0 or v_subtotal <> v_qty * v_harga_satuan then
      raise exception 'Subtotal item transaksi tidak valid.';
    end if;

    select *
    into v_produk
    from public.produk
    where id = (v_item->>'produk_id')::uuid
    for update;

    if not found then
      raise exception 'Produk tidak ditemukan.';
    end if;

    if coalesce(v_produk.aktif, true) is false then
      raise exception 'Produk % tidak aktif.', v_produk.nama;
    end if;

    if v_produk.stok < v_qty then
      raise exception 'Stok % tidak cukup. Sisa stok %.', v_produk.nama, v_produk.stok;
    end if;

    insert into public.item_transaksi (
      id,
      transaksi_id,
      produk_id,
      nama_produk,
      qty,
      harga_satuan,
      subtotal
    )
    values (
      coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()),
      v_transaction_id,
      v_produk.id,
      coalesce(nullif(v_item->>'nama_produk', ''), v_produk.nama),
      v_qty,
      v_harga_satuan,
      v_subtotal
    );

    update public.produk
    set stok = stok - v_qty
    where id = v_produk.id;

    insert into public.stok_mutasi (
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
      v_produk.id,
      'keluar'::public.stock_mutation_type,
      -v_qty,
      v_produk.stok,
      v_produk.stok - v_qty,
      v_no_transaksi,
      'Penjualan aksesoris',
      v_created_at
    );

    v_items_total := v_items_total + v_subtotal;
  end loop;

  if v_items_total <> v_total then
    raise exception 'Total item tidak sama dengan total transaksi.';
  end if;

  for v_payment in select value from jsonb_array_elements(v_payments)
  loop
    v_payment_method := coalesce(nullif(v_payment->>'method', ''), v_method::text);
    v_payment_amount := coalesce((v_payment->>'amount')::numeric::integer, 0);

    if v_payment_method not in ('cash', 'qris', 'split') then
      perform public.pos_insert_wallet_movement(
        v_kasir_id,
        v_payment_method::public.nama_platform,
        'masuk'::public.jenis_dompet_trx,
        v_payment_amount,
        0,
        null,
        'Pembayaran aksesoris ' || v_no_transaksi,
        'accessory_sale',
        v_transaction_id,
        v_no_transaksi,
        v_created_at
      );
    end if;
  end loop;

  v_result := (
    select to_jsonb(t) || jsonb_build_object(
      'items',
      coalesce(
        (
          select jsonb_agg(to_jsonb(i) order by i.id)
          from public.item_transaksi i
          where i.transaksi_id = t.id
        ),
        '[]'::jsonb
      )
    )
    from public.transaksi t
    where t.id = v_transaction_id
  );

  return v_result;
end;
$$;

grant execute on function public.create_accessory_transaction_atomic(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- 20260419_04_repair_mutations_products_services.sql
-- ============================================================
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

-- ============================================================
-- 20260419_05_fix_metode_bayar_wallet_values.sql
-- ============================================================
-- 20260419_05_fix_metode_bayar_wallet_values.sql
-- Hotfix: make POS payment enum match every wallet option used by the app.

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

notify pgrst, 'reload schema';

-- ============================================================
-- 20260419_06_remove_refund_features.sql
-- ============================================================
-- 20260419_06_remove_refund_features.sql
-- Remove refund/return database objects from older deployments.

create extension if not exists pgcrypto;

drop view if exists public.product_profit_ranking;

do $$
begin
  if to_regclass('public.transaksi_void_audit') is not null then
    drop trigger if exists trg_restore_void_stock on public.transaksi_void_audit;
  end if;

  if to_regclass('public."returns"') is not null then
    drop trigger if exists prevent_returns_update_delete on public."returns";
  end if;

  if to_regclass('public.return_items') is not null then
    drop trigger if exists prevent_return_items_update_delete on public.return_items;
  end if;
end $$;

drop function if exists public.refund_accessory_transaction_atomic(uuid, text, text);
drop function if exists public.create_customer_return_atomic(jsonb, jsonb);
drop function if exists public.create_supplier_return_atomic(jsonb, jsonb);
drop function if exists public.prevent_return_record_mutation();
drop function if exists public.restore_void_stock();

alter table if exists public.financial_logs
  drop column if exists return_id;

alter table if exists public.transaksi
  drop column if exists void_status;

drop table if exists public.transaksi_void_audit;
drop table if exists public.return_items;
drop table if exists public.supplier_transactions;
drop table if exists public."returns";
drop table if exists public.suppliers;

drop type if exists public.refund_reason;
drop type if exists public.void_status;

create table if not exists public.financial_logs (
  id uuid primary key default gen_random_uuid(),
  kasir_id uuid references public.users(id),
  log_type text not null,
  direction text not null,
  amount integer not null,
  payment_method text,
  source_type text,
  source_id uuid,
  reference text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

update public.financial_logs
set log_type = 'adjustment'
where log_type not in (
  'adjustment',
  'cash_over',
  'cash_short',
  'Kas Lebih',
  'Kas Kurang'
);

alter table public.financial_logs
  drop constraint if exists finacial_logs_log_type_check,
  drop constraint if exists financial_logs_log_type_check,
  drop constraint if exists finacial_logs_direction_check,
  drop constraint if exists financial_logs_direction_check,
  drop constraint if exists finacial_logs_amount_check,
  drop constraint if exists financial_logs_amount_check;

alter table public.financial_logs
  add constraint financial_logs_log_type_check
  check (
    log_type in (
      'adjustment',
      'cash_over',
      'cash_short',
      'Kas Lebih',
      'Kas Kurang'
    )
  ),
  add constraint financial_logs_direction_check
  check (direction in ('in', 'out', 'neutral')),
  add constraint financial_logs_amount_check
  check (amount >= 0);

grant select, insert on public.financial_logs to authenticated;
alter table public.financial_logs enable row level security;

drop policy if exists "kasir or owner read financial logs" on public.financial_logs;
create policy "kasir or owner read financial logs"
on public.financial_logs
for select
to authenticated
using (
  kasir_id = auth.uid()
  or created_by = auth.uid()
  or public.current_user_role() = 'pemilik'
);

drop policy if exists "owner insert financial logs" on public.financial_logs;
create policy "owner insert financial logs"
on public.financial_logs
for insert
to authenticated
with check (public.current_user_role() = 'pemilik');

notify pgrst, 'reload schema';

-- ============================================================
-- 20260419_07_security_hardening_review_fixes.sql
-- ============================================================
-- 20260419_07_security_hardening_review_fixes.sql
-- Hardening pass for wallet actor validation, role lookup, and stock mutation rules.

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

drop policy if exists "kasir insert stok keluar" on public.stok_mutasi;
drop policy if exists "kasir insert stok masuk" on public.stok_mutasi;

create policy "kasir insert stok masuk"
on public.stok_mutasi
for insert
to authenticated
with check (
  public.current_user_role() in ('kasir'::public.user_role, 'pemilik'::public.user_role)
  and tipe = 'masuk'::public.stock_mutation_type
);

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

grant execute on function public.create_wallet_transaction_atomic(jsonb) to authenticated;
grant execute on function public.save_stock_mutation_atomic(jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- 20260419_08_service_transactions_recording_only.sql
-- ============================================================
-- 20260419_08_service_transactions_recording_only.sql
-- Service transactions are recording-only. They must never validate, add, or deduct saldo.

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

create or replace function public.create_digital_transaction_atomic(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
  v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
  v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
  v_no_transaksi text := p_transaction->>'no_transaksi';
  v_jenis public.jenis_digital := (p_transaction->>'jenis')::public.jenis_digital;
  v_is_direct_service boolean := (p_transaction->>'jenis') in ('transfer_bank', 'transfer_ewallet');
  v_payment_method public.nama_platform := coalesce(nullif(p_transaction->>'payment_method', ''), 'cash')::public.nama_platform;
  v_nominal integer := coalesce(nullif(p_transaction->>'nominal', '')::numeric::integer, 0);
  v_admin_fee integer := coalesce(
    nullif(p_transaction->>'admin_fee', '')::numeric::integer,
    nullif(p_transaction->>'biaya_admin', '')::numeric::integer,
    0
  );
  v_total integer := coalesce(
    nullif(p_transaction->>'total', '')::numeric::integer,
    nullif(p_transaction->>'harga_jual', '')::numeric::integer,
    nullif(p_transaction->>'selling_price', '')::numeric::integer,
    v_nominal + v_admin_fee
  );
  v_harga_jual integer := coalesce(
    nullif(p_transaction->>'selling_price', '')::numeric::integer,
    nullif(p_transaction->>'harga_jual', '')::numeric::integer,
    v_total
  );
  v_modal integer := coalesce(
    nullif(p_transaction->>'cost', '')::numeric::integer,
    nullif(p_transaction->>'modal', '')::numeric::integer,
    case when v_is_direct_service then v_nominal + v_admin_fee else 0 end
  );
  v_profit integer := coalesce(
    nullif(p_transaction->>'profit', '')::numeric::integer,
    v_harga_jual - v_modal
  );
  v_transfer_platform text := coalesce(
    nullif(p_transaction->>'transfer_platform', ''),
    nullif(p_transaction->>'platform', ''),
    p_transaction->>'provider'
  );
  v_target_number text := coalesce(
    nullif(p_transaction->>'target_number', ''),
    p_transaction->>'nomor_tujuan'
  );
  v_receiver_name text := coalesce(
    nullif(p_transaction->>'receiver_name', ''),
    nullif(p_transaction->>'customer_name', ''),
    p_transaction->>'nama_tujuan'
  );
  v_service_product_id uuid := nullif(p_transaction->>'service_product_id', '')::uuid;
  v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
    raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
  end if;

  perform 1
  from public.shifts s
  where s.id = v_shift_id
    and s.cashier_id = v_kasir_id
    and s.status = 'active'::public.shift_status
  for update;

  if not found then
    raise exception 'Mulai shift dulu sebelum menyimpan transaksi layanan.';
  end if;

  if v_harga_jual <= 0 then
    raise exception 'Selling price wajib lebih besar dari 0.';
  end if;

  if v_modal < 0 then
    raise exception 'Modal tidak boleh negatif.';
  end if;

  if coalesce(v_target_number, '') = '' then
    raise exception 'Nomor tujuan wajib diisi.';
  end if;

  if v_is_direct_service then
    if coalesce(v_transfer_platform, '') = '' then
      raise exception 'Platform wajib dipilih.';
    end if;

    if v_nominal <= 0 then
      raise exception 'Nominal wajib lebih besar dari 0.';
    end if;

    if v_admin_fee < 0 then
      raise exception 'Biaya admin tidak boleh negatif.';
    end if;
  end if;

  insert into public.transaksi_digital (
    id,
    kasir_id,
    shift_id,
    no_transaksi,
    jenis,
    provider,
    nomor_tujuan,
    nama_tujuan,
    platform_sumber,
    payment_method,
    nominal,
    harga_jual,
    modal,
    catatan,
    service_product_id,
    selling_price,
    cost,
    profit,
    target_number,
    customer_name,
    transfer_platform,
    admin_fee,
    total,
    receiver_name,
    transaction_items,
    transaction_details,
    created_at
  )
  values (
    v_transaction_id,
    v_kasir_id,
    v_shift_id,
    v_no_transaksi,
    v_jenis,
    coalesce(nullif(p_transaction->>'provider', ''), v_transfer_platform),
    v_target_number,
    v_receiver_name,
    null,
    v_payment_method,
    v_nominal,
    v_harga_jual,
    v_modal,
    p_transaction->>'catatan',
    v_service_product_id,
    v_harga_jual,
    v_modal,
    v_profit,
    v_target_number,
    v_receiver_name,
    v_transfer_platform,
    v_admin_fee,
    v_total,
    v_receiver_name,
    coalesce(p_transaction->'transaction_items', '[]'::jsonb),
    coalesce(p_transaction->'transaction_details', '{}'::jsonb)
      || jsonb_build_object(
        'mode', case when v_is_direct_service then 'direct_service' else 'product_service' end,
        'recording_only', true,
        'platform', v_transfer_platform,
        'nominal', v_nominal,
        'admin_fee', v_admin_fee,
        'total', v_total,
        'selling_price', v_harga_jual,
        'cost', v_modal,
        'profit', v_profit,
        'target_number', v_target_number,
        'receiver_name', v_receiver_name,
        'payment_method', v_payment_method::text
      ),
    v_created_at
  );

  v_result := (
    select to_jsonb(digital_row)
    from public.transaksi_digital as digital_row
    where digital_row.id = v_transaction_id
  );

  return v_result;
end;
$$;

grant execute on function public.create_digital_transaction_atomic(jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- 20260419_09_dual_service_payment_recording.sql
-- ============================================================
-- 20260419_09_dual_service_payment_recording.sql
-- Record separate customer and supplier payment methods for direct services.
-- Both fields are recording-only and are not connected to saldo mutation logic.

alter table public.transaksi_digital
  add column if not exists payment_customer text,
  add column if not exists payment_supplier text;

create or replace function public.create_digital_transaction_atomic(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
  v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
  v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
  v_no_transaksi text := p_transaction->>'no_transaksi';
  v_jenis public.jenis_digital := (p_transaction->>'jenis')::public.jenis_digital;
  v_is_direct_service boolean := (p_transaction->>'jenis') in ('transfer_bank', 'transfer_ewallet');
  v_payment_method public.nama_platform := coalesce(nullif(p_transaction->>'payment_method', ''), 'cash')::public.nama_platform;
  v_payment_customer text := coalesce(nullif(p_transaction->>'payment_customer', ''), v_payment_method::text);
  v_payment_supplier text := nullif(p_transaction->>'payment_supplier', '');
  v_nominal integer := coalesce(nullif(p_transaction->>'nominal', '')::numeric::integer, 0);
  v_admin_fee integer := coalesce(
    nullif(p_transaction->>'admin_fee', '')::numeric::integer,
    nullif(p_transaction->>'biaya_admin', '')::numeric::integer,
    0
  );
  v_total integer := coalesce(
    nullif(p_transaction->>'total', '')::numeric::integer,
    nullif(p_transaction->>'harga_jual', '')::numeric::integer,
    nullif(p_transaction->>'selling_price', '')::numeric::integer,
    v_nominal + v_admin_fee
  );
  v_harga_jual integer := coalesce(
    nullif(p_transaction->>'selling_price', '')::numeric::integer,
    nullif(p_transaction->>'harga_jual', '')::numeric::integer,
    v_total
  );
  v_modal integer := coalesce(
    nullif(p_transaction->>'cost', '')::numeric::integer,
    nullif(p_transaction->>'modal', '')::numeric::integer,
    case when v_is_direct_service then v_nominal + v_admin_fee else 0 end
  );
  v_profit integer := coalesce(
    nullif(p_transaction->>'profit', '')::numeric::integer,
    v_harga_jual - v_modal
  );
  v_transfer_platform text := coalesce(
    nullif(p_transaction->>'transfer_platform', ''),
    nullif(p_transaction->>'platform', ''),
    p_transaction->>'provider'
  );
  v_target_number text := coalesce(
    nullif(p_transaction->>'target_number', ''),
    p_transaction->>'nomor_tujuan'
  );
  v_receiver_name text := coalesce(
    nullif(p_transaction->>'receiver_name', ''),
    nullif(p_transaction->>'customer_name', ''),
    p_transaction->>'nama_tujuan'
  );
  v_service_product_id uuid := nullif(p_transaction->>'service_product_id', '')::uuid;
  v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
    raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
  end if;

  perform 1
  from public.shifts s
  where s.id = v_shift_id
    and s.cashier_id = v_kasir_id
    and s.status = 'active'::public.shift_status
  for update;

  if not found then
    raise exception 'Mulai shift dulu sebelum menyimpan transaksi layanan.';
  end if;

  if v_harga_jual <= 0 then
    raise exception 'Selling price wajib lebih besar dari 0.';
  end if;

  if v_modal < 0 then
    raise exception 'Modal tidak boleh negatif.';
  end if;

  if coalesce(v_target_number, '') = '' then
    raise exception 'Nomor tujuan wajib diisi.';
  end if;

  if v_is_direct_service then
    if coalesce(v_transfer_platform, '') = '' then
      raise exception 'Platform wajib dipilih.';
    end if;

    if v_nominal <= 0 then
      raise exception 'Nominal wajib lebih besar dari 0.';
    end if;

    if v_admin_fee < 0 then
      raise exception 'Biaya admin tidak boleh negatif.';
    end if;
  end if;

  insert into public.transaksi_digital (
    id,
    kasir_id,
    shift_id,
    no_transaksi,
    jenis,
    provider,
    nomor_tujuan,
    nama_tujuan,
    platform_sumber,
    payment_method,
    payment_customer,
    payment_supplier,
    nominal,
    harga_jual,
    modal,
    catatan,
    service_product_id,
    selling_price,
    cost,
    profit,
    target_number,
    customer_name,
    transfer_platform,
    admin_fee,
    total,
    receiver_name,
    transaction_items,
    transaction_details,
    created_at
  )
  values (
    v_transaction_id,
    v_kasir_id,
    v_shift_id,
    v_no_transaksi,
    v_jenis,
    coalesce(nullif(p_transaction->>'provider', ''), v_transfer_platform),
    v_target_number,
    v_receiver_name,
    null,
    v_payment_method,
    v_payment_customer,
    v_payment_supplier,
    v_nominal,
    v_harga_jual,
    v_modal,
    p_transaction->>'catatan',
    v_service_product_id,
    v_harga_jual,
    v_modal,
    v_profit,
    v_target_number,
    v_receiver_name,
    v_transfer_platform,
    v_admin_fee,
    v_total,
    v_receiver_name,
    coalesce(p_transaction->'transaction_items', '[]'::jsonb),
    coalesce(p_transaction->'transaction_details', '{}'::jsonb)
      || jsonb_build_object(
        'mode', case when v_is_direct_service then 'direct_service' else 'product_service' end,
        'recording_only', true,
        'platform', v_transfer_platform,
        'nominal', v_nominal,
        'admin_fee', v_admin_fee,
        'total', v_total,
        'selling_price', v_harga_jual,
        'cost', v_modal,
        'profit', v_profit,
        'target_number', v_target_number,
        'receiver_name', v_receiver_name,
        'payment_method', v_payment_method::text,
        'payment_customer', v_payment_customer,
        'payment_supplier', v_payment_supplier
      ),
    v_created_at
  );

  v_result := (
    select to_jsonb(digital_row)
    from public.transaksi_digital as digital_row
    where digital_row.id = v_transaction_id
  );

  return v_result;
end;
$$;

grant execute on function public.create_digital_transaction_atomic(jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- 20260419_99_fix_shift_reporting_and_triggers.sql
-- ============================================================
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

-- ============================================================
-- 20260419_99_repair_product_service_write_paths.sql
-- ============================================================
-- 20260419_99_repair_product_service_write_paths.sql
  -- Final runtime repair for wallet mutations, product writes, stock mutations,
  -- service product writes, and PIN hashes.

  create extension if not exists pgcrypto;

  -- Supabase Dashboard can append bad RLS statements for PL/pgSQL variable names
  -- when a query is generated/edited with its RLS helper. These temporary guard
  -- tables make stale lines like "ALTER TABLE v_pin_hash ENABLE ROW LEVEL SECURITY"
  -- harmless during this one SQL Editor session.
  create temporary table if not exists v_pin_hash (_ignore boolean);
  create temporary table if not exists v_before_snapshot (_ignore boolean);
  create temporary table if not exists v_row (_ignore boolean);
  create temporary table if not exists v_snapshot (_ignore boolean);
  create temporary table if not exists v_result (_ignore boolean);
  create temporary table if not exists v_user_id (_ignore boolean);
  create temporary table if not exists v_role (_ignore boolean);
  create temporary table if not exists v_product_id (_ignore boolean);
  create temporary table if not exists v_raw_product_id (_ignore boolean);
  create temporary table if not exists v_action (_ignore boolean);
  create temporary table if not exists v_balance (_ignore boolean);
  create temporary table if not exists v_id (_ignore boolean);
  create temporary table if not exists v_kasir_id (_ignore boolean);
  create temporary table if not exists v_platform (_ignore boolean);
  create temporary table if not exists v_jenis (_ignore boolean);
  create temporary table if not exists v_platform_tujuan (_ignore boolean);
  create temporary table if not exists v_nominal (_ignore boolean);
  create temporary table if not exists v_biaya_admin (_ignore boolean);
  create temporary table if not exists v_code (_ignore boolean);
  create temporary table if not exists v_status (_ignore boolean);
  create temporary table if not exists v_deleted_by (_ignore boolean);
  create temporary table if not exists v_deleted_at (_ignore boolean);
  create temporary table if not exists v_before_stock (_ignore boolean);
  create temporary table if not exists v_stock_delta (_ignore boolean);
  create temporary table if not exists v_name (_ignore boolean);
  create temporary table if not exists v_category (_ignore boolean);
  create temporary table if not exists v_provider (_ignore boolean);
  create temporary table if not exists v_service_type (_ignore boolean);
  create temporary table if not exists v_cost (_ignore boolean);
  create temporary table if not exists v_default_price (_ignore boolean);
  create temporary table if not exists v_active (_ignore boolean);
  create temporary table if not exists v_produk_stok (_ignore boolean);
  create temporary table if not exists v_produk_status (_ignore boolean);
  create temporary table if not exists v_produk_nama (_ignore boolean);
  create temporary table if not exists v_produk_kode (_ignore boolean);
  create temporary table if not exists v_mutation_id (_ignore boolean);
  create temporary table if not exists v_delta (_ignore boolean);

  do $$
  begin
    create type public.stock_mutation_type as enum ('masuk', 'keluar', 'penyesuaian');
  exception
    when duplicate_object then null;
  end $$;

  alter table public.users
    add column if not exists pin_hash text;

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

  update public.users as app_user
  set pin_hash = crypt(auth_user.raw_user_meta_data->>'pin', gen_salt('bf'))
  from auth.users as auth_user
  where auth_user.id = app_user.id
    and coalesce(auth_user.raw_user_meta_data->>'pin', '') <> ''
    and (
      coalesce(app_user.pin_hash, '') = ''
      or app_user.pin_hash = encode(digest(auth_user.raw_user_meta_data->>'pin', 'sha256'), 'hex')
    );

  update auth.users
  set raw_user_meta_data = raw_user_meta_data - 'pin'
  where raw_user_meta_data ? 'pin';

  alter table public.produk
    add column if not exists aktif boolean default true,
    add column if not exists kode_produk text,
    add column if not exists status text,
    add column if not exists deleted_at timestamptz,
    add column if not exists deleted_by uuid references auth.users(id),
    add column if not exists updated_at timestamptz,
    add column if not exists created_at timestamptz default now();

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

  update public.produk
  set kode_produk = upper(btrim(kode_produk))
  where kode_produk is not null
    and kode_produk <> upper(btrim(kode_produk));

  with duplicate_codes as (
    select
      id,
      kode_produk,
      row_number() over (
        partition by kode_produk
        order by
          case coalesce(status, 'active')
            when 'active' then 0
            when 'inactive' then 1
            else 2
          end,
          created_at desc nulls last,
          id
      ) as duplicate_rank
    from public.produk
    where kode_produk is not null
      and btrim(kode_produk) <> ''
  )
  update public.produk as product_row
  set kode_produk = duplicate_codes.kode_produk
    || '-DUP-'
    || upper(replace(product_row.id::text, '-', ''))
  from duplicate_codes
  where duplicate_codes.id = product_row.id
    and duplicate_codes.duplicate_rank > 1;

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

  update public.product_activity_logs
  set
    details = coalesce(details, '{}'::jsonb)
      || jsonb_build_object('legacy_action', action),
    action = 'legacy_product_activity'
  where action not in (
    'create_product',
    'edit_product',
    'toggle_product_status',
    'delete_product',
    'restore_product',
    'permanent_delete_product',
    'update_stock',
    'create_service_product',
    'update_service_product',
    'disable_service_product',
    'legacy_product_activity'
  );

  alter table public.product_activity_logs
    drop constraint if exists product_activity_logs_action_check;

  alter table public.product_activity_logs
    add constraint product_activity_logs_action_check
    check (
      action in (
        'create_product',
        'edit_product',
        'toggle_product_status',
        'delete_product',
        'restore_product',
        'permanent_delete_product',
        'update_stock',
        'create_service_product',
        'update_service_product',
        'disable_service_product',
        'legacy_product_activity'
      )
    );

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

  update public.services_products
  set
    category = btrim(category),
    provider = btrim(provider),
    service_type = btrim(coalesce(service_type, '')),
    name = btrim(name);

  alter table public.services_products
    drop constraint if exists services_products_category_check;

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

  with duplicate_services as (
    select
      id,
      service_type,
      row_number() over (
        partition by category, provider, service_type, name
        order by active desc, created_at desc nulls last, id
      ) as duplicate_rank
    from public.services_products
  )
  update public.services_products as service_row
  set service_type = duplicate_services.service_type
    || '-dup-'
    || lower(replace(service_row.id::text, '-', ''))
  from duplicate_services
  where duplicate_services.id = service_row.id
    and duplicate_services.duplicate_rank > 1;

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

  alter table public.transaksi_dompet
    add column if not exists source_type text,
    add column if not exists source_id uuid,
    add column if not exists source_ref text;

  create index if not exists idx_transaksi_dompet_source
  on public.transaksi_dompet (source_type, source_id);

  grant usage on schema public to authenticated;
  grant select on public.produk to authenticated;
  revoke insert, update, delete on public.produk from authenticated;
  grant select on public.stok_mutasi to authenticated;
  revoke insert, update, delete on public.stok_mutasi from authenticated;
  grant select on public.product_activity_logs to authenticated;
  revoke insert, update, delete on public.product_activity_logs from authenticated;
  grant select on public.services_products to authenticated;
  revoke insert, update, delete on public.services_products from authenticated;
  grant select, insert on public.transaksi_dompet to authenticated;

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
  drop policy if exists "kasir insert stok masuk" on public.stok_mutasi;
  drop policy if exists "owner manage stok mutasi" on public.stok_mutasi;

  create policy "authenticated read stok mutasi"
  on public.stok_mutasi
  for select
  to authenticated
  using (true);

  drop policy if exists "owner read product activity logs" on public.product_activity_logs;
  drop policy if exists "authenticated insert product activity logs" on public.product_activity_logs;

  create policy "owner read product activity logs"
  on public.product_activity_logs
  for select
  to authenticated
  using (public.current_user_role() = 'pemilik'::public.user_role);

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

  create or replace function public.verify_user_pin(p_pin text)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_pin_hash text;
  begin
    if auth.uid() is null then
      return false;
    end if;

    if coalesce(btrim(p_pin), '') = '' then
      return false;
    end if;

    select pin_hash
    into v_pin_hash
    from public.users
    where id = auth.uid();

    if coalesce(v_pin_hash, '') = '' then
      return false;
    end if;

    if v_pin_hash like '$2%' then
      return v_pin_hash = crypt(p_pin, v_pin_hash);
    end if;

    return v_pin_hash = encode(digest(p_pin, 'sha256'), 'hex');
  end;
  $$;

  create or replace function public.set_user_pin(
    p_new_pin text,
    p_current_pin text default null
  )
  returns boolean
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_user_id uuid := auth.uid();
    v_pin_hash text;
    v_current_pin_valid boolean := false;
  begin
    if v_user_id is null then
      raise exception 'User belum login.';
    end if;

    if coalesce(btrim(p_new_pin), '') !~ '^[0-9]{4,8}$' then
      raise exception 'PIN baru harus berisi 4 sampai 8 digit angka.';
    end if;

    select pin_hash
    into v_pin_hash
    from public.users
    where id = v_user_id
    for update;

    if not found then
      raise exception 'Profil user tidak ditemukan.';
    end if;

    if coalesce(v_pin_hash, '') <> '' then
      if coalesce(btrim(p_current_pin), '') = '' then
        raise exception 'PIN lama wajib diisi.';
      end if;

      v_current_pin_valid := case
        when v_pin_hash like '$2%' then v_pin_hash = crypt(p_current_pin, v_pin_hash)
        else v_pin_hash = encode(digest(p_current_pin, 'sha256'), 'hex')
      end;

      if not v_current_pin_valid then
        raise exception 'PIN lama tidak sesuai.';
      end if;
    end if;

    update public.users
    set pin_hash = crypt(btrim(p_new_pin), gen_salt('bf'))
    where id = v_user_id;

    update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'pin'
    where id = v_user_id;

    return true;
  end;
  $$;

  create or replace function public.owner_set_user_pin(
    p_user_id uuid,
    p_new_pin text
  )
  returns boolean
  language plpgsql
  security definer
  set search_path = public
  as $$
  begin
    if auth.uid() is null then
      raise exception 'User belum login.';
    end if;

    if public.current_user_role() <> 'pemilik'::public.user_role then
      raise exception 'Hanya owner yang dapat reset PIN user.';
    end if;

    if p_user_id is null then
      raise exception 'User wajib dipilih.';
    end if;

    if coalesce(btrim(p_new_pin), '') !~ '^[0-9]{4,8}$' then
      raise exception 'PIN baru harus berisi 4 sampai 8 digit angka.';
    end if;

    update public.users
    set pin_hash = crypt(btrim(p_new_pin), gen_salt('bf'))
    where id = p_user_id;

    if not found then
      raise exception 'Profil user tidak ditemukan.';
    end if;

    update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'pin'
    where id = p_user_id;

    return true;
  end;
  $$;

  create or replace function public.save_product_atomic(p_product jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_user_id uuid := auth.uid();
    v_raw_product_id text := nullif(p_product->>'id', '');
    v_product_id uuid := case
      when v_raw_product_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then v_raw_product_id::uuid
      else null
    end;
    v_code text := upper(btrim(coalesce(p_product->>'kode_produk', '')));
    v_status text := coalesce(
      nullif(p_product->>'status', ''),
      case
        when coalesce(nullif(p_product->>'aktif', '')::boolean, true) then 'active'
        else 'inactive'
      end
    );
    v_deleted_by uuid := nullif(p_product->>'deleted_by', '')::uuid;
    v_deleted_at timestamptz := nullif(p_product->>'deleted_at', '')::timestamptz;
    v_row public.produk%rowtype;
    v_before_snapshot jsonb := null;
    v_before_stock integer := null;
    v_stock_delta integer := 0;
    v_action text := 'create_product';
  begin
    if v_user_id is null then
      raise exception 'User belum login.';
    end if;

    if public.current_user_role() <> 'pemilik'::public.user_role then
      raise exception 'Hanya owner yang dapat mengelola data produk.';
    end if;

    if coalesce(btrim(p_product->>'nama'), '') = '' then
      raise exception 'Nama produk wajib diisi.';
    end if;

    if coalesce(btrim(p_product->>'kategori'), '') = '' then
      raise exception 'Kategori produk wajib diisi.';
    end if;

    if v_status not in ('active', 'inactive', 'deleted') then
      raise exception 'Status produk tidak valid.';
    end if;

    if v_code = '' then
      v_code := 'RAJA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    end if;

    if exists (
      select 1
      from public.produk
      where kode_produk = v_code
        and (v_product_id is null or id <> v_product_id)
    ) then
      raise exception 'Kode produk % sudah dipakai produk lain.', v_code
        using errcode = '23505', constraint = 'produk_kode_produk_unique';
    end if;

    if v_product_id is not null then
      select to_jsonb(product_row), product_row.stok
      into v_before_snapshot, v_before_stock
      from public.produk as product_row
      where product_row.id = v_product_id
      for update;

      if not found then
        raise exception 'Produk tidak ditemukan.';
      end if;

      v_action := case
        when v_status = 'deleted' then 'delete_product'
        when coalesce(v_before_snapshot->>'status', 'active') = 'deleted'
          and v_status = 'active' then 'restore_product'
        when (v_before_snapshot->>'aktif')::boolean is distinct from (v_status = 'active')
          then 'toggle_product_status'
        else 'edit_product'
      end;
    end if;

    if v_product_id is null then
      insert into public.produk (
        id,
        kode_produk,
        nama,
        kategori,
        stok,
        stok_minimum,
        harga_beli,
        harga_jual,
        satuan,
        aktif,
        status,
        deleted_at,
        deleted_by,
        updated_at
      )
      values (
        gen_random_uuid(),
        v_code,
        btrim(p_product->>'nama'),
        btrim(p_product->>'kategori'),
        greatest(coalesce(nullif(p_product->>'stok', '')::numeric::integer, 0), 0),
        greatest(coalesce(nullif(p_product->>'stok_minimum', '')::numeric::integer, 3), 0),
        greatest(coalesce(nullif(p_product->>'harga_beli', '')::numeric::integer, 0), 0),
        greatest(coalesce(nullif(p_product->>'harga_jual', '')::numeric::integer, 0), 0),
        coalesce(nullif(btrim(p_product->>'satuan'), ''), 'pcs'),
        v_status = 'active',
        v_status,
        case when v_status = 'deleted' then coalesce(v_deleted_at, now()) else null end,
        case when v_status = 'deleted' then coalesce(v_deleted_by, v_user_id) else null end,
        now()
      )
      returning * into v_row;
    else
      update public.produk
      set
        kode_produk = v_code,
        nama = btrim(p_product->>'nama'),
        kategori = btrim(p_product->>'kategori'),
        stok = greatest(coalesce(nullif(p_product->>'stok', '')::numeric::integer, 0), 0),
        stok_minimum = greatest(coalesce(nullif(p_product->>'stok_minimum', '')::numeric::integer, 3), 0),
        harga_beli = greatest(coalesce(nullif(p_product->>'harga_beli', '')::numeric::integer, 0), 0),
        harga_jual = greatest(coalesce(nullif(p_product->>'harga_jual', '')::numeric::integer, 0), 0),
        satuan = coalesce(nullif(btrim(p_product->>'satuan'), ''), 'pcs'),
        aktif = v_status = 'active',
        status = v_status,
        deleted_at = case when v_status = 'deleted' then coalesce(v_deleted_at, now()) else null end,
        deleted_by = case when v_status = 'deleted' then coalesce(v_deleted_by, v_user_id) else null end,
        updated_at = now()
      where id = v_product_id
      returning * into v_row;

    end if;

    if v_product_id is null and v_row.stok > 0 then
      insert into public.stok_mutasi (
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
        v_row.id,
        'masuk'::public.stock_mutation_type,
        v_row.stok,
        0,
        v_row.stok,
        'CREATE-' || v_row.kode_produk,
        'Stok awal produk ' || v_row.nama,
        now()
      );
    elsif v_product_id is not null and coalesce(v_before_stock, 0) <> v_row.stok then
      v_stock_delta := v_row.stok - coalesce(v_before_stock, 0);

      insert into public.stok_mutasi (
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
        v_row.id,
        'penyesuaian'::public.stock_mutation_type,
        v_stock_delta,
        v_before_stock,
        v_row.stok,
        'EDIT-' || v_row.kode_produk,
        'Edit stok produk ' || v_row.nama,
        now()
      );
    end if;

    insert into public.product_activity_logs (
      product_id,
      action,
      actor_id,
      details,
      product_snapshot,
      created_at
    )
    values (
      v_row.id,
      v_action,
      v_user_id,
      jsonb_build_object(
        'before', v_before_snapshot,
        'after', to_jsonb(v_row),
        'stock_delta', case
          when v_product_id is null then v_row.stok
          else v_row.stok - coalesce(v_before_stock, v_row.stok)
        end
      ),
      to_jsonb(v_row),
      now()
    );

    return to_jsonb(v_row);
  end;
  $$;

  create or replace function public.save_service_product_atomic(p_product jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_user_id uuid := auth.uid();
    v_raw_product_id text := nullif(p_product->>'id', '');
    v_product_id uuid := case
      when v_raw_product_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then v_raw_product_id::uuid
      else null
    end;
    v_name text := btrim(coalesce(p_product->>'name', ''));
    v_category text := btrim(coalesce(p_product->>'category', ''));
    v_provider text := btrim(coalesce(p_product->>'provider', ''));
    v_service_type text := btrim(coalesce(p_product->>'service_type', ''));
    v_cost integer := greatest(coalesce(nullif(p_product->>'cost', '')::numeric::integer, 0), 0);
    v_default_price integer := case
      when nullif(p_product->>'default_price', '') is null then null
      else greatest((p_product->>'default_price')::numeric::integer, 0)
    end;
    v_active boolean := coalesce(
      nullif(p_product->>'active', '')::boolean,
      coalesce(nullif(p_product->>'status', ''), 'active') <> 'inactive'
    );
    v_row public.services_products%rowtype;
    v_before_snapshot jsonb := null;
    v_action text := 'create_service_product';
  begin
    if v_user_id is null then
      raise exception 'User belum login.';
    end if;

    if public.current_user_role() <> 'pemilik'::public.user_role then
      raise exception 'Hanya owner yang dapat mengelola layanan digital.';
    end if;

    if v_category not in (
      'pulsa',
      'kuota',
      'voucher_game',
      'token_listrik',
      'transfer_bank',
      'transfer_ewallet'
    ) then
      raise exception 'Kategori layanan tidak valid.';
    end if;

    if v_name = '' then
      raise exception 'Nama layanan wajib diisi.';
    end if;

    if v_provider = '' then
      raise exception 'Provider wajib diisi.';
    end if;

    if v_cost <= 0 then
      raise exception 'Modal harus berupa angka lebih dari 0.';
    end if;

    if exists (
      select 1
      from public.services_products
      where category = v_category
        and provider = v_provider
        and service_type = v_service_type
        and name = v_name
        and (v_product_id is null or id <> v_product_id)
    ) then
      raise exception 'Layanan dengan kategori, provider, jenis, dan nama yang sama sudah ada.'
        using errcode = '23505',
              constraint = 'services_products_category_provider_service_type_name_key';
    end if;

    if v_product_id is not null then
      select to_jsonb(service_row)
      into v_before_snapshot
      from public.services_products as service_row
      where service_row.id = v_product_id
      for update;

      if not found then
        raise exception 'Layanan tidak ditemukan.';
      end if;

      v_action := 'update_service_product';
    end if;

    if v_product_id is null then
      insert into public.services_products (
        name,
        category,
        provider,
        service_type,
        cost,
        default_price,
        active
      )
      values (
        v_name,
        v_category,
        v_provider,
        v_service_type,
        v_cost,
        v_default_price,
        v_active
      )
      returning * into v_row;
    else
      update public.services_products
      set
        name = v_name,
        category = v_category,
        provider = v_provider,
        service_type = v_service_type,
        cost = v_cost,
        default_price = v_default_price,
        active = v_active
      where id = v_product_id
      returning * into v_row;
    end if;

    insert into public.product_activity_logs (
      product_id,
      action,
      actor_id,
      details,
      product_snapshot,
      created_at
    )
    values (
      null,
      v_action,
      v_user_id,
      jsonb_build_object(
        'service_product_id', v_row.id,
        'before', v_before_snapshot,
        'after', to_jsonb(v_row)
      ),
      to_jsonb(v_row),
      now()
    );

    return to_jsonb(v_row);
  end;
  $$;

  create or replace function public.disable_service_product_atomic(p_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_row public.services_products%rowtype;
    v_before_snapshot jsonb;
    v_user_id uuid := auth.uid();
  begin
    if v_user_id is null then
      raise exception 'User belum login.';
    end if;

    if public.current_user_role() <> 'pemilik'::public.user_role then
      raise exception 'Hanya owner yang dapat mengelola layanan digital.';
    end if;

    select to_jsonb(service_row)
    into v_before_snapshot
    from public.services_products as service_row
    where service_row.id = p_id
    for update;

    if not found then
      raise exception 'Layanan tidak ditemukan.';
    end if;

    update public.services_products
    set active = false
    where id = p_id
    returning * into v_row;

    insert into public.product_activity_logs (
      product_id,
      action,
      actor_id,
      details,
      product_snapshot,
      created_at
    )
    values (
      null,
      'disable_service_product',
      v_user_id,
      jsonb_build_object(
        'service_product_id', v_row.id,
        'before', v_before_snapshot,
        'after', to_jsonb(v_row)
      ),
      to_jsonb(v_row),
      now()
    );

    return to_jsonb(v_row);
  end;
  $$;

  create or replace function public.permanently_delete_product_atomic(p_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_user_id uuid := auth.uid();
    v_row public.produk%rowtype;
    v_snapshot jsonb;
  begin
    if v_user_id is null then
      raise exception 'User belum login.';
    end if;

    if public.current_user_role() <> 'pemilik'::public.user_role then
      raise exception 'Hanya owner yang dapat menghapus permanen produk.';
    end if;

    select *
    into v_row
    from public.produk
    where id = p_id
    for update;

    if not found then
      raise exception 'Produk tidak ditemukan.';
    end if;

    if coalesce(v_row.status, 'active') <> 'deleted' then
      raise exception 'Produk harus masuk History Produk sebelum dihapus permanen.';
    end if;

    v_snapshot := to_jsonb(v_row);

    insert into public.product_activity_logs (
      product_id,
      action,
      actor_id,
      details,
      product_snapshot,
      created_at
    )
    values (
      v_row.id,
      'permanent_delete_product',
      v_user_id,
      jsonb_build_object(
        'deleted_at', v_row.deleted_at,
        'permanently_deleted_at', now()
      ),
      v_snapshot,
      now()
    );

    delete from public.produk
    where id = p_id;

    return v_snapshot;
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
    v_produk_nama text;
    v_produk_kode text;
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

    select stok, coalesce(status, 'active'), nama, kode_produk
    into v_produk_stok, v_produk_status, v_produk_nama, v_produk_kode
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

    insert into public.product_activity_logs (
      product_id,
      action,
      actor_id,
      details,
      product_snapshot,
      created_at
    )
    values (
      v_product_id,
      'update_stock',
      v_user_id,
      jsonb_build_object(
        'tipe', v_tipe::text,
        'jumlah', v_delta,
        'stok_sebelum', v_produk_stok,
        'stok_sesudah', v_produk_stok + v_delta,
        'referensi', p_mutation->>'referensi',
        'catatan', p_mutation->>'catatan',
        'mutation_id', v_mutation_id
      ),
      jsonb_build_object(
        'id', v_product_id,
        'nama', v_produk_nama,
        'kode_produk', v_produk_kode,
        'stok', v_produk_stok + v_delta,
        'status', v_produk_status
      ),
      now()
    );

    return v_result;
  end;
  $$;

  grant execute on function public.verify_user_pin(text) to authenticated;
  grant execute on function public.set_user_pin(text, text) to authenticated;
  grant execute on function public.owner_set_user_pin(uuid, text) to authenticated;
  grant execute on function public.pos_wallet_balance(public.nama_platform) to authenticated;
  grant execute on function public.create_wallet_transaction_atomic(jsonb) to authenticated;
  grant execute on function public.save_product_atomic(jsonb) to authenticated;
  grant execute on function public.save_service_product_atomic(jsonb) to authenticated;
  grant execute on function public.disable_service_product_atomic(uuid) to authenticated;
  grant execute on function public.permanently_delete_product_atomic(uuid) to authenticated;
  grant execute on function public.save_stock_mutation_atomic(jsonb) to authenticated;

  notify pgrst, 'reload schema';

-- ============================================================
-- 20260419_99_z_pasarkuota_qris_wallet_flow.sql
-- ============================================================
-- 20260419_99_z_pasarkuota_qris_wallet_flow.sql
-- Final wallet flow:
-- - Pulsa, kuota, voucher game, and token listrik deduct PASAR KUOTA by cost/modal.
-- - QRIS customer payments are the only automatic wallet inflow.

alter table public.transaksi
  add column if not exists payments jsonb not null default '[]'::jsonb;

alter table public.transaksi_digital
  add column if not exists nama_tujuan text,
  add column if not exists platform_sumber public.nama_platform,
  add column if not exists payment_method public.nama_platform not null default 'cash',
  add column if not exists payment_customer text,
  add column if not exists payment_supplier text,
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

alter table public.transaksi_logistik
  add column if not exists payment_method public.nama_platform;

alter table public.transaksi_dompet
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists source_ref text;

create index if not exists idx_transaksi_dompet_source
on public.transaksi_dompet (source_type, source_id);

create or replace function public.create_accessory_transaction_atomic(
  p_transaction jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
  v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
  v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
  v_no_transaksi text := p_transaction->>'no_transaksi';
  v_method public.metode_bayar := coalesce(nullif(p_transaction->>'metode_bayar', ''), 'cash')::public.metode_bayar;
  v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
  v_total integer := coalesce((p_transaction->>'total_bayar')::numeric::integer, 0);
  v_uang_diterima integer := coalesce((p_transaction->>'uang_diterima')::numeric::integer, v_total);
  v_kembalian integer := coalesce((p_transaction->>'kembalian')::numeric::integer, 0);
  v_payments jsonb := p_transaction->'payments';
  v_payment jsonb;
  v_payment_method text;
  v_payment_amount integer;
  v_payment_total integer := 0;
  v_item jsonb;
  v_produk public.produk%rowtype;
  v_qty integer;
  v_harga_satuan integer;
  v_subtotal integer;
  v_items_total integer := 0;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
    raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
  end if;

  perform 1
  from public.shifts s
  where s.id = v_shift_id
    and s.cashier_id = v_kasir_id
    and s.status = 'active'::public.shift_status
  for update;

  if not found then
    raise exception 'Mulai shift dulu sebelum menyimpan transaksi.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang masih kosong.';
  end if;

  if jsonb_typeof(v_payments) <> 'array' or jsonb_array_length(v_payments) = 0 then
    v_payments := jsonb_build_array(
      jsonb_build_object('method', v_method::text, 'amount', v_total)
    );
  end if;

  for v_payment in select value from jsonb_array_elements(v_payments)
  loop
    v_payment_method := coalesce(nullif(v_payment->>'method', ''), v_method::text);
    v_payment_amount := coalesce((v_payment->>'amount')::numeric::integer, 0);

    if v_payment_amount <= 0 then
      raise exception 'Nominal pembayaran harus lebih besar dari 0.';
    end if;

    perform v_payment_method::public.nama_platform;
    v_payment_total := v_payment_total + v_payment_amount;
  end loop;

  if v_payment_total <> v_total then
    raise exception 'Total pembayaran harus sama dengan total transaksi.';
  end if;

  insert into public.transaksi (
    id,
    kasir_id,
    shift_id,
    no_transaksi,
    total_bayar,
    uang_diterima,
    kembalian,
    metode_bayar,
    payments,
    catatan,
    created_at
  )
  values (
    v_transaction_id,
    v_kasir_id,
    v_shift_id,
    v_no_transaksi,
    v_total,
    v_uang_diterima,
    v_kembalian,
    v_method,
    v_payments,
    p_transaction->>'catatan',
    v_created_at
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item->>'qty')::numeric::integer, 0);
    v_harga_satuan := coalesce((v_item->>'harga_satuan')::numeric::integer, 0);
    v_subtotal := coalesce((v_item->>'subtotal')::numeric::integer, 0);

    if v_qty <= 0 then
      raise exception 'Qty item transaksi harus lebih besar dari 0.';
    end if;

    if v_harga_satuan < 0 or v_subtotal <> v_qty * v_harga_satuan then
      raise exception 'Subtotal item transaksi tidak valid.';
    end if;

    select *
    into v_produk
    from public.produk
    where id = (v_item->>'produk_id')::uuid
    for update;

    if not found then
      raise exception 'Produk tidak ditemukan.';
    end if;

    if coalesce(v_produk.aktif, true) is false then
      raise exception 'Produk % tidak aktif.', v_produk.nama;
    end if;

    if v_produk.stok < v_qty then
      raise exception 'Stok % tidak cukup. Sisa stok %.', v_produk.nama, v_produk.stok;
    end if;

    insert into public.item_transaksi (
      id,
      transaksi_id,
      produk_id,
      nama_produk,
      qty,
      harga_satuan,
      subtotal
    )
    values (
      coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()),
      v_transaction_id,
      v_produk.id,
      coalesce(nullif(v_item->>'nama_produk', ''), v_produk.nama),
      v_qty,
      v_harga_satuan,
      v_subtotal
    );

    update public.produk
    set stok = stok - v_qty
    where id = v_produk.id;

    insert into public.stok_mutasi (
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
      v_produk.id,
      'keluar'::public.stock_mutation_type,
      -v_qty,
      v_produk.stok,
      v_produk.stok - v_qty,
      v_no_transaksi,
      'Penjualan aksesoris',
      v_created_at
    );

    v_items_total := v_items_total + v_subtotal;
  end loop;

  if v_items_total <> v_total then
    raise exception 'Total item tidak sama dengan total transaksi.';
  end if;

  for v_payment in select value from jsonb_array_elements(v_payments)
  loop
    v_payment_method := coalesce(nullif(v_payment->>'method', ''), v_method::text);
    v_payment_amount := coalesce((v_payment->>'amount')::numeric::integer, 0);

    if v_payment_method = 'qris' then
      perform public.pos_insert_wallet_movement(
        v_kasir_id,
        'qris'::public.nama_platform,
        'masuk'::public.jenis_dompet_trx,
        v_payment_amount,
        0,
        null,
        'Pembayaran QRIS aksesoris ' || v_no_transaksi,
        'accessory_sale',
        v_transaction_id,
        v_no_transaksi,
        v_created_at
      );
    end if;
  end loop;

  v_result := (
    select to_jsonb(t) || jsonb_build_object(
      'items',
      coalesce(
        (
          select jsonb_agg(to_jsonb(i) order by i.id)
          from public.item_transaksi i
          where i.transaksi_id = t.id
        ),
        '[]'::jsonb
      )
    )
    from public.transaksi t
    where t.id = v_transaction_id
  );

  return v_result;
end;
$$;

create or replace function public.create_digital_transaction_atomic(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
  v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
  v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
  v_no_transaksi text := p_transaction->>'no_transaksi';
  v_jenis public.jenis_digital := (p_transaction->>'jenis')::public.jenis_digital;
  v_is_product_service boolean := (p_transaction->>'jenis') in (
    'pulsa',
    'kuota',
    'voucher_game',
    'token_listrik'
  );
  v_is_direct_service boolean := (p_transaction->>'jenis') in ('transfer_bank', 'transfer_ewallet');
  v_payment_method public.nama_platform := coalesce(nullif(p_transaction->>'payment_method', ''), 'cash')::public.nama_platform;
  v_payment_customer text := coalesce(nullif(p_transaction->>'payment_customer', ''), v_payment_method::text);
  v_payment_supplier text := coalesce(
    nullif(p_transaction->>'payment_supplier', ''),
    case when v_is_product_service then 'pasar_kuota' else null end
  );
  v_source_platform public.nama_platform := case
    when v_is_product_service then 'pasar_kuota'::public.nama_platform
    else null
  end;
  v_nominal integer := coalesce(nullif(p_transaction->>'nominal', '')::numeric::integer, 0);
  v_admin_fee integer := coalesce(
    nullif(p_transaction->>'admin_fee', '')::numeric::integer,
    nullif(p_transaction->>'biaya_admin', '')::numeric::integer,
    0
  );
  v_total integer := coalesce(
    nullif(p_transaction->>'total', '')::numeric::integer,
    nullif(p_transaction->>'harga_jual', '')::numeric::integer,
    nullif(p_transaction->>'selling_price', '')::numeric::integer,
    v_nominal + v_admin_fee
  );
  v_harga_jual integer := coalesce(
    nullif(p_transaction->>'selling_price', '')::numeric::integer,
    nullif(p_transaction->>'harga_jual', '')::numeric::integer,
    v_total
  );
  v_modal integer := coalesce(
    nullif(p_transaction->>'cost', '')::numeric::integer,
    nullif(p_transaction->>'modal', '')::numeric::integer,
    case when v_is_direct_service then v_nominal + v_admin_fee else 0 end
  );
  v_profit integer := coalesce(
    nullif(p_transaction->>'profit', '')::numeric::integer,
    v_harga_jual - v_modal
  );
  v_wallet_deduction integer := case when v_is_product_service then v_modal else 0 end;
  v_transfer_platform text := coalesce(
    nullif(p_transaction->>'transfer_platform', ''),
    nullif(p_transaction->>'platform', ''),
    p_transaction->>'provider'
  );
  v_target_number text := coalesce(
    nullif(p_transaction->>'target_number', ''),
    p_transaction->>'nomor_tujuan'
  );
  v_receiver_name text := coalesce(
    nullif(p_transaction->>'receiver_name', ''),
    nullif(p_transaction->>'customer_name', ''),
    p_transaction->>'nama_tujuan'
  );
  v_service_product_id uuid := nullif(p_transaction->>'service_product_id', '')::uuid;
  v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
    raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
  end if;

  perform 1
  from public.shifts s
  where s.id = v_shift_id
    and s.cashier_id = v_kasir_id
    and s.status = 'active'::public.shift_status
  for update;

  if not found then
    raise exception 'Mulai shift dulu sebelum menyimpan transaksi layanan.';
  end if;

  if v_harga_jual <= 0 then
    raise exception 'Selling price wajib lebih besar dari 0.';
  end if;

  if v_modal < 0 then
    raise exception 'Modal tidak boleh negatif.';
  end if;

  if v_is_product_service and v_modal <= 0 then
    raise exception 'Modal layanan wajib lebih besar dari 0 agar saldo PASAR KUOTA dapat dipotong.';
  end if;

  if coalesce(v_target_number, '') = '' then
    raise exception 'Nomor tujuan wajib diisi.';
  end if;

  if v_is_direct_service then
    if coalesce(v_transfer_platform, '') = '' then
      raise exception 'Platform wajib dipilih.';
    end if;

    if v_nominal <= 0 then
      raise exception 'Nominal wajib lebih besar dari 0.';
    end if;

    if v_admin_fee < 0 then
      raise exception 'Biaya admin tidak boleh negatif.';
    end if;
  end if;

  if v_is_product_service then
    perform public.pos_assert_wallet_balance(v_source_platform, v_wallet_deduction);
  end if;

  insert into public.transaksi_digital (
    id,
    kasir_id,
    shift_id,
    no_transaksi,
    jenis,
    provider,
    nomor_tujuan,
    nama_tujuan,
    platform_sumber,
    payment_method,
    payment_customer,
    payment_supplier,
    nominal,
    harga_jual,
    modal,
    catatan,
    service_product_id,
    selling_price,
    cost,
    profit,
    target_number,
    customer_name,
    transfer_platform,
    admin_fee,
    total,
    receiver_name,
    transaction_items,
    transaction_details,
    created_at
  )
  values (
    v_transaction_id,
    v_kasir_id,
    v_shift_id,
    v_no_transaksi,
    v_jenis,
    coalesce(nullif(p_transaction->>'provider', ''), v_transfer_platform),
    v_target_number,
    v_receiver_name,
    v_source_platform,
    v_payment_method,
    v_payment_customer,
    v_payment_supplier,
    v_nominal,
    v_harga_jual,
    v_modal,
    p_transaction->>'catatan',
    v_service_product_id,
    v_harga_jual,
    v_modal,
    v_profit,
    v_target_number,
    v_receiver_name,
    v_transfer_platform,
    v_admin_fee,
    v_total,
    v_receiver_name,
    coalesce(p_transaction->'transaction_items', '[]'::jsonb),
    coalesce(p_transaction->'transaction_details', '{}'::jsonb)
      || jsonb_build_object(
        'mode', case when v_is_direct_service then 'direct_service' else 'product_service' end,
        'platform', v_transfer_platform,
        'nominal', v_nominal,
        'admin_fee', v_admin_fee,
        'total', v_total,
        'selling_price', v_harga_jual,
        'cost', v_modal,
        'profit', v_profit,
        'target_number', v_target_number,
        'receiver_name', v_receiver_name,
        'payment_method', v_payment_method::text,
        'payment_customer', v_payment_customer,
        'payment_supplier', v_payment_supplier,
        'source_platform', case when v_source_platform is null then null else v_source_platform::text end,
        'pasar_kuota_deduction', v_wallet_deduction,
        'qris_auto_inflow', v_payment_method::text = 'qris'
      ),
    v_created_at
  );

  if v_is_product_service then
    perform public.pos_insert_wallet_movement(
      v_kasir_id,
      v_source_platform,
      'keluar'::public.jenis_dompet_trx,
      v_wallet_deduction,
      0,
      null,
      'Pembayaran layanan PASAR KUOTA ' || v_no_transaksi,
      'digital_service_payment',
      v_transaction_id,
      v_no_transaksi,
      v_created_at
    );
  end if;

  if v_payment_method::text = 'qris' and v_harga_jual > 0 then
    perform public.pos_insert_wallet_movement(
      v_kasir_id,
      'qris'::public.nama_platform,
      'masuk'::public.jenis_dompet_trx,
      v_harga_jual,
      0,
      null,
      'Pembayaran QRIS layanan ' || v_no_transaksi,
      'digital_sale',
      v_transaction_id,
      v_no_transaksi,
      v_created_at
    );
  end if;

  v_result := (
    select to_jsonb(digital_row)
    from public.transaksi_digital as digital_row
    where digital_row.id = v_transaction_id
  );

  return v_result;
end;
$$;

create or replace function public.create_logistics_transaction_atomic(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_transaction_id uuid := coalesce(nullif(p_transaction->>'id', '')::uuid, gen_random_uuid());
  v_kasir_id uuid := (p_transaction->>'kasir_id')::uuid;
  v_shift_id uuid := (p_transaction->>'shift_id')::uuid;
  v_no_transaksi text := p_transaction->>'no_transaksi';
  v_payment_method public.nama_platform := coalesce(nullif(p_transaction->>'payment_method', ''), 'cash')::public.nama_platform;
  v_price integer := coalesce((p_transaction->>'price')::numeric::integer, (p_transaction->>'harga_jual')::numeric::integer, 0);
  v_modal integer := coalesce((p_transaction->>'modal')::numeric::integer, 0);
  v_created_at timestamptz := coalesce(nullif(p_transaction->>'created_at', '')::timestamptz, now());
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role and v_kasir_id <> v_user_id then
    raise exception 'Kasir tidak berwenang menyimpan transaksi ini.';
  end if;

  perform 1
  from public.shifts s
  where s.id = v_shift_id
    and s.cashier_id = v_kasir_id
    and s.status = 'active'::public.shift_status
  for update;

  if not found then
    raise exception 'Mulai shift dulu sebelum menyimpan transaksi logistik.';
  end if;

  insert into public.transaksi_logistik (
    id,
    kasir_id,
    shift_id,
    no_transaksi,
    ekspedisi,
    harga_jual,
    modal,
    no_resi,
    catatan,
    created_at,
    type,
    sender_name,
    receiver_name,
    destination,
    package_type,
    weight,
    price,
    payment_method
  )
  values (
    v_transaction_id,
    v_kasir_id,
    v_shift_id,
    v_no_transaksi,
    p_transaction->>'ekspedisi',
    v_price,
    v_modal,
    p_transaction->>'no_resi',
    p_transaction->>'catatan',
    v_created_at,
    coalesce(nullif(p_transaction->>'type', ''), 'logistik'),
    p_transaction->>'sender_name',
    p_transaction->>'receiver_name',
    p_transaction->>'destination',
    p_transaction->>'package_type',
    coalesce((p_transaction->>'weight')::numeric, 0),
    v_price,
    v_payment_method
  );

  if v_payment_method::text = 'qris' and v_price > 0 then
    perform public.pos_insert_wallet_movement(
      v_kasir_id,
      'qris'::public.nama_platform,
      'masuk'::public.jenis_dompet_trx,
      v_price,
      0,
      null,
      'Pembayaran QRIS logistik ' || v_no_transaksi,
      'logistics_sale',
      v_transaction_id,
      v_no_transaksi,
      v_created_at
    );
  end if;

  v_result := (
    select to_jsonb(logistics_row)
    from public.transaksi_logistik as logistics_row
    where logistics_row.id = v_transaction_id
  );

  return v_result;
end;
$$;

grant execute on function public.create_accessory_transaction_atomic(jsonb, jsonb) to authenticated;
grant execute on function public.create_digital_transaction_atomic(jsonb) to authenticated;
grant execute on function public.create_logistics_transaction_atomic(jsonb) to authenticated;

-- Backfill QRIS payments from existing transactions that were saved before this repair.
-- The source_type/source_id check keeps this safe to rerun.
with accessory_qris as (
  select
    t.id,
    t.kasir_id,
    t.no_transaksi,
    t.created_at,
    coalesce(
      nullif(
        (
          select coalesce(
            sum(coalesce(nullif(payment_item.value->>'amount', '')::numeric::integer, 0)),
            0
          )
          from jsonb_array_elements(
            case
              when jsonb_typeof(coalesce(t.payments, '[]'::jsonb)) = 'array'
                then coalesce(t.payments, '[]'::jsonb)
              else '[]'::jsonb
            end
          ) as payment_item(value)
          where coalesce(nullif(payment_item.value->>'method', ''), t.metode_bayar::text) = 'qris'
        ),
        0
      ),
      case when t.metode_bayar::text = 'qris' then coalesce(t.total_bayar, 0) else 0 end
    ) as amount
  from public.transaksi as t
)
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
select
  gen_random_uuid(),
  q.kasir_id,
  'qris'::public.nama_platform,
  'masuk'::public.jenis_dompet_trx,
  null,
  q.amount,
  0,
  'Pembayaran QRIS aksesoris ' || q.no_transaksi,
  'accessory_sale',
  q.id,
  q.no_transaksi,
  q.created_at
from accessory_qris as q
where q.amount > 0
  and not exists (
    select 1
    from public.transaksi_dompet as wallet_row
    where wallet_row.source_type = 'accessory_sale'
      and wallet_row.source_id = q.id
      and wallet_row.platform = 'qris'::public.nama_platform
      and wallet_row.jenis = 'masuk'::public.jenis_dompet_trx
  );

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
select
  gen_random_uuid(),
  d.kasir_id,
  'qris'::public.nama_platform,
  'masuk'::public.jenis_dompet_trx,
  null,
  coalesce(d.selling_price, d.harga_jual, d.total, d.nominal, 0),
  0,
  'Pembayaran QRIS layanan ' || d.no_transaksi,
  'digital_sale',
  d.id,
  d.no_transaksi,
  d.created_at
from public.transaksi_digital as d
where d.payment_method::text = 'qris'
  and coalesce(d.selling_price, d.harga_jual, d.total, d.nominal, 0) > 0
  and not exists (
    select 1
    from public.transaksi_dompet as wallet_row
    where wallet_row.source_type = 'digital_sale'
      and wallet_row.source_id = d.id
      and wallet_row.platform = 'qris'::public.nama_platform
      and wallet_row.jenis = 'masuk'::public.jenis_dompet_trx
  );

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
select
  gen_random_uuid(),
  l.kasir_id,
  'qris'::public.nama_platform,
  'masuk'::public.jenis_dompet_trx,
  null,
  coalesce(l.price, l.harga_jual, 0),
  0,
  'Pembayaran QRIS logistik ' || l.no_transaksi,
  'logistics_sale',
  l.id,
  l.no_transaksi,
  l.created_at
from public.transaksi_logistik as l
where l.payment_method::text = 'qris'
  and coalesce(l.price, l.harga_jual, 0) > 0
  and not exists (
    select 1
    from public.transaksi_dompet as wallet_row
    where wallet_row.source_type = 'logistics_sale'
      and wallet_row.source_id = l.id
      and wallet_row.platform = 'qris'::public.nama_platform
      and wallet_row.jenis = 'masuk'::public.jenis_dompet_trx
  );

notify pgrst, 'reload schema';

-- ============================================================
-- 20260419_99_zz_global_sales_report_item_snapshots.sql
-- ============================================================
-- 20260419_99_zz_global_sales_report_item_snapshots.sql
-- Global Sales Report transaction-only snapshots for accessory sale items.
-- These fields are used for reporting only and do not read from wallet/saldo tables.

alter table public.item_transaksi
  add column if not exists category text,
  add column if not exists provider text,
  add column if not exists selling_price integer,
  add column if not exists cost integer,
  add column if not exists profit integer;

update public.item_transaksi as item
set
  category = coalesce(nullif(item.category, ''), product.kategori, 'Aksesoris'),
  provider = coalesce(nullif(item.provider, ''), to_jsonb(product)->>'provider'),
  selling_price = coalesce(item.selling_price, item.subtotal, item.harga_satuan * item.qty, 0),
  cost = coalesce(item.cost, coalesce(product.harga_beli, 0) * item.qty, 0),
  profit = coalesce(
    item.profit,
    coalesce(item.selling_price, item.subtotal, item.harga_satuan * item.qty, 0)
      - coalesce(item.cost, coalesce(product.harga_beli, 0) * item.qty, 0)
  )
from public.produk as product
where item.produk_id = product.id;

update public.item_transaksi
set
  category = coalesce(nullif(category, ''), 'Aksesoris'),
  selling_price = coalesce(selling_price, subtotal, harga_satuan * qty, 0),
  cost = coalesce(cost, 0),
  profit = coalesce(profit, coalesce(selling_price, subtotal, harga_satuan * qty, 0) - coalesce(cost, 0));

alter table public.item_transaksi
  alter column selling_price set default 0,
  alter column selling_price set not null,
  alter column cost set default 0,
  alter column cost set not null,
  alter column profit set default 0,
  alter column profit set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'item_transaksi_selling_price_check'
      and conrelid = 'public.item_transaksi'::regclass
  ) then
    alter table public.item_transaksi
      add constraint item_transaksi_selling_price_check check (selling_price >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'item_transaksi_cost_check'
      and conrelid = 'public.item_transaksi'::regclass
  ) then
    alter table public.item_transaksi
      add constraint item_transaksi_cost_check check (cost >= 0);
  end if;
end;
$$;

create or replace function public.populate_item_transaksi_report_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_product jsonb := '{}'::jsonb;
  v_qty integer := 0;
  v_harga_satuan integer := 0;
  v_subtotal integer := 0;
  v_unit_cost integer := 0;
begin
  if new.produk_id is not null then
    select to_jsonb(product_row)
    into v_product
    from public.produk as product_row
    where product_row.id = new.produk_id;
  end if;

  v_product := coalesce(v_product, '{}'::jsonb);
  v_qty := coalesce(new.qty, 0);
  v_harga_satuan := coalesce(new.harga_satuan, 0);
  v_subtotal := coalesce(new.subtotal, v_harga_satuan * v_qty, 0);
  v_unit_cost := coalesce((nullif(v_product->>'harga_beli', ''))::numeric::integer, 0);

  new.category := coalesce(
    nullif(new.category, ''),
    nullif(v_product->>'kategori', ''),
    'Aksesoris'
  );
  new.provider := nullif(
    coalesce(
      nullif(new.provider, ''),
      nullif(v_product->>'provider', '')
    ),
    ''
  );

  if new.selling_price is null or new.selling_price <= 0 then
    new.selling_price := v_subtotal;
  end if;

  if new.cost is null or new.cost < 0 or (new.cost = 0 and v_unit_cost > 0 and v_qty > 0) then
    new.cost := v_unit_cost * v_qty;
  end if;

  if new.profit is null or (new.profit = 0 and new.selling_price - new.cost <> 0) then
    new.profit := new.selling_price - new.cost;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_item_transaksi_report_fields on public.item_transaksi;

create trigger trg_item_transaksi_report_fields
before insert or update of produk_id, qty, harga_satuan, subtotal, category, provider, selling_price, cost, profit
on public.item_transaksi
for each row
execute function public.populate_item_transaksi_report_fields();

create index if not exists idx_item_transaksi_report_category
on public.item_transaksi (category);

notify pgrst, 'reload schema';

-- ============================================================
-- 20260420_01_delete_service_product_atomic.sql
-- ============================================================
-- 20260420_01_delete_service_product_atomic.sql
-- Add owner-only service product deletion while preserving old digital transactions.

do $$
declare
  constraint_record record;
begin
  if to_regclass('public.transaksi_digital') is not null
    and to_regclass('public.services_products') is not null
  then
    alter table public.transaksi_digital
      add column if not exists service_product_id uuid;

    update public.transaksi_digital as transaction_row
    set service_product_id = null
    where transaction_row.service_product_id is not null
      and not exists (
        select 1
        from public.services_products as service_product
        where service_product.id = transaction_row.service_product_id
      );

    for constraint_record in
      select constraint_info.conname
      from pg_constraint as constraint_info
      join pg_attribute as attribute_info
        on attribute_info.attrelid = constraint_info.conrelid
       and attribute_info.attnum = any(constraint_info.conkey)
      where constraint_info.conrelid = 'public.transaksi_digital'::regclass
        and constraint_info.confrelid = 'public.services_products'::regclass
        and constraint_info.contype = 'f'
        and attribute_info.attname = 'service_product_id'
    loop
      execute format(
        'alter table public.transaksi_digital drop constraint %I',
        constraint_record.conname
      );
    end loop;

    alter table public.transaksi_digital
      add constraint transaksi_digital_service_product_id_fkey
      foreign key (service_product_id)
      references public.services_products(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.product_activity_logs') is not null then
    alter table public.product_activity_logs
      drop constraint if exists product_activity_logs_action_check;

    alter table public.product_activity_logs
      add constraint product_activity_logs_action_check
      check (
        action in (
          'create_product',
          'edit_product',
          'toggle_product_status',
          'delete_product',
          'restore_product',
          'permanent_delete_product',
          'update_stock',
          'create_service_product',
          'update_service_product',
          'disable_service_product',
          'delete_service_product',
          'legacy_product_activity'
        )
      );
  end if;
end $$;

create or replace function public.delete_service_product_atomic(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.services_products%rowtype;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if public.current_user_role() <> 'pemilik'::public.user_role then
    raise exception 'Hanya owner yang dapat menghapus layanan digital.';
  end if;

  select *
  into v_row
  from public.services_products
  where id = p_id
  for update;

  if not found then
    raise exception 'Layanan tidak ditemukan.';
  end if;

  v_snapshot := to_jsonb(v_row);

  insert into public.product_activity_logs (
    product_id,
    action,
    actor_id,
    details,
    product_snapshot,
    created_at
  )
  values (
    null,
    'delete_service_product',
    v_user_id,
    jsonb_build_object(
      'service_product_id', v_row.id,
      'deleted_at', now(),
      'before', v_snapshot
    ),
    v_snapshot,
    now()
  );

  delete from public.services_products
  where id = p_id;

  return v_snapshot;
end;
$$;

grant execute on function public.delete_service_product_atomic(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- 20260420_02_transaction_recycle_bin.sql
-- ============================================================
alter table if exists public.transaksi
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id);

alter table if exists public.transaksi_digital
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id);

alter table if exists public.transaksi_logistik
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id);

alter table if exists public.transaksi_dompet
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id);

alter table if exists public.kas
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id);

create index if not exists idx_transaksi_deleted_at
on public.transaksi (deleted_at)
where deleted_at is not null;

create index if not exists idx_transaksi_digital_deleted_at
on public.transaksi_digital (deleted_at)
where deleted_at is not null;

create index if not exists idx_transaksi_logistik_deleted_at
on public.transaksi_logistik (deleted_at)
where deleted_at is not null;

create index if not exists idx_transaksi_dompet_deleted_at
on public.transaksi_dompet (deleted_at)
where deleted_at is not null;

create index if not exists idx_kas_deleted_at
on public.kas (deleted_at)
where deleted_at is not null;

grant select, insert, update, delete on public.transaksi to authenticated;
grant select, insert, update, delete on public.transaksi_digital to authenticated;
grant select, insert, update, delete on public.transaksi_logistik to authenticated;
grant select, insert, update, delete on public.transaksi_dompet to authenticated;
grant select, insert, update, delete on public.kas to authenticated;

create or replace function public.soft_delete_transaction_history(p_source text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if public.current_user_role() is distinct from 'pemilik'::public.user_role then
    raise exception 'Hanya owner yang dapat menghapus riwayat transaksi.';
  end if;

  case p_source
    when 'aksesoris' then
      update public.transaksi as trx
      set deleted_at = coalesce(deleted_at, now()),
          deleted_by = coalesce(deleted_by, v_user_id)
      where trx.id = p_id
      returning to_jsonb(trx) into v_result;
    when 'digital' then
      update public.transaksi_digital as trx
      set deleted_at = coalesce(deleted_at, now()),
          deleted_by = coalesce(deleted_by, v_user_id)
      where trx.id = p_id
      returning to_jsonb(trx) into v_result;
    when 'logistik' then
      update public.transaksi_logistik as trx
      set deleted_at = coalesce(deleted_at, now()),
          deleted_by = coalesce(deleted_by, v_user_id)
      where trx.id = p_id
      returning to_jsonb(trx) into v_result;
    when 'saldo' then
      update public.transaksi_dompet as trx
      set deleted_at = coalesce(deleted_at, now()),
          deleted_by = coalesce(deleted_by, v_user_id)
      where trx.id = p_id
      returning to_jsonb(trx) into v_result;
    when 'operasional' then
      update public.kas as trx
      set deleted_at = coalesce(deleted_at, now()),
          deleted_by = coalesce(deleted_by, v_user_id)
      where trx.id = p_id
      returning to_jsonb(trx) into v_result;
    else
      raise exception 'Sumber transaksi tidak valid.';
  end case;

  if v_result is null then
    raise exception 'Transaksi tidak ditemukan.';
  end if;

  return v_result;
end;
$$;

create or replace function public.restore_transaction_history(p_source text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if public.current_user_role() is distinct from 'pemilik'::public.user_role then
    raise exception 'Hanya owner yang dapat restore riwayat transaksi.';
  end if;

  case p_source
    when 'aksesoris' then
      update public.transaksi as trx
      set deleted_at = null,
          deleted_by = null
      where trx.id = p_id
        and trx.deleted_at is not null
      returning to_jsonb(trx) into v_result;
    when 'digital' then
      update public.transaksi_digital as trx
      set deleted_at = null,
          deleted_by = null
      where trx.id = p_id
        and trx.deleted_at is not null
      returning to_jsonb(trx) into v_result;
    when 'logistik' then
      update public.transaksi_logistik as trx
      set deleted_at = null,
          deleted_by = null
      where trx.id = p_id
        and trx.deleted_at is not null
      returning to_jsonb(trx) into v_result;
    when 'saldo' then
      update public.transaksi_dompet as trx
      set deleted_at = null,
          deleted_by = null
      where trx.id = p_id
        and trx.deleted_at is not null
      returning to_jsonb(trx) into v_result;
    when 'operasional' then
      update public.kas as trx
      set deleted_at = null,
          deleted_by = null
      where trx.id = p_id
        and trx.deleted_at is not null
      returning to_jsonb(trx) into v_result;
    else
      raise exception 'Sumber transaksi tidak valid.';
  end case;

  if v_result is null then
    raise exception 'Transaksi terhapus tidak ditemukan.';
  end if;

  return v_result;
end;
$$;

create or replace function public.permanently_delete_transaction_history(p_source text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if public.current_user_role() is distinct from 'pemilik'::public.user_role then
    raise exception 'Hanya owner yang dapat menghapus permanen riwayat transaksi.';
  end if;

  case p_source
    when 'aksesoris' then
      delete from public.transaksi as trx
      where trx.id = p_id
        and trx.deleted_at is not null
      returning to_jsonb(trx) into v_result;
    when 'digital' then
      delete from public.transaksi_digital as trx
      where trx.id = p_id
        and trx.deleted_at is not null
      returning to_jsonb(trx) into v_result;
    when 'logistik' then
      delete from public.transaksi_logistik as trx
      where trx.id = p_id
        and trx.deleted_at is not null
      returning to_jsonb(trx) into v_result;
    when 'saldo' then
      delete from public.transaksi_dompet as trx
      where trx.id = p_id
        and trx.deleted_at is not null
      returning to_jsonb(trx) into v_result;
    when 'operasional' then
      delete from public.kas as trx
      where trx.id = p_id
        and trx.deleted_at is not null
      returning to_jsonb(trx) into v_result;
    else
      raise exception 'Sumber transaksi tidak valid.';
  end case;

  if v_result is null then
    raise exception 'Transaksi terhapus tidak ditemukan.';
  end if;

  return v_result;
end;
$$;

create or replace function public.purge_expired_deleted_transactions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted_count integer := 0;
  v_row_count integer := 0;
begin
  if v_user_id is null then
    return 0;
  end if;

  if public.current_user_role() is distinct from 'pemilik'::public.user_role then
    return 0;
  end if;

  delete from public.transaksi
  where deleted_at < now() - interval '30 days';
  get diagnostics v_row_count = row_count;
  v_deleted_count := v_deleted_count + v_row_count;

  delete from public.transaksi_digital
  where deleted_at < now() - interval '30 days';
  get diagnostics v_row_count = row_count;
  v_deleted_count := v_deleted_count + v_row_count;

  delete from public.transaksi_logistik
  where deleted_at < now() - interval '30 days';
  get diagnostics v_row_count = row_count;
  v_deleted_count := v_deleted_count + v_row_count;

  delete from public.transaksi_dompet
  where deleted_at < now() - interval '30 days';
  get diagnostics v_row_count = row_count;
  v_deleted_count := v_deleted_count + v_row_count;

  delete from public.kas
  where deleted_at < now() - interval '30 days';
  get diagnostics v_row_count = row_count;
  v_deleted_count := v_deleted_count + v_row_count;

  return v_deleted_count;
end;
$$;

grant execute on function public.soft_delete_transaction_history(text, uuid) to authenticated;
grant execute on function public.restore_transaction_history(text, uuid) to authenticated;
grant execute on function public.permanently_delete_transaction_history(text, uuid) to authenticated;
grant execute on function public.purge_expired_deleted_transactions() to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- 20260420_03_stock_opname.sql
-- ============================================================
create extension if not exists pgcrypto;

create table if not exists public.stock_opname_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Semua kategori',
  status text not null default 'draft' check (status in ('draft', 'completed')),
  created_by uuid references auth.users(id),
  applied_by uuid references auth.users(id),
  total_products integer not null default 0 check (total_products >= 0),
  checked_products integer not null default 0 check (checked_products >= 0),
  total_minus integer not null default 0 check (total_minus >= 0),
  total_plus integer not null default 0 check (total_plus >= 0),
  total_loss numeric not null default 0 check (total_loss >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_opname_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.stock_opname_sessions(id) on delete cascade,
  product_id uuid references public.produk(id) on delete set null,
  product_name text not null,
  product_code text,
  category text not null,
  system_stock integer not null default 0 check (system_stock >= 0),
  real_stock integer check (real_stock is null or real_stock >= 0),
  difference integer not null default 0,
  note text not null default '',
  cost numeric not null default 0 check (cost >= 0),
  applied_delta integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, product_id)
);

create index if not exists idx_stock_opname_sessions_status
on public.stock_opname_sessions (status, created_at desc);

create index if not exists idx_stock_opname_items_session
on public.stock_opname_items (session_id, product_name);

alter table public.stock_opname_sessions enable row level security;
alter table public.stock_opname_items enable row level security;

drop policy if exists "owner read stock opname sessions" on public.stock_opname_sessions;
create policy "owner read stock opname sessions"
on public.stock_opname_sessions
for select
to authenticated
using (public.current_user_role() = 'pemilik');

drop policy if exists "owner manage stock opname sessions" on public.stock_opname_sessions;
create policy "owner manage stock opname sessions"
on public.stock_opname_sessions
for all
to authenticated
using (public.current_user_role() = 'pemilik')
with check (public.current_user_role() = 'pemilik');

drop policy if exists "owner read stock opname items" on public.stock_opname_items;
create policy "owner read stock opname items"
on public.stock_opname_items
for select
to authenticated
using (public.current_user_role() = 'pemilik');

drop policy if exists "owner manage stock opname items" on public.stock_opname_items;
create policy "owner manage stock opname items"
on public.stock_opname_items
for all
to authenticated
using (public.current_user_role() = 'pemilik')
with check (public.current_user_role() = 'pemilik');

create or replace function public.recalculate_stock_opname_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'User belum login.';
  end if;

  if public.current_user_role() is distinct from 'pemilik'::public.user_role then
    raise exception 'Stock Opname hanya bisa diakses owner.';
  end if;

  update public.stock_opname_sessions session_row
  set
    total_products = coalesce(summary.total_products, 0),
    checked_products = coalesce(summary.checked_products, 0),
    total_minus = coalesce(summary.total_minus, 0),
    total_plus = coalesce(summary.total_plus, 0),
    total_loss = coalesce(summary.total_loss, 0),
    updated_at = now()
  from (
    select
      count(*)::integer as total_products,
      count(*) filter (where real_stock is not null)::integer as checked_products,
      coalesce(sum(abs(difference)) filter (where real_stock is not null and difference < 0), 0)::integer as total_minus,
      coalesce(sum(difference) filter (where real_stock is not null and difference > 0), 0)::integer as total_plus,
      coalesce(sum(abs(difference) * cost) filter (where real_stock is not null and difference < 0), 0)::numeric as total_loss
    from public.stock_opname_items
    where session_id = p_session_id
  ) summary
  where session_row.id = p_session_id;
end;
$$;

create or replace function public.apply_stock_opname_session_atomic(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_session public.stock_opname_sessions%rowtype;
  v_item public.stock_opname_items%rowtype;
  v_product public.produk%rowtype;
  v_delta integer;
  v_reference text;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role is distinct from 'pemilik'::public.user_role then
    raise exception 'Stock Opname hanya bisa diterapkan owner.';
  end if;

  select *
  into v_session
  from public.stock_opname_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Sesi Stock Opname tidak ditemukan.';
  end if;

  if v_session.status = 'completed' then
    raise exception 'Sesi Stock Opname sudah selesai.';
  end if;

  if not exists (
    select 1
    from public.stock_opname_items
    where session_id = p_session_id
      and real_stock is not null
  ) then
    raise exception 'Isi minimal satu stok real sebelum menerapkan penyesuaian.';
  end if;

  v_reference := 'OPNAME-' || left(replace(p_session_id::text, '-', ''), 8);

  for v_item in
    select *
    from public.stock_opname_items
    where session_id = p_session_id
      and real_stock is not null
    order by product_name
  loop
    select *
    into v_product
    from public.produk
    where id = v_item.product_id
    for update;

    if not found or coalesce(v_product.status, 'active') = 'deleted' then
      continue;
    end if;

    v_delta := v_item.real_stock - v_product.stok;

    update public.stock_opname_items
    set
      difference = v_item.real_stock - v_item.system_stock,
      applied_delta = v_delta,
      updated_at = now()
    where id = v_item.id;

    if v_delta <> 0 then
      update public.produk
      set
        stok = v_item.real_stock,
        updated_at = now()
      where id = v_product.id;

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
        gen_random_uuid(),
        v_product.id,
        'penyesuaian'::public.stock_mutation_type,
        v_delta,
        v_product.stok,
        v_item.real_stock,
        v_reference,
        'Penyesuaian dari Stock Opname: ' || v_session.name,
        now()
      );
    end if;
  end loop;

  perform public.recalculate_stock_opname_session(p_session_id);

  update public.stock_opname_sessions
  set
    status = 'completed',
    applied_by = v_user_id,
    completed_at = now(),
    updated_at = now()
  where id = p_session_id;

  return (
    select to_jsonb(session_row)
    from public.stock_opname_sessions as session_row
    where session_row.id = p_session_id
  );
end;
$$;

grant execute on function public.recalculate_stock_opname_session(uuid) to authenticated;
grant execute on function public.apply_stock_opname_session_atomic(uuid) to authenticated;

notify pgrst, 'reload schema';

