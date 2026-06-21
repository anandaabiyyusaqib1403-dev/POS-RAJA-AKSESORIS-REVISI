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
