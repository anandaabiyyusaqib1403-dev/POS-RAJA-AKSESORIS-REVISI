-- Warranty claims reuse customer_returns/customer_return_items while making exchange stock impact atomic.

create or replace function public.create_warranty_claim_atomic(
  p_claim jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_claim_id uuid := coalesce(nullif(p_claim->>'id', '')::uuid, gen_random_uuid());
  v_transaction_id uuid := nullif(p_claim->>'transaction_id', '')::uuid;
  v_transaction public.transaksi%rowtype;
  v_existing_return public.customer_returns%rowtype;
  v_no_retur text := btrim(coalesce(p_claim->>'no_retur', ''));
  v_customer_name text := nullif(btrim(coalesce(p_claim->>'customer_name', '')), '');
  v_reason text := btrim(coalesce(p_claim->>'reason', 'lainnya'));
  v_condition text := btrim(coalesce(p_claim->>'condition', ''));
  v_notes text := nullif(p_claim->>'notes', '');
  v_outcome text := lower(btrim(coalesce(p_claim->>'warranty_outcome', 'exchange')));
  v_refund_method text;
  v_replacement_product_id uuid := nullif(p_claim->>'replacement_product_id', '')::uuid;
  v_replacement_product public.produk%rowtype;
  v_replacement_qty integer := coalesce(nullif(p_claim->>'replacement_quantity', '')::numeric::integer, 0);
  v_replacement_next_stock integer;
  v_item jsonb;
  v_transaction_item public.item_transaksi%rowtype;
  v_source_product public.produk%rowtype;
  v_source_product_found boolean;
  v_qty integer;
  v_already_claimed integer;
  v_unit_price integer;
  v_subtotal integer;
  v_total_qty integer := 0;
  v_total_refund integer := 0;
  v_return_row public.customer_returns%rowtype;
  v_result_items jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if public.current_user_role() is distinct from 'pemilik'::public.user_role then
    raise exception 'Hanya owner yang dapat membuat klaim garansi.';
  end if;

  select *
  into v_existing_return
  from public.customer_returns
  where id = v_claim_id;

  if found then
    select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at), '[]'::jsonb)
    into v_result_items
    from public.customer_return_items item
    where item.customer_return_id = v_existing_return.id;

    return to_jsonb(v_existing_return) || jsonb_build_object('items', v_result_items);
  end if;

  if v_outcome not in ('exchange', 'refund', 'rejected') then
    raise exception 'Hasil klaim garansi tidak valid.';
  end if;

  if v_transaction_id is null then
    raise exception 'Transaksi asal wajib dipilih.';
  end if;

  select *
  into v_transaction
  from public.transaksi
  where id = v_transaction_id;

  if not found then
    raise exception 'Transaksi asal tidak ditemukan.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu item wajib diklaim.';
  end if;

  if v_no_retur = '' then
    v_no_retur := 'GRS-' || to_char(now(), 'YYYYMMDD-HH24MISS');
  end if;

  if v_outcome = 'exchange' then
    if v_replacement_product_id is null then
      raise exception 'Produk pengganti wajib dipilih.';
    end if;

    if v_replacement_qty <= 0 then
      raise exception 'Qty produk pengganti wajib lebih besar dari 0.';
    end if;

    select *
    into v_replacement_product
    from public.produk
    where id = v_replacement_product_id
    for update;

    if not found then
      raise exception 'Produk pengganti tidak ditemukan.';
    end if;

    if coalesce(v_replacement_product.aktif, true) is false then
      raise exception 'Produk pengganti tidak aktif.';
    end if;

    if coalesce(v_replacement_product.stok, 0) < v_replacement_qty then
      raise exception 'Stok % tidak cukup untuk klaim garansi.', v_replacement_product.nama;
    end if;
  end if;

  if v_outcome = 'rejected' and coalesce(v_notes, '') = '' then
    raise exception 'Catatan wajib diisi saat klaim ditolak.';
  end if;

  v_refund_method := case
    when v_outcome = 'exchange' then 'warranty_exchange'
    when v_outcome = 'rejected' then 'warranty_rejected'
    else nullif(btrim(coalesce(p_claim->>'refund_method', '')), '')
  end;

  if v_outcome = 'refund' and coalesce(v_refund_method, '') = '' then
    v_refund_method := coalesce(nullif(v_transaction.metode_bayar, ''), 'cash');
  end if;

  insert into public.customer_returns (
    id,
    no_retur,
    transaction_id,
    transaction_no,
    customer_name,
    status,
    reason,
    condition,
    notes,
    total_quantity,
    total_refund_amount,
    refund_method,
    restock,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_claim_id,
    v_no_retur,
    v_transaction.id,
    v_transaction.no_transaksi,
    v_customer_name,
    'selesai',
    coalesce(nullif(v_reason, ''), 'lainnya'),
    v_condition,
    v_notes,
    0,
    0,
    v_refund_method,
    false,
    v_user_id,
    coalesce(nullif(p_claim->>'created_at', '')::timestamptz, now()),
    now()
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select *
    into v_transaction_item
    from public.item_transaksi
    where id = nullif(v_item->>'transaction_item_id', '')::uuid
      and transaksi_id = v_transaction.id;

    if not found then
      raise exception 'Item transaksi garansi tidak ditemukan.';
    end if;

    v_qty := coalesce(nullif(v_item->>'quantity', '')::numeric::integer, 0);
    if v_qty <= 0 then
      raise exception 'Qty klaim % wajib lebih besar dari 0.', v_transaction_item.nama_produk;
    end if;

    if v_outcome <> 'rejected' then
      select coalesce(sum(item.quantity), 0)
      into v_already_claimed
      from public.customer_return_items item
      join public.customer_returns claim on claim.id = item.customer_return_id
      where item.transaction_item_id = v_transaction_item.id
        and coalesce(claim.refund_method, '') <> 'warranty_rejected';

      if v_qty + v_already_claimed > v_transaction_item.qty then
        raise exception 'Qty klaim % melebihi qty transaksi.', v_transaction_item.nama_produk;
      end if;
    end if;

    select *
    into v_source_product
    from public.produk
    where id = v_transaction_item.produk_id;
    v_source_product_found := found;

    v_unit_price := greatest(
      0,
      coalesce(nullif(v_item->>'unit_price', '')::numeric::integer, v_transaction_item.harga_satuan, 0)
    );
    v_subtotal := case when v_outcome = 'refund' then v_unit_price * v_qty else 0 end;

    insert into public.customer_return_items (
      customer_return_id,
      transaction_item_id,
      product_id,
      product_name,
      product_code,
      category,
      quantity,
      unit_price,
      subtotal_refund,
      restock,
      condition,
      notes
    )
    values (
      v_claim_id,
      v_transaction_item.id,
      v_transaction_item.produk_id,
      v_transaction_item.nama_produk,
      case when v_source_product_found then v_source_product.kode_produk else null end,
      case when v_source_product_found then v_source_product.kategori else null end,
      v_qty,
      v_unit_price,
      v_subtotal,
      false,
      nullif(v_item->>'condition', ''),
      nullif(v_item->>'notes', '')
    );

    v_total_qty := v_total_qty + v_qty;
    v_total_refund := v_total_refund + v_subtotal;
  end loop;

  if v_outcome = 'exchange' then
    v_replacement_next_stock := coalesce(v_replacement_product.stok, 0) - v_replacement_qty;

    update public.produk
    set stok = v_replacement_next_stock
    where id = v_replacement_product.id;

    insert into public.stok_mutasi (
      produk_id,
      tipe,
      jumlah,
      stok_sebelum,
      stok_sesudah,
      referensi,
      catatan
    )
    values (
      v_replacement_product.id,
      'keluar',
      -v_replacement_qty,
      coalesce(v_replacement_product.stok, 0),
      v_replacement_next_stock,
      v_no_retur,
      'Pengganti klaim garansi konsumen dari transaksi ' || coalesce(v_transaction.no_transaksi, '')
    );

    if to_regclass('public.product_activity_logs') is not null then
      insert into public.product_activity_logs (
        product_id,
        action,
        actor_id,
        details,
        product_snapshot
      )
      values (
        v_replacement_product.id,
        'customer_return_created',
        v_user_id,
        jsonb_build_object(
          'warranty_claim_id', v_claim_id,
          'no_retur', v_no_retur,
          'transaction_id', v_transaction.id,
          'transaction_no', v_transaction.no_transaksi,
          'outcome', v_outcome,
          'replacement_quantity', v_replacement_qty,
          'stock_before', coalesce(v_replacement_product.stok, 0),
          'stock_after', v_replacement_next_stock
        ),
        to_jsonb(v_replacement_product) || jsonb_build_object('stok', v_replacement_next_stock)
      );
    end if;
  end if;

  update public.customer_returns
  set total_quantity = v_total_qty,
      total_refund_amount = v_total_refund,
      updated_at = now()
  where id = v_claim_id
  returning * into v_return_row;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at), '[]'::jsonb)
  into v_result_items
  from public.customer_return_items item
  where item.customer_return_id = v_return_row.id;

  return to_jsonb(v_return_row) || jsonb_build_object('items', v_result_items);
end;
$$;

revoke all on function public.create_warranty_claim_atomic(jsonb, jsonb) from public, anon;
grant execute on function public.create_warranty_claim_atomic(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
