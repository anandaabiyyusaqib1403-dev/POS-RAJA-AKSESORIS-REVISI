-- Supplier return workflow: stock-impacting returns from store to supplier.

create extension if not exists pgcrypto;

do $$
begin
  create type public.supplier_return_status as enum (
    'pending',
    'diganti_barang',
    'refund_uang',
    'potong_tagihan',
    'ditolak',
    'selesai'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists suppliers_name_unique
on public.suppliers (lower(btrim(name)));

create table if not exists public.supplier_returns (
  id uuid primary key default gen_random_uuid(),
  no_retur text not null,
  supplier_id uuid references public.suppliers(id),
  supplier_name text not null,
  status public.supplier_return_status not null default 'pending',
  reason text not null default 'lainnya',
  condition text not null default '',
  notes text,
  total_quantity integer not null default 0 check (total_quantity >= 0),
  total_estimated_value integer not null default 0 check (total_estimated_value >= 0),
  settlement_amount integer not null default 0 check (settlement_amount >= 0),
  settlement_method text,
  settlement_notes text,
  created_by uuid references auth.users(id),
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists supplier_returns_no_retur_unique
on public.supplier_returns (no_retur);

create index if not exists idx_supplier_returns_status
on public.supplier_returns (status, created_at desc);

create index if not exists idx_supplier_returns_supplier
on public.supplier_returns (supplier_name, created_at desc);

create table if not exists public.supplier_return_items (
  id uuid primary key default gen_random_uuid(),
  supplier_return_id uuid not null references public.supplier_returns(id) on delete cascade,
  product_id uuid references public.produk(id),
  product_name text not null,
  product_code text,
  category text,
  quantity integer not null check (quantity > 0),
  unit_cost integer not null default 0 check (unit_cost >= 0),
  subtotal_cost integer not null default 0 check (subtotal_cost >= 0),
  condition text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_supplier_return_items_return
on public.supplier_return_items (supplier_return_id);

create index if not exists idx_supplier_return_items_product
on public.supplier_return_items (product_id);

create table if not exists public.customer_returns (
  id uuid primary key default gen_random_uuid(),
  no_retur text not null,
  transaction_id uuid not null references public.transaksi(id),
  transaction_no text,
  customer_name text,
  status text not null default 'selesai' check (status in ('selesai')),
  reason text not null default 'lainnya',
  condition text not null default '',
  notes text,
  total_quantity integer not null default 0 check (total_quantity >= 0),
  total_refund_amount integer not null default 0 check (total_refund_amount >= 0),
  refund_method text,
  restock boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customer_returns_no_retur_unique
on public.customer_returns (no_retur);

create index if not exists idx_customer_returns_transaction
on public.customer_returns (transaction_id, created_at desc);

create table if not exists public.customer_return_items (
  id uuid primary key default gen_random_uuid(),
  customer_return_id uuid not null references public.customer_returns(id) on delete cascade,
  transaction_item_id uuid references public.item_transaksi(id),
  product_id uuid references public.produk(id),
  product_name text not null,
  product_code text,
  category text,
  quantity integer not null check (quantity > 0),
  unit_price integer not null default 0 check (unit_price >= 0),
  subtotal_refund integer not null default 0 check (subtotal_refund >= 0),
  restock boolean not null default true,
  condition text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_return_items_return
on public.customer_return_items (customer_return_id);

create index if not exists idx_customer_return_items_product
on public.customer_return_items (product_id);

alter table public.suppliers enable row level security;
alter table public.supplier_returns enable row level security;
alter table public.supplier_return_items enable row level security;
alter table public.customer_returns enable row level security;
alter table public.customer_return_items enable row level security;

drop policy if exists "owner manage suppliers" on public.suppliers;
create policy "owner manage suppliers"
on public.suppliers
for all
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role)
with check (public.current_user_role() = 'pemilik'::public.user_role);

drop policy if exists "owner manage supplier returns" on public.supplier_returns;
create policy "owner manage supplier returns"
on public.supplier_returns
for all
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role)
with check (public.current_user_role() = 'pemilik'::public.user_role);

drop policy if exists "owner manage supplier return items" on public.supplier_return_items;
create policy "owner manage supplier return items"
on public.supplier_return_items
for all
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role)
with check (public.current_user_role() = 'pemilik'::public.user_role);

grant select, insert, update on public.suppliers to authenticated;
grant select, insert, update on public.supplier_returns to authenticated;
grant select, insert on public.supplier_return_items to authenticated;
grant select, insert on public.customer_returns to authenticated;
grant select, insert on public.customer_return_items to authenticated;

drop policy if exists "owner manage customer returns" on public.customer_returns;
create policy "owner manage customer returns"
on public.customer_returns
for all
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role)
with check (public.current_user_role() = 'pemilik'::public.user_role);

drop policy if exists "owner manage customer return items" on public.customer_return_items;
create policy "owner manage customer return items"
on public.customer_return_items
for all
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role)
with check (public.current_user_role() = 'pemilik'::public.user_role);

alter table if exists public.product_activity_logs
  drop constraint if exists product_activity_logs_action_check;

alter table if exists public.product_activity_logs
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
      'supplier_return_created',
      'supplier_return_resolved',
      'customer_return_created',
      'create_service_product',
      'update_service_product',
      'disable_service_product',
      'delete_service_product',
      'legacy_product_activity'
    )
  );

create or replace function public.create_supplier_return_atomic(
  p_return jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_return_id uuid := coalesce(nullif(p_return->>'id', '')::uuid, gen_random_uuid());
  v_supplier_name text := btrim(coalesce(p_return->>'supplier_name', ''));
  v_supplier_id uuid;
  v_no_retur text := btrim(coalesce(p_return->>'no_retur', ''));
  v_reason text := btrim(coalesce(p_return->>'reason', 'lainnya'));
  v_condition text := btrim(coalesce(p_return->>'condition', ''));
  v_notes text := nullif(p_return->>'notes', '');
  v_item jsonb;
  v_product public.produk%rowtype;
  v_qty integer;
  v_unit_cost integer;
  v_subtotal integer;
  v_total_qty integer := 0;
  v_total_value integer := 0;
  v_next_stock integer;
  v_return_row public.supplier_returns%rowtype;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if public.current_user_role() is distinct from 'pemilik'::public.user_role then
    raise exception 'Hanya owner yang dapat membuat retur supplier.';
  end if;

  if v_supplier_name = '' then
    raise exception 'Supplier wajib diisi.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu produk wajib diretur.';
  end if;

  if v_no_retur = '' then
    v_no_retur := 'RTS-' || to_char(now(), 'YYYYMMDD-HH24MISS');
  end if;

  select id
  into v_supplier_id
  from public.suppliers
  where lower(btrim(name)) = lower(v_supplier_name)
  limit 1;

  if v_supplier_id is null then
    insert into public.suppliers (name, created_by)
    values (v_supplier_name, v_user_id)
    returning id into v_supplier_id;
  else
    update public.suppliers
    set name = v_supplier_name,
        updated_at = now()
    where id = v_supplier_id;
  end if;

  insert into public.supplier_returns (
    id,
    no_retur,
    supplier_id,
    supplier_name,
    status,
    reason,
    condition,
    notes,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_return_id,
    v_no_retur,
    v_supplier_id,
    v_supplier_name,
    'pending',
    coalesce(nullif(v_reason, ''), 'lainnya'),
    v_condition,
    v_notes,
    v_user_id,
    coalesce(nullif(p_return->>'created_at', '')::timestamptz, now()),
    now()
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select *
    into v_product
    from public.produk
    where id = nullif(v_item->>'product_id', '')::uuid
    for update;

    if not found then
      raise exception 'Produk retur tidak ditemukan.';
    end if;

    v_qty := coalesce((v_item->>'quantity')::numeric::integer, 0);
    if v_qty <= 0 then
      raise exception 'Qty retur % wajib lebih besar dari 0.', v_product.nama;
    end if;

    if coalesce(v_product.stok, 0) < v_qty then
      raise exception 'Stok % tidak cukup untuk retur supplier.', v_product.nama;
    end if;

    v_unit_cost := greatest(0, coalesce((v_item->>'unit_cost')::numeric::integer, v_product.harga_beli, 0));
    v_subtotal := v_unit_cost * v_qty;
    v_next_stock := coalesce(v_product.stok, 0) - v_qty;

    update public.produk
    set stok = v_next_stock
    where id = v_product.id;

    insert into public.supplier_return_items (
      supplier_return_id,
      product_id,
      product_name,
      product_code,
      category,
      quantity,
      unit_cost,
      subtotal_cost,
      condition,
      notes
    )
    values (
      v_return_id,
      v_product.id,
      v_product.nama,
      v_product.kode_produk,
      v_product.kategori,
      v_qty,
      v_unit_cost,
      v_subtotal,
      nullif(v_item->>'condition', ''),
      nullif(v_item->>'notes', '')
    );

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
      v_product.id,
      'keluar',
      -v_qty,
      coalesce(v_product.stok, 0),
      v_next_stock,
      v_no_retur,
      'Retur supplier ke ' || v_supplier_name
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
        v_product.id,
        'supplier_return_created',
        v_user_id,
        jsonb_build_object(
          'supplier_return_id', v_return_id,
          'no_retur', v_no_retur,
          'supplier_name', v_supplier_name,
          'quantity', v_qty,
          'unit_cost', v_unit_cost,
          'stock_before', coalesce(v_product.stok, 0),
          'stock_after', v_next_stock,
          'reason', v_reason
        ),
        to_jsonb(v_product) || jsonb_build_object('stok', v_next_stock)
      );
    end if;

    v_total_qty := v_total_qty + v_qty;
    v_total_value := v_total_value + v_subtotal;
  end loop;

  update public.supplier_returns
  set total_quantity = v_total_qty,
      total_estimated_value = v_total_value,
      updated_at = now()
  where id = v_return_id
  returning * into v_return_row;

  return to_jsonb(v_return_row);
end;
$$;

create or replace function public.update_supplier_return_status_atomic(
  p_id uuid,
  p_status text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.supplier_return_status := p_status::public.supplier_return_status;
  v_return public.supplier_returns%rowtype;
  v_item public.supplier_return_items%rowtype;
  v_product public.produk%rowtype;
  v_should_restock boolean := coalesce((p_payload->>'restock')::boolean, false);
  v_settlement_amount integer := greatest(0, coalesce((p_payload->>'settlement_amount')::numeric::integer, 0));
  v_next_stock integer;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if public.current_user_role() is distinct from 'pemilik'::public.user_role then
    raise exception 'Hanya owner yang dapat menyelesaikan retur supplier.';
  end if;

  select *
  into v_return
  from public.supplier_returns
  where id = p_id
  for update;

  if not found then
    raise exception 'Retur supplier tidak ditemukan.';
  end if;

  if v_return.status <> 'pending' then
    raise exception 'Retur supplier ini sudah diproses.';
  end if;

  if v_status in ('diganti_barang', 'ditolak') then
    v_should_restock := coalesce((p_payload->>'restock')::boolean, true);
  end if;

  if v_should_restock then
    for v_item in
      select *
      from public.supplier_return_items
      where supplier_return_id = p_id
    loop
      select *
      into v_product
      from public.produk
      where id = v_item.product_id
      for update;

      if found then
        v_next_stock := coalesce(v_product.stok, 0) + v_item.quantity;

        update public.produk
        set stok = v_next_stock
        where id = v_product.id;

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
          v_product.id,
          'masuk',
          v_item.quantity,
          coalesce(v_product.stok, 0),
          v_next_stock,
          v_return.no_retur,
          case
            when v_status = 'diganti_barang' then 'Pengganti retur supplier diterima'
            else 'Retur supplier ditolak, barang kembali ke toko'
          end
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
            v_product.id,
            'supplier_return_resolved',
            v_user_id,
            jsonb_build_object(
              'supplier_return_id', p_id,
              'no_retur', v_return.no_retur,
              'status', v_status::text,
              'quantity', v_item.quantity,
              'stock_before', coalesce(v_product.stok, 0),
              'stock_after', v_next_stock
            ),
            to_jsonb(v_product) || jsonb_build_object('stok', v_next_stock)
          );
        end if;
      end if;
    end loop;
  end if;

  update public.supplier_returns
  set status = v_status,
      settlement_amount = v_settlement_amount,
      settlement_method = nullif(p_payload->>'settlement_method', ''),
      settlement_notes = nullif(p_payload->>'settlement_notes', ''),
      completed_by = v_user_id,
      completed_at = now(),
      updated_at = now()
  where id = p_id
  returning * into v_return;

  return to_jsonb(v_return);
end;
$$;

create or replace function public.create_customer_return_atomic(
  p_return jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_return_id uuid := coalesce(nullif(p_return->>'id', '')::uuid, gen_random_uuid());
  v_transaction_id uuid := nullif(p_return->>'transaction_id', '')::uuid;
  v_transaction public.transaksi%rowtype;
  v_no_retur text := btrim(coalesce(p_return->>'no_retur', ''));
  v_customer_name text := nullif(btrim(coalesce(p_return->>'customer_name', '')), '');
  v_reason text := btrim(coalesce(p_return->>'reason', 'lainnya'));
  v_condition text := btrim(coalesce(p_return->>'condition', ''));
  v_notes text := nullif(p_return->>'notes', '');
  v_refund_method text := nullif(btrim(coalesce(p_return->>'refund_method', '')), '');
  v_restock boolean := coalesce((p_return->>'restock')::boolean, true);
  v_item jsonb;
  v_transaction_item public.item_transaksi%rowtype;
  v_product public.produk%rowtype;
  v_product_found boolean;
  v_qty integer;
  v_already_returned integer;
  v_unit_price integer;
  v_subtotal integer;
  v_total_qty integer := 0;
  v_total_refund integer := 0;
  v_next_stock integer;
  v_return_row public.customer_returns%rowtype;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if public.current_user_role() is distinct from 'pemilik'::public.user_role then
    raise exception 'Hanya owner yang dapat membuat retur konsumen.';
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
    raise exception 'Minimal satu item wajib diretur.';
  end if;

  if v_no_retur = '' then
    v_no_retur := 'RTK-' || to_char(now(), 'YYYYMMDD-HH24MISS');
  end if;

  insert into public.customer_returns (
    id,
    no_retur,
    transaction_id,
    transaction_no,
    customer_name,
    reason,
    condition,
    notes,
    refund_method,
    restock,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_return_id,
    v_no_retur,
    v_transaction.id,
    v_transaction.no_transaksi,
    v_customer_name,
    coalesce(nullif(v_reason, ''), 'lainnya'),
    v_condition,
    v_notes,
    v_refund_method,
    v_restock,
    v_user_id,
    coalesce(nullif(p_return->>'created_at', '')::timestamptz, now()),
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
      raise exception 'Item transaksi retur tidak ditemukan.';
    end if;

    v_qty := coalesce((v_item->>'quantity')::numeric::integer, 0);
    if v_qty <= 0 then
      raise exception 'Qty retur % wajib lebih besar dari 0.', v_transaction_item.nama_produk;
    end if;

    select coalesce(sum(quantity), 0)
    into v_already_returned
    from public.customer_return_items
    where transaction_item_id = v_transaction_item.id;

    if v_qty + v_already_returned > v_transaction_item.qty then
      raise exception 'Qty retur % melebihi qty transaksi.', v_transaction_item.nama_produk;
    end if;

    select *
    into v_product
    from public.produk
    where id = v_transaction_item.produk_id
    for update;
    v_product_found := found;

    v_unit_price := greatest(
      0,
      coalesce((v_item->>'unit_price')::numeric::integer, v_transaction_item.harga_satuan, 0)
    );
    v_subtotal := v_unit_price * v_qty;

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
      v_return_id,
      v_transaction_item.id,
      v_transaction_item.produk_id,
      v_transaction_item.nama_produk,
      case when v_product_found then v_product.kode_produk else null end,
      case when v_product_found then v_product.kategori else null end,
      v_qty,
      v_unit_price,
      v_subtotal,
      v_restock,
      nullif(v_item->>'condition', ''),
      nullif(v_item->>'notes', '')
    );

    if v_restock and v_product_found then
      v_next_stock := coalesce(v_product.stok, 0) + v_qty;

      update public.produk
      set stok = v_next_stock
      where id = v_product.id;

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
        v_product.id,
        'masuk',
        v_qty,
        coalesce(v_product.stok, 0),
        v_next_stock,
        v_no_retur,
        'Retur konsumen dari transaksi ' || coalesce(v_transaction.no_transaksi, '')
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
          v_product.id,
          'customer_return_created',
          v_user_id,
          jsonb_build_object(
            'customer_return_id', v_return_id,
            'no_retur', v_no_retur,
            'transaction_id', v_transaction.id,
            'transaction_no', v_transaction.no_transaksi,
            'quantity', v_qty,
            'unit_price', v_unit_price,
            'stock_before', coalesce(v_product.stok, 0),
            'stock_after', v_next_stock,
            'reason', v_reason
          ),
          to_jsonb(v_product) || jsonb_build_object('stok', v_next_stock)
        );
      end if;
    end if;

    v_total_qty := v_total_qty + v_qty;
    v_total_refund := v_total_refund + v_subtotal;
  end loop;

  update public.customer_returns
  set total_quantity = v_total_qty,
      total_refund_amount = v_total_refund,
      updated_at = now()
  where id = v_return_id
  returning * into v_return_row;

  return to_jsonb(v_return_row);
end;
$$;

grant execute on function public.create_supplier_return_atomic(jsonb, jsonb) to authenticated;
grant execute on function public.update_supplier_return_status_atomic(uuid, text, jsonb) to authenticated;
grant execute on function public.create_customer_return_atomic(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
