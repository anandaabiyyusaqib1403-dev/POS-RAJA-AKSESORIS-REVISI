-- Server-side sales report surface for owner dashboards.

create or replace view public.sales_report_items
with (security_invoker = true)
as
select
  ('produk:' || t.id::text || ':' || coalesce(i.id::text, 'item')) as id,
  ('produk:' || t.id::text) as transaction_key,
  t.id as transaction_id,
  coalesce(t.no_transaksi, 'TRX-' || left(t.id::text, 8)) as no_transaksi,
  t.created_at as occurred_at,
  t.kasir_id as cashier_id,
  coalesce(u.nama, 'Kasir') as cashier,
  'produk'::text as type,
  'Produk'::text as type_label,
  coalesce(nullif(i.category, ''), nullif(p.kategori, ''), 'Aksesoris') as category,
  nullif(coalesce(i.provider, ''), '') as provider,
  coalesce(nullif(i.nama_produk, ''), p.nama, 'Produk') as product_name,
  coalesce(i.qty, 0)::numeric as qty,
  coalesce(i.selling_price, i.subtotal, i.harga_satuan * i.qty, 0)::numeric as selling_price,
  coalesce(i.cost, coalesce(p.harga_beli, 0) * coalesce(i.qty, 0), 0)::numeric as cost,
  coalesce(
    i.profit,
    coalesce(i.selling_price, i.subtotal, i.harga_satuan * i.qty, 0)
      - coalesce(i.cost, coalesce(p.harga_beli, 0) * coalesce(i.qty, 0), 0),
    0
  )::numeric as profit,
  case
    when jsonb_typeof(coalesce(t.payments, '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(t.payments, '[]'::jsonb)) > 1
      then 'Split Payment'
    else coalesce(t.metode_bayar::text, 'cash')
  end as payment_customer,
  case
    when jsonb_typeof(coalesce(t.payments, '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(t.payments, '[]'::jsonb)) > 1
      then 'Split Payment'
    else coalesce(t.metode_bayar::text, 'cash')
  end as payment_group,
  ''::text as target_number,
  lower(concat_ws(' ', t.no_transaksi, u.nama, i.nama_produk, p.nama, i.category, p.kategori, i.provider, t.metode_bayar::text)) as searchable_text
from public.transaksi t
left join public.item_transaksi i on i.transaksi_id = t.id
left join public.produk p on p.id = i.produk_id
left join public.users u on u.id = t.kasir_id
where t.deleted_at is null

union all

select
  ('digital:' || d.id::text) as id,
  ('digital:' || d.id::text) as transaction_key,
  d.id as transaction_id,
  coalesce(d.no_transaksi, 'LYN-' || left(d.id::text, 8)) as no_transaksi,
  d.created_at as occurred_at,
  d.kasir_id as cashier_id,
  coalesce(u.nama, 'Kasir') as cashier,
  case
    when d.jenis::text in ('pulsa', 'paket_data', 'token_listrik', 'voucher_game', 'kuota') then 'layanan'
    else 'jasa'
  end as type,
  case
    when d.jenis::text in ('pulsa', 'paket_data', 'token_listrik', 'voucher_game', 'kuota') then 'Layanan'
    else 'Jasa'
  end as type_label,
  coalesce(d.jenis::text, 'Layanan digital') as category,
  nullif(coalesce(d.provider, d.transfer_platform, ''), '') as provider,
  coalesce(
    nullif(d.transaction_items->0->>'product_name_snapshot', ''),
    nullif(d.transaction_items->0->>'product_name', ''),
    nullif(d.catatan, ''),
    d.jenis::text,
    'Layanan digital'
  ) as product_name,
  coalesce(nullif(d.transaction_items->0->>'qty', '')::numeric, 1) as qty,
  coalesce(
    nullif(d.transaction_items->0->>'subtotal', '')::numeric,
    d.selling_price,
    d.harga_jual,
    d.nominal,
    0
  )::numeric as selling_price,
  coalesce(
    nullif(d.transaction_items->0->>'cost_total', '')::numeric,
    d.cost,
    d.modal,
    0
  )::numeric as cost,
  coalesce(
    nullif(d.transaction_items->0->>'profit', '')::numeric,
    d.profit,
    d.keuntungan,
    coalesce(d.selling_price, d.harga_jual, d.nominal, 0) - coalesce(d.cost, d.modal, 0),
    0
  )::numeric as profit,
  coalesce(nullif(d.payment_customer, ''), d.payment_method::text, 'cash') as payment_customer,
  coalesce(nullif(d.payment_customer, ''), d.payment_method::text, 'cash') as payment_group,
  coalesce(nullif(d.target_number, ''), nullif(d.nomor_tujuan, ''), '') as target_number,
  lower(concat_ws(' ', d.no_transaksi, u.nama, d.jenis::text, d.provider, d.transfer_platform, d.nomor_tujuan, d.target_number, d.customer_name, d.catatan, d.payment_customer, d.payment_method::text)) as searchable_text
from public.transaksi_digital d
left join public.users u on u.id = d.kasir_id
where d.deleted_at is null

union all

select
  ('logistik:' || l.id::text) as id,
  ('logistik:' || l.id::text) as transaction_key,
  l.id as transaction_id,
  coalesce(l.no_transaksi, 'LOG-' || left(l.id::text, 8)) as no_transaksi,
  l.created_at as occurred_at,
  l.kasir_id as cashier_id,
  coalesce(u.nama, 'Kasir') as cashier,
  'jasa'::text as type,
  'Jasa'::text as type_label,
  'Logistik'::text as category,
  coalesce(nullif(l.ekspedisi, ''), 'Logistik') as provider,
  concat_ws(' - ', 'Pengiriman', nullif(l.ekspedisi, ''), nullif(l.package_type, '')) as product_name,
  1::numeric as qty,
  coalesce(l.price, l.harga_jual, 0)::numeric as selling_price,
  coalesce(l.modal, 0)::numeric as cost,
  coalesce(l.keuntungan, coalesce(l.price, l.harga_jual, 0) - coalesce(l.modal, 0), 0)::numeric as profit,
  coalesce(l.payment_method::text, l.platform_sumber::text, 'cash') as payment_customer,
  coalesce(l.payment_method::text, l.platform_sumber::text, 'cash') as payment_group,
  coalesce(nullif(l.no_resi, ''), nullif(l.destination, ''), '') as target_number,
  lower(concat_ws(' ', l.no_transaksi, u.nama, l.ekspedisi, l.no_resi, l.destination, l.package_type, l.payment_method::text, l.catatan)) as searchable_text
from public.transaksi_logistik l
left join public.users u on u.id = l.kasir_id
where l.deleted_at is null;

create index if not exists idx_sales_report_transaksi_created
on public.transaksi (created_at desc)
where deleted_at is null;

create index if not exists idx_sales_report_digital_created
on public.transaksi_digital (created_at desc)
where deleted_at is null;

create index if not exists idx_sales_report_logistik_created
on public.transaksi_logistik (created_at desc)
where deleted_at is null;

create or replace function public.get_sales_report_summary(
  p_start timestamptz default null,
  p_end timestamptz default null
)
returns table (
  summary_type text,
  key text,
  label text,
  category text,
  provider text,
  rank integer,
  total_transactions integer,
  total_qty numeric,
  total_revenue numeric,
  total_cost numeric,
  total_profit numeric,
  margin numeric
)
language sql
stable
set search_path = public
as $$
  with scoped as (
    select *
    from public.sales_report_items
    where (p_start is null or occurred_at >= p_start)
      and (p_end is null or occurred_at <= p_end)
  ),
  global_summary as (
    select
      'global'::text as summary_type,
      'global'::text as key,
      'Global'::text as label,
      null::text as category,
      null::text as provider,
      null::integer as rank,
      count(distinct transaction_key)::integer as total_transactions,
      coalesce(sum(qty), 0)::numeric as total_qty,
      coalesce(sum(selling_price), 0)::numeric as total_revenue,
      coalesce(sum(cost), 0)::numeric as total_cost,
      coalesce(sum(profit), 0)::numeric as total_profit
    from scoped
  ),
  type_summary as (
    select
      'type'::text,
      type,
      max(type_label),
      null::text,
      null::text,
      null::integer,
      count(distinct transaction_key)::integer,
      coalesce(sum(qty), 0)::numeric,
      coalesce(sum(selling_price), 0)::numeric,
      coalesce(sum(cost), 0)::numeric,
      coalesce(sum(profit), 0)::numeric
    from scoped
    group by type
  ),
  category_summary as (
    select
      'category'::text,
      category,
      category,
      category,
      null::text,
      null::integer,
      count(distinct transaction_key)::integer,
      coalesce(sum(qty), 0)::numeric,
      coalesce(sum(selling_price), 0)::numeric,
      coalesce(sum(cost), 0)::numeric,
      coalesce(sum(profit), 0)::numeric
    from scoped
    group by category
  ),
  provider_summary as (
    select
      'provider'::text,
      concat_ws('|', category, provider),
      concat_ws(' - ', category, provider),
      category,
      provider,
      null::integer,
      count(distinct transaction_key)::integer,
      coalesce(sum(qty), 0)::numeric,
      coalesce(sum(selling_price), 0)::numeric,
      coalesce(sum(cost), 0)::numeric,
      coalesce(sum(profit), 0)::numeric
    from scoped
    where provider is not null and provider <> ''
    group by category, provider
  ),
  payment_summary as (
    select
      'payment'::text,
      payment_group,
      payment_customer,
      null::text,
      null::text,
      null::integer,
      count(distinct transaction_key)::integer,
      coalesce(sum(qty), 0)::numeric,
      coalesce(sum(selling_price), 0)::numeric,
      coalesce(sum(cost), 0)::numeric,
      coalesce(sum(profit), 0)::numeric
    from scoped
    group by payment_group, payment_customer
  ),
  cashier_summary as (
    select
      'cashier'::text,
      coalesce(cashier_id::text, 'unknown'),
      cashier,
      null::text,
      null::text,
      null::integer,
      count(distinct transaction_key)::integer,
      coalesce(sum(qty), 0)::numeric,
      coalesce(sum(selling_price), 0)::numeric,
      coalesce(sum(cost), 0)::numeric,
      coalesce(sum(profit), 0)::numeric
    from scoped
    group by cashier_id, cashier
  ),
  top_products as (
    select
      'top_product'::text as summary_type,
      product_name as key,
      product_name as label,
      max(category) as category,
      max(provider) as provider,
      row_number() over (order by coalesce(sum(qty), 0) desc, coalesce(sum(selling_price), 0) desc)::integer as rank,
      count(distinct transaction_key)::integer as total_transactions,
      coalesce(sum(qty), 0)::numeric as total_qty,
      coalesce(sum(selling_price), 0)::numeric as total_revenue,
      coalesce(sum(cost), 0)::numeric as total_cost,
      coalesce(sum(profit), 0)::numeric as total_profit
    from scoped
    group by product_name
    order by total_qty desc, total_revenue desc
    limit 10
  ),
  combined as (
    select * from global_summary
    union all select * from type_summary
    union all select * from category_summary
    union all select * from provider_summary
    union all select * from payment_summary
    union all select * from cashier_summary
    union all select * from top_products
  )
  select
    summary_type,
    key,
    label,
    category,
    provider,
    rank,
    total_transactions,
    total_qty,
    total_revenue,
    total_cost,
    total_profit,
    case when total_revenue > 0 then total_profit / total_revenue else 0 end as margin
  from combined;
$$;

grant select on public.sales_report_items to authenticated;
grant execute on function public.get_sales_report_summary(timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';
