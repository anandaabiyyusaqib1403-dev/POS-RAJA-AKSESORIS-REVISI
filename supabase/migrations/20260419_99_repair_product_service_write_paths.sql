  -- 20260419_99_repair_product_service_write_paths.sql
  -- Final runtime repair for wallet mutations, product writes, stock mutations,
  -- service product writes, and PIN hashes.

  create extension if not exists pgcrypto;
  set search_path = public, extensions;

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
  set search_path = public, extensions
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
  set search_path = public, extensions
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
  set search_path = public, extensions
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
  set search_path = public, extensions
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
  set search_path = public, extensions
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
  set search_path = public, extensions
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
  set search_path = public, extensions
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
  set search_path = public, extensions
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
  set search_path = public, extensions
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
  set search_path = public, extensions
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
  set search_path = public, extensions
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
  set search_path = public, extensions
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
  set search_path = public, extensions
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
