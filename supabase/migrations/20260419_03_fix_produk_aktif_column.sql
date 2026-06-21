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
