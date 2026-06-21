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
