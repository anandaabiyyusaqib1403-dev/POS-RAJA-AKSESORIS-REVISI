drop view if exists public.service_transactions;
drop view if exists public.service_products;

alter table public.transaksi_digital
  add column if not exists payment_method public.nama_platform not null default 'cash';

create view public.service_products as
select
  id,
  name,
  category,
  provider,
  cost,
  default_price,
  case when active then 'active' else 'inactive' end as status,
  created_at
from public.services_products;

create view public.service_transactions as
select
  id,
  service_product_id as product_id,
  coalesce(transaction_items->0->>'product_name_snapshot', catatan, '') as product_name,
  jenis::text as category,
  provider,
  cost,
  selling_price,
  profit,
  target_number,
  customer_name,
  payment_method::text as payment_method,
  created_at
from public.transaksi_digital;

grant select on public.service_products to authenticated;
grant select on public.service_transactions to authenticated;

comment on view public.service_products is
  'Compatibility view for the digital service product schema; source table is services_products.';

comment on view public.service_transactions is
  'Compatibility view for digital service transaction reporting; source table is transaksi_digital.';
