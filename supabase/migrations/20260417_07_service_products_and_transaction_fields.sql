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
