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
