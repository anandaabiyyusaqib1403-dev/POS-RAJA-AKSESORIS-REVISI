-- 20260419_06_remove_refund_features.sql
-- Remove refund/return database objects from older deployments.

create extension if not exists pgcrypto;

drop view if exists public.product_profit_ranking;

do $$
begin
  if to_regclass('public.transaksi_void_audit') is not null then
    drop trigger if exists trg_restore_void_stock on public.transaksi_void_audit;
  end if;

  if to_regclass('public."returns"') is not null then
    drop trigger if exists prevent_returns_update_delete on public."returns";
  end if;

  if to_regclass('public.return_items') is not null then
    drop trigger if exists prevent_return_items_update_delete on public.return_items;
  end if;
end $$;

drop function if exists public.refund_accessory_transaction_atomic(uuid, text, text);
drop function if exists public.create_customer_return_atomic(jsonb, jsonb);
drop function if exists public.create_supplier_return_atomic(jsonb, jsonb);
drop function if exists public.prevent_return_record_mutation();
drop function if exists public.restore_void_stock();

alter table if exists public.financial_logs
  drop column if exists return_id;

alter table if exists public.transaksi
  drop column if exists void_status;

drop table if exists public.transaksi_void_audit;
drop table if exists public.return_items;
drop table if exists public.supplier_transactions;
drop table if exists public."returns";
drop table if exists public.suppliers;

drop type if exists public.refund_reason;
drop type if exists public.void_status;

create table if not exists public.financial_logs (
  id uuid primary key default gen_random_uuid(),
  kasir_id uuid references public.users(id),
  log_type text not null,
  direction text not null,
  amount integer not null,
  payment_method text,
  source_type text,
  source_id uuid,
  reference text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

update public.financial_logs
set log_type = 'adjustment'
where log_type not in (
  'adjustment',
  'cash_over',
  'cash_short',
  'Kas Lebih',
  'Kas Kurang'
);

alter table public.financial_logs
  drop constraint if exists finacial_logs_log_type_check,
  drop constraint if exists financial_logs_log_type_check,
  drop constraint if exists finacial_logs_direction_check,
  drop constraint if exists financial_logs_direction_check,
  drop constraint if exists finacial_logs_amount_check,
  drop constraint if exists financial_logs_amount_check;

alter table public.financial_logs
  add constraint financial_logs_log_type_check
  check (
    log_type in (
      'adjustment',
      'cash_over',
      'cash_short',
      'Kas Lebih',
      'Kas Kurang'
    )
  ),
  add constraint financial_logs_direction_check
  check (direction in ('in', 'out', 'neutral')),
  add constraint financial_logs_amount_check
  check (amount >= 0);

grant select, insert on public.financial_logs to authenticated;
alter table public.financial_logs enable row level security;

drop policy if exists "kasir or owner read financial logs" on public.financial_logs;
create policy "kasir or owner read financial logs"
on public.financial_logs
for select
to authenticated
using (
  kasir_id = auth.uid()
  or created_by = auth.uid()
  or public.current_user_role() = 'pemilik'
);

drop policy if exists "owner insert financial logs" on public.financial_logs;
create policy "owner insert financial logs"
on public.financial_logs
for insert
to authenticated
with check (public.current_user_role() = 'pemilik');

notify pgrst, 'reload schema';
