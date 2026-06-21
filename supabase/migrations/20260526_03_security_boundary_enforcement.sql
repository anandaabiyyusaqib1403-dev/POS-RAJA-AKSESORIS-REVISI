-- Enforce employee permissions at the database boundary for sensitive operational writes.

do $migration$
begin
  if to_regprocedure('public.create_wallet_transaction_atomic_unchecked(jsonb)') is null then
    if to_regprocedure('public.create_wallet_transaction_atomic(jsonb)') is null then
      raise exception 'create_wallet_transaction_atomic(jsonb) must exist before hardening.';
    end if;
    execute 'alter function public.create_wallet_transaction_atomic(jsonb) rename to create_wallet_transaction_atomic_unchecked';
  end if;

  if to_regprocedure('public.save_stock_mutation_atomic_unchecked(jsonb)') is null then
    if to_regprocedure('public.save_stock_mutation_atomic(jsonb)') is null then
      raise exception 'save_stock_mutation_atomic(jsonb) must exist before hardening.';
    end if;
    execute 'alter function public.save_stock_mutation_atomic(jsonb) rename to save_stock_mutation_atomic_unchecked';
  end if;

  if to_regprocedure('public.close_shift_atomic_unchecked(uuid,integer,text,text)') is null then
    if to_regprocedure('public.close_shift_atomic(uuid,integer,text,text)') is null then
      raise exception 'close_shift_atomic(uuid, integer, text, text) must exist before hardening.';
    end if;
    execute 'alter function public.close_shift_atomic(uuid, integer, text, text) rename to close_shift_atomic_unchecked';
  end if;
end
$migration$;

revoke execute on function public.create_wallet_transaction_atomic_unchecked(jsonb)
from public, anon, authenticated;
revoke execute on function public.save_stock_mutation_atomic_unchecked(jsonb)
from public, anon, authenticated;
revoke execute on function public.close_shift_atomic_unchecked(uuid, integer, text, text)
from public, anon, authenticated;

create or replace function public.create_wallet_transaction_atomic(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_target_id uuid;
begin
  if not public.current_user_has_employee_permission('finance.cash_wallet') then
    raise exception 'Akses mutasi wallet tidak diizinkan.';
  end if;

  v_result := public.create_wallet_transaction_atomic_unchecked(p_transaction);
  v_target_id := nullif(v_result->>'id', '')::uuid;

  insert into public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_table,
    target_id,
    before_value,
    after_value,
    reason,
    incident_code
  )
  values (
    auth.uid(),
    public.current_user_role()::text,
    'wallet.manual_mutation',
    'transaksi_dompet',
    v_target_id,
    '{}'::jsonb,
    coalesce(v_result, '{}'::jsonb),
    'Permission-enforced wallet mutation',
    'MONEY-FLOW'
  );

  return v_result;
end;
$$;

create or replace function public.save_stock_mutation_atomic(p_mutation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_target_id uuid;
begin
  if not public.current_user_has_employee_permission('product.stock_edit') then
    raise exception 'Akses edit stok tidak diizinkan.';
  end if;

  v_result := public.save_stock_mutation_atomic_unchecked(p_mutation);
  v_target_id := nullif(v_result->>'id', '')::uuid;

  insert into public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_table,
    target_id,
    before_value,
    after_value,
    reason,
    incident_code
  )
  values (
    auth.uid(),
    public.current_user_role()::text,
    'stock.manual_mutation',
    'stok_mutasi',
    v_target_id,
    '{}'::jsonb,
    coalesce(v_result, '{}'::jsonb),
    'Permission-enforced stock mutation',
    'INVENTORY-CONTROL'
  );

  return v_result;
end;
$$;

create or replace function public.close_shift_atomic(
  p_shift_id uuid,
  p_actual_cash integer,
  p_notes text default '',
  p_pin text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_has_employee_permission('shift.close') then
    raise exception 'Akses closing shift tidak diizinkan.';
  end if;

  return public.close_shift_atomic_unchecked(p_shift_id, p_actual_cash, p_notes, p_pin);
end;
$$;

grant execute on function public.create_wallet_transaction_atomic(jsonb) to authenticated;
grant execute on function public.save_stock_mutation_atomic(jsonb) to authenticated;
grant execute on function public.close_shift_atomic(uuid, integer, text, text) to authenticated;

-- Wallet and stock ledgers must only be written through controlled RPC paths.
revoke insert, update, delete on public.transaksi_dompet from authenticated;
drop policy if exists "kasir insert transaksi dompet" on public.transaksi_dompet;

revoke insert, update, delete on public.stok_mutasi from authenticated;
drop policy if exists "kasir insert stok masuk" on public.stok_mutasi;

-- Cash entry creation remains a frontend path, but is permission-bound in RLS.
drop policy if exists "kasir insert kas" on public.kas;
create policy "kasir insert kas"
on public.kas
for insert
to authenticated
with check (
  kasir_id = auth.uid()
  and public.current_user_has_employee_permission('finance.cash_wallet')
);

-- Cashiers open their own clean shift; all later shift changes use controlled RPCs.
drop policy if exists "cashier_manage_own_shifts" on public.shifts;
drop policy if exists "cashier insert own shifts" on public.shifts;
drop policy if exists "cashier update own shifts" on public.shifts;
drop policy if exists "shift update own or owner" on public.shifts;
drop policy if exists "shift insert own or owner" on public.shifts;
drop policy if exists "owner update shifts" on public.shifts;

create policy "shift insert own or owner"
on public.shifts
for insert
to authenticated
with check (
  public.current_user_role() = 'pemilik'::public.user_role
  or (
    cashier_id = auth.uid()
    and status = 'active'::public.shift_status
    and (start_time at time zone 'Asia/Jakarta')::time >= time '07:00'
    and end_time is null
    and opening_cash = 0
    and total_cash = 0
    and total_digital = 0
    and total_transactions = 0
    and total_items = 0
    and actual_cash is null
    and approved_by is null
    and closed_by is null
  )
);

create policy "owner update shifts"
on public.shifts
for update
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role)
with check (public.current_user_role() = 'pemilik'::public.user_role);

notify pgrst, 'reload schema';
