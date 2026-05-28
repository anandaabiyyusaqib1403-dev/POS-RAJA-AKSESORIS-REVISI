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
