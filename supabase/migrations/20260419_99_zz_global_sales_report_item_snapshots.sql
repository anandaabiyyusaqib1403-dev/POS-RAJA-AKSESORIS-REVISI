-- 20260419_99_zz_global_sales_report_item_snapshots.sql
-- Global Sales Report transaction-only snapshots for accessory sale items.
-- These fields are used for reporting only and do not read from wallet/saldo tables.

alter table public.item_transaksi
  add column if not exists category text,
  add column if not exists provider text,
  add column if not exists selling_price integer,
  add column if not exists cost integer,
  add column if not exists profit integer;

update public.item_transaksi as item
set
  category = coalesce(nullif(item.category, ''), product.kategori, 'Aksesoris'),
  provider = coalesce(nullif(item.provider, ''), to_jsonb(product)->>'provider'),
  selling_price = coalesce(item.selling_price, item.subtotal, item.harga_satuan * item.qty, 0),
  cost = coalesce(item.cost, coalesce(product.harga_beli, 0) * item.qty, 0),
  profit = coalesce(
    item.profit,
    coalesce(item.selling_price, item.subtotal, item.harga_satuan * item.qty, 0)
      - coalesce(item.cost, coalesce(product.harga_beli, 0) * item.qty, 0)
  )
from public.produk as product
where item.produk_id = product.id;

update public.item_transaksi
set
  category = coalesce(nullif(category, ''), 'Aksesoris'),
  selling_price = coalesce(selling_price, subtotal, harga_satuan * qty, 0),
  cost = coalesce(cost, 0),
  profit = coalesce(profit, coalesce(selling_price, subtotal, harga_satuan * qty, 0) - coalesce(cost, 0));

alter table public.item_transaksi
  alter column selling_price set default 0,
  alter column selling_price set not null,
  alter column cost set default 0,
  alter column cost set not null,
  alter column profit set default 0,
  alter column profit set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'item_transaksi_selling_price_check'
      and conrelid = 'public.item_transaksi'::regclass
  ) then
    alter table public.item_transaksi
      add constraint item_transaksi_selling_price_check check (selling_price >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'item_transaksi_cost_check'
      and conrelid = 'public.item_transaksi'::regclass
  ) then
    alter table public.item_transaksi
      add constraint item_transaksi_cost_check check (cost >= 0);
  end if;
end;
$$;

create or replace function public.populate_item_transaksi_report_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_product jsonb := '{}'::jsonb;
  v_qty integer := 0;
  v_harga_satuan integer := 0;
  v_subtotal integer := 0;
  v_unit_cost integer := 0;
begin
  if new.produk_id is not null then
    select to_jsonb(product_row)
    into v_product
    from public.produk as product_row
    where product_row.id = new.produk_id;
  end if;

  v_product := coalesce(v_product, '{}'::jsonb);
  v_qty := coalesce(new.qty, 0);
  v_harga_satuan := coalesce(new.harga_satuan, 0);
  v_subtotal := coalesce(new.subtotal, v_harga_satuan * v_qty, 0);
  v_unit_cost := coalesce((nullif(v_product->>'harga_beli', ''))::numeric::integer, 0);

  new.category := coalesce(
    nullif(new.category, ''),
    nullif(v_product->>'kategori', ''),
    'Aksesoris'
  );
  new.provider := nullif(
    coalesce(
      nullif(new.provider, ''),
      nullif(v_product->>'provider', '')
    ),
    ''
  );

  if new.selling_price is null or new.selling_price <= 0 then
    new.selling_price := v_subtotal;
  end if;

  if new.cost is null or new.cost < 0 or (new.cost = 0 and v_unit_cost > 0 and v_qty > 0) then
    new.cost := v_unit_cost * v_qty;
  end if;

  if new.profit is null or (new.profit = 0 and new.selling_price - new.cost <> 0) then
    new.profit := new.selling_price - new.cost;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_item_transaksi_report_fields on public.item_transaksi;

create trigger trg_item_transaksi_report_fields
before insert or update of produk_id, qty, harga_satuan, subtotal, category, provider, selling_price, cost, profit
on public.item_transaksi
for each row
execute function public.populate_item_transaksi_report_fields();

create index if not exists idx_item_transaksi_report_category
on public.item_transaksi (category);

notify pgrst, 'reload schema';
