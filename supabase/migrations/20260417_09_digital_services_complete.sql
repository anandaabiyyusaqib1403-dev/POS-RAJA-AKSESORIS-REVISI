-- 20260417_09_digital_services_complete.sql
-- Add default_price to services_products
-- Ensure snapshots in transaksi_digital

alter table public.services_products
  add column if not exists default_price integer check (default_price >= 0);

-- Update existing records with sample default_prices
update public.services_products
set default_price = greatest(cost * 1.05::numeric, cost + 1000)::integer
where default_price is null;

-- Ensure transaction snapshots (already mostly there, add indexes)
create index if not exists idx_transaksi_digital_service_product
  on public.transaksi_digital (service_product_id);

create index if not exists idx_transaksi_digital_created
  on public.transaksi_digital (created_at desc);

-- RLS for services_products (owner full, cashier read active only)
drop policy if exists "cashier read active service products" on public.services_products;
create policy "cashier read active service products"
  on public.services_products
  for select
  to authenticated
  using (
    public.current_user_role() = 'kasir' and active = true
    or public.current_user_role() = 'pemilik'
  );

-- Owner full access
drop policy if exists "owner manage service products" on public.services_products;
create policy "owner manage service products"
  on public.services_products
  for all
  to authenticated
  using (public.current_user_role() = 'pemilik')
  with check (public.current_user_role() = 'pemilik');

comment on column public.services_products.default_price
  is 'Harga default untuk prefill di kasir (opsional)';

-- Product rows are intentionally not seeded here.
-- Use the app form or Excel import so the catalog stays fully dynamic.

