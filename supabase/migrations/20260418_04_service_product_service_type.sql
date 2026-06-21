alter table public.services_products
  add column if not exists service_type text not null default '';

alter table public.transaksi_digital
  add column if not exists payment_method public.nama_platform not null default 'cash';

update public.services_products
set service_type = ''
where service_type is null;

alter table public.services_products
  drop constraint if exists services_products_category_provider_name_key;

alter table public.services_products
  drop constraint if exists services_products_category_provider_service_type_name_key;

alter table public.services_products
  add constraint services_products_category_provider_service_type_name_key
  unique (category, provider, service_type, name);

create index if not exists idx_services_products_type
  on public.services_products (category, provider, service_type, name);

drop view if exists public.service_transactions;
drop view if exists public.service_products;

create view public.service_products as
select
  id,
  name,
  category,
  provider,
  service_type,
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
  coalesce(transaction_items->0->>'service_type', '') as service_type,
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

comment on column public.services_products.service_type is
  'Jenis layanan/paket untuk grouping produk kuota, contoh: COMBO MAX 28 HARI.';
