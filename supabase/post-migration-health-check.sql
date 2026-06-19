-- Post migration health check for Raja Aksesoris POS write paths.
-- Run this in Supabase SQL Editor after the repair migration.

notify pgrst, 'reload schema';

select
  'current_user_role' as check_name,
  to_regprocedure('public.current_user_role()') is not null as ok
union all
select
  'current_user_has_employee_permission',
  to_regprocedure('public.current_user_has_employee_permission(text)') is not null
union all
select
  'save_product_atomic',
  to_regprocedure('public.save_product_atomic(jsonb)') is not null
union all
select
  'save_service_product_atomic',
  to_regprocedure('public.save_service_product_atomic(jsonb)') is not null
union all
select
  'delete_service_product_atomic',
  to_regprocedure('public.delete_service_product_atomic(uuid)') is not null
union all
select
  'save_stock_mutation_atomic',
  to_regprocedure('public.save_stock_mutation_atomic(jsonb)') is not null
union all
select
  'create_wallet_transaction_atomic',
  to_regprocedure('public.create_wallet_transaction_atomic(jsonb)') is not null
union all
select
  'create_cash_entry_atomic',
  to_regprocedure('public.create_cash_entry_atomic(jsonb)') is not null
union all
select
  'close_shift_atomic',
  to_regprocedure('public.close_shift_atomic(uuid, integer, text, text)') is not null
union all
select
  'void_transaction_atomic',
  to_regprocedure('public.void_transaction_atomic(text, uuid, text)') is not null
union all
select
  'apply_stock_opname_session_atomic',
  to_regprocedure('public.apply_stock_opname_session_atomic(uuid)') is not null
union all
select
  'create_accessory_transaction_atomic',
  to_regprocedure('public.create_accessory_transaction_atomic(jsonb,jsonb)') is not null
union all
select
  'create_digital_transaction_atomic',
  to_regprocedure('public.create_digital_transaction_atomic(jsonb)') is not null
union all
select
  'create_logistics_transaction_atomic',
  to_regprocedure('public.create_logistics_transaction_atomic(jsonb)') is not null
union all
select
  'create_supplier_return_atomic',
  to_regprocedure('public.create_supplier_return_atomic(jsonb,jsonb)') is not null
union all
select
  'create_customer_return_atomic',
  to_regprocedure('public.create_customer_return_atomic(jsonb,jsonb)') is not null
union all
select
  'create_warranty_claim_atomic',
  to_regprocedure('public.create_warranty_claim_atomic(jsonb,jsonb)') is not null
union all
select
  'update_supplier_return_status_atomic',
  to_regprocedure('public.update_supplier_return_status_atomic(uuid,text,jsonb)') is not null
union all
select
  'verify_user_pin',
  to_regprocedure('public.verify_user_pin(text)') is not null
union all
select
  'owner_get_audit_storage_summary',
  to_regprocedure('public.owner_get_audit_storage_summary()') is not null
union all
select
  'owner_get_audit_storage_breakdown',
  to_regprocedure('public.owner_get_audit_storage_breakdown(integer)') is not null;

select
  function_name,
  to_regprocedure(function_signature) is not null as function_exists,
  coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure(function_signature),
      'EXECUTE'
    ),
    false
  ) as authenticated_can_execute
from (
  values
    ('current_user_role', 'public.current_user_role()'),
    ('current_user_has_employee_permission', 'public.current_user_has_employee_permission(text)'),
    ('save_product_atomic', 'public.save_product_atomic(jsonb)'),
    ('save_service_product_atomic', 'public.save_service_product_atomic(jsonb)'),
    ('delete_service_product_atomic', 'public.delete_service_product_atomic(uuid)'),
    ('save_stock_mutation_atomic', 'public.save_stock_mutation_atomic(jsonb)'),
    ('create_wallet_transaction_atomic', 'public.create_wallet_transaction_atomic(jsonb)'),
    ('create_cash_entry_atomic', 'public.create_cash_entry_atomic(jsonb)'),
    ('close_shift_atomic', 'public.close_shift_atomic(uuid, integer, text, text)'),
    ('void_transaction_atomic', 'public.void_transaction_atomic(text, uuid, text)'),
    ('apply_stock_opname_session_atomic', 'public.apply_stock_opname_session_atomic(uuid)'),
    ('create_accessory_transaction_atomic', 'public.create_accessory_transaction_atomic(jsonb,jsonb)'),
    ('create_digital_transaction_atomic', 'public.create_digital_transaction_atomic(jsonb)'),
    ('create_logistics_transaction_atomic', 'public.create_logistics_transaction_atomic(jsonb)'),
    ('create_supplier_return_atomic', 'public.create_supplier_return_atomic(jsonb,jsonb)'),
    ('create_customer_return_atomic', 'public.create_customer_return_atomic(jsonb,jsonb)'),
    ('create_warranty_claim_atomic', 'public.create_warranty_claim_atomic(jsonb,jsonb)'),
    ('update_supplier_return_status_atomic', 'public.update_supplier_return_status_atomic(uuid,text,jsonb)'),
    ('verify_user_pin', 'public.verify_user_pin(text)'),
    ('owner_get_audit_storage_summary', 'public.owner_get_audit_storage_summary()'),
    ('owner_get_audit_storage_breakdown', 'public.owner_get_audit_storage_breakdown(integer)')
  ) as rpc_checks(function_name, function_signature);

select
  implementation_name,
  to_regprocedure(function_signature) is not null as function_exists,
  coalesce(
    has_function_privilege(
      'authenticated',
      to_regprocedure(function_signature),
      'EXECUTE'
    ),
    false
  ) as authenticated_must_not_execute
from (
  values
    ('wallet_unchecked', 'public.create_wallet_transaction_atomic_unchecked(jsonb)'),
    ('stock_unchecked', 'public.save_stock_mutation_atomic_unchecked(jsonb)'),
    ('close_shift_unchecked', 'public.close_shift_atomic_unchecked(uuid, integer, text, text)'),
    ('accessory_idempotency_impl', 'public.create_accessory_transaction_atomic_idempotency_impl(jsonb,jsonb)'),
    ('digital_idempotency_impl', 'public.create_digital_transaction_atomic_idempotency_impl(jsonb)'),
    ('logistics_idempotency_impl', 'public.create_logistics_transaction_atomic_idempotency_impl(jsonb)'),
    ('wallet_authorized_impl', 'public.create_wallet_transaction_atomic_authorized_impl(jsonb)'),
    ('supplier_return_idempotency_impl', 'public.create_supplier_return_atomic_idempotency_impl(jsonb,jsonb)'),
    ('customer_return_idempotency_impl', 'public.create_customer_return_atomic_idempotency_impl(jsonb,jsonb)'),
    ('supplier_return_status_idempotency_impl', 'public.update_supplier_return_status_atomic_idempotency_impl(uuid,text,jsonb)'),
    ('close_shift_authorized_impl', 'public.close_shift_atomic_authorized_impl(uuid, integer, text, text)'),
    ('void_idempotency_impl', 'public.void_transaction_atomic_idempotency_impl(text, uuid, text)')
) as internal_rpc_checks(implementation_name, function_signature);

select
  c.relname as table_name,
  c.relrowsecurity as row_security_enabled
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname in (
    'produk',
    'stok_mutasi',
    'services_products',
    'transaksi_dompet',
    'wallet_accounts',
    'notification_jobs',
    'operational_events',
    'product_activity_logs',
    'kas',
    'shifts',
    'employee_permissions',
    'money_operation_requests'
  )
order by c.relname;

select
  auth_user.email,
  app_user.id is not null as has_public_user_profile,
  app_user.role,
  coalesce(app_user.pin_hash, '') <> '' as has_pin_hash
from auth.users as auth_user
left join public.users as app_user on app_user.id = auth_user.id
order by auth_user.email;

select
  schemaname,
  tablename,
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'produk',
    'stok_mutasi',
    'services_products',
    'transaksi_dompet',
    'wallet_accounts',
    'notification_jobs',
    'operational_events',
    'product_activity_logs',
    'kas',
    'shifts',
    'employee_permissions',
    'money_operation_requests'
  )
order by tablename, policyname;

select
  c.relname as table_name,
  trigger_info.tgname as trigger_name,
  not trigger_info.tgisinternal as user_trigger
from pg_trigger as trigger_info
join pg_class as c on c.oid = trigger_info.tgrelid
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('audit_logs', 'transaksi_dompet')
  and trigger_info.tgname in (
    'trg_prevent_audit_log_update',
    'trg_prevent_audit_log_delete',
    'trg_prevent_wallet_ledger_update',
    'trg_prevent_wallet_ledger_delete'
  )
order by c.relname, trigger_info.tgname;
