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
