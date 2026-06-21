-- 20260418_06_security_lockdown_views.sql
-- Lock down tables/views that Supabase marks as UNRESTRICTED.

alter table public.services_products enable row level security;
alter table public.shifts enable row level security;
alter table public.transaksi enable row level security;
alter table public.transaksi_digital enable row level security;
alter table public.item_transaksi enable row level security;

alter table public.services_products
  add column if not exists default_price integer check (default_price >= 0),
  add column if not exists service_type text not null default '';

alter table public.transaksi_digital
  add column if not exists payment_method public.nama_platform not null default 'cash';

drop policy if exists "authenticated read service products" on public.services_products;
drop policy if exists "cashier read active service products" on public.services_products;
create policy "cashier read active service products"
on public.services_products
for select
to authenticated
using (
  (public.current_user_role() = 'kasir' and active = true)
  or public.current_user_role() = 'pemilik'
);

drop policy if exists "owner manage service products" on public.services_products;
create policy "owner manage service products"
on public.services_products
for all
to authenticated
using (public.current_user_role() = 'pemilik')
with check (public.current_user_role() = 'pemilik');

drop view if exists public.shift_reports;
drop view if exists public.shift_transactions;
drop view if exists public.service_transactions;
drop view if exists public.service_products;

create view public.service_products
with (security_invoker = true)
as
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

create view public.service_transactions
with (security_invoker = true)
as
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

create view public.shift_transactions
with (security_invoker = true)
as
select
  s.id as shift_id,
  s.cashier_id,
  s.start_time,
  s.status as shift_status,
  t.id,
  t.kasir_id,
  t.no_transaksi,
  t.total_bayar,
  t.uang_diterima,
  t.kembalian,
  t.metode_bayar,
  t.catatan,
  t.created_at
from public.shifts s
join public.transaksi t
  on t.created_at >= s.start_time
  and t.created_at < coalesce(s.end_time, now())
where s.status = 'active'::public.shift_status;

create view public.shift_reports
with (security_invoker = true)
as
select
  s.*,
  count(t.id)::integer as system_transactions,
  sum(
    case
      when t.metode_bayar = 'cash' or t.metode_bayar = 'tunai'
        then t.total_bayar
      else 0
    end
  )::integer as system_cash,
  sum(
    case
      when t.metode_bayar != 'cash' and t.metode_bayar != 'tunai'
        then t.total_bayar
      else 0
    end
  )::integer as system_digital,
  sum(coalesce(it.qty, 0))::integer as system_items
from public.shifts s
left join public.shift_transactions t on t.shift_id = s.id
left join public.item_transaksi it on it.transaksi_id = t.id
group by s.id
order by s.start_time desc;

revoke all on public.service_products from anon, public;
revoke all on public.service_transactions from anon, public;
revoke all on public.shift_transactions from anon, public;
revoke all on public.shift_reports from anon, public;

grant select on public.service_products to authenticated;
grant select on public.service_transactions to authenticated;
grant select on public.shift_transactions to authenticated;
grant select on public.shift_reports to authenticated;

comment on view public.service_products is
  'Security invoker compatibility view; source table is services_products.';

comment on view public.service_transactions is
  'Security invoker compatibility view; source table is transaksi_digital.';

comment on view public.shift_transactions is
  'Security invoker shift transaction view; follows RLS on shifts and transaksi.';

comment on view public.shift_reports is
  'Security invoker shift report view; follows RLS on shifts, transaksi, and item_transaksi.';
