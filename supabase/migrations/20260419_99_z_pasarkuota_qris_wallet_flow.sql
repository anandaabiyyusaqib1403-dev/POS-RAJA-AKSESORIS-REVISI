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

  if not public.is_shift_active_for_transaction(v_shift_id, v_kasir_id) then
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

  if not public.is_shift_active_for_transaction(v_shift_id, v_kasir_id) then
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

  if not public.is_shift_active_for_transaction(v_shift_id, v_kasir_id) then
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
