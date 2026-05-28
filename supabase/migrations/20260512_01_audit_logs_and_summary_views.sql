-- Production hardening: immutable audit log, reporting indexes, and lightweight summary views.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id),
  actor_role text,
  action text not null,
  target_table text not null,
  target_id uuid,
  before_value jsonb not null default '{}'::jsonb,
  after_value jsonb not null default '{}'::jsonb,
  reason text not null default '',
  device_info jsonb not null default '{}'::jsonb,
  session_id text,
  incident_code text,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

drop policy if exists "owner read audit logs" on public.audit_logs;
create policy "owner read audit logs"
on public.audit_logs
for select
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role);

drop policy if exists "authenticated append audit logs" on public.audit_logs;
create policy "authenticated append audit logs"
on public.audit_logs
for insert
to authenticated
with check (actor_id = auth.uid());

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Audit log bersifat immutable.';
end;
$$;

drop trigger if exists trg_prevent_audit_log_update on public.audit_logs;
create trigger trg_prevent_audit_log_update
before update on public.audit_logs
for each row execute function public.prevent_audit_log_mutation();

drop trigger if exists trg_prevent_audit_log_delete on public.audit_logs;
create trigger trg_prevent_audit_log_delete
before delete on public.audit_logs
for each row execute function public.prevent_audit_log_mutation();

create index if not exists idx_audit_logs_created_at on public.audit_logs (created_at desc);
create index if not exists idx_audit_logs_actor_created on public.audit_logs (actor_id, created_at desc);
create index if not exists idx_audit_logs_target on public.audit_logs (target_table, target_id);

create index if not exists idx_transaksi_created_at_desc on public.transaksi (created_at desc);
create index if not exists idx_transaksi_kasir_created on public.transaksi (kasir_id, created_at desc);
create index if not exists idx_transaksi_digital_created_at_desc on public.transaksi_digital (created_at desc);
create index if not exists idx_transaksi_digital_provider_created on public.transaksi_digital (provider, created_at desc);
create index if not exists idx_transaksi_digital_kasir_created on public.transaksi_digital (kasir_id, created_at desc);
create index if not exists idx_item_transaksi_transaksi_id on public.item_transaksi (transaksi_id);
create index if not exists idx_stok_mutasi_created_at_desc on public.stok_mutasi (created_at desc);
create index if not exists idx_transaksi_dompet_created_at_desc on public.transaksi_dompet (created_at desc);

create or replace view public.daily_sales_summary as
with accessory_sales as (
  select
    date_trunc('day', t.created_at)::date as tanggal,
    count(distinct t.id)::integer as transaction_count,
    coalesce(sum(i.qty), 0)::integer as item_count,
    coalesce(sum(i.subtotal), 0)::bigint as revenue,
    coalesce(sum(i.qty * coalesce(p.harga_beli, 0)), 0)::bigint as cost,
    (
      coalesce(sum(i.subtotal), 0) -
      coalesce(sum(i.qty * coalesce(p.harga_beli, 0)), 0)
    )::bigint as profit
  from public.transaksi t
  left join public.item_transaksi i on i.transaksi_id = t.id
  left join public.produk p on p.id = i.produk_id
  group by 1
),
digital_sales as (
  select
    date_trunc('day', created_at)::date as tanggal,
    count(*)::integer as transaction_count,
    count(*)::integer as item_count,
    coalesce(sum(harga_jual), 0)::bigint as revenue,
    coalesce(sum(cost), sum(modal), 0)::bigint as cost,
    coalesce(sum(profit), sum(keuntungan), 0)::bigint as profit
  from public.transaksi_digital
  group by 1
)
select
  tanggal,
  sum(transaction_count)::integer as total_transactions,
  sum(item_count)::integer as total_items,
  sum(revenue)::bigint as total_revenue,
  sum(cost)::bigint as total_cost,
  sum(profit)::bigint as total_profit
from (
  select * from accessory_sales
  union all
  select * from digital_sales
) sales
group by tanggal;

create or replace view public.provider_sales_summary as
select
  date_trunc('day', created_at)::date as tanggal,
  jenis::text as category,
  provider,
  count(*)::integer as transaction_count,
  coalesce(sum(harga_jual), 0)::bigint as total_revenue,
  coalesce(sum(cost), sum(modal), 0)::bigint as total_cost,
  coalesce(sum(profit), sum(keuntungan), 0)::bigint as total_profit
from public.transaksi_digital
group by 1, 2, 3;

create or replace view public.cashier_shift_summary as
select
  s.id as shift_id,
  s.cashier_id,
  u.nama as cashier_name,
  s.start_time,
  s.end_time,
  s.status,
  s.total_cash,
  s.total_digital,
  s.total_transactions,
  s.total_items,
  s.actual_cash,
  s.difference,
  case
    when abs(coalesce(s.difference, 0)) >= 50000 then 'large_difference'
    when s.status in ('pending'::public.shift_status, 'flagged'::public.shift_status) then 'needs_review'
    else 'normal'
  end as anomaly_status
from public.shifts s
left join public.users u on u.id = s.cashier_id;

create or replace view public.wallet_daily_summary as
select
  date_trunc('day', created_at)::date as tanggal,
  platform::text as platform,
  coalesce(sum(case when jenis = 'masuk' then nominal else 0 end), 0)::bigint as total_in,
  coalesce(sum(case when jenis <> 'masuk' then nominal + coalesce(biaya_admin, 0) else 0 end), 0)::bigint as total_out,
  coalesce(sum(case when jenis = 'masuk' then nominal else -(nominal + coalesce(biaya_admin, 0)) end), 0)::bigint as net_movement
from public.transaksi_dompet
group by 1, 2;

create or replace view public.stock_summary as
select
  id as product_id,
  nama as product_name,
  kategori as category,
  stok,
  stok_minimum,
  case
    when coalesce(stok, 0) <= 0 then 'out'
    when coalesce(stok, 0) <= coalesce(stok_minimum, 0) then 'low'
    else 'ok'
  end as stock_status,
  updated_at
from public.produk
where coalesce(status, 'active') <> 'deleted';

grant select on
  public.daily_sales_summary,
  public.provider_sales_summary,
  public.cashier_shift_summary,
  public.wallet_daily_summary,
  public.stock_summary
to authenticated;

notify pgrst, 'reload schema';
