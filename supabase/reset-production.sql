begin;

-- Reset operational data only.
--
-- Preserved:
-- - public.produk
-- - public.services_products
-- - public.users / auth users
-- - user login accounts
--
-- Some production-hardening tables are append-only by trigger. The trigger
-- changes are scoped to this transaction and are restored before commit.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'audit_logs',
    'return_items',
    'returns',
    'transaksi_dompet'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('alter table public.%I disable trigger user', v_table);
    end if;
  end loop;
end $$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'notification_jobs',
    'operational_events',
    'employee_sessions',
    'employee_payrolls',
    'stock_opname_items',
    'stock_opname_sessions',
    'supplier_return_items',
    'customer_return_items',
    'supplier_transactions',
    'financial_logs',
    'return_items',
    'customer_returns',
    'supplier_returns',
    'returns',
    'item_transaksi',
    'transaksi_digital',
    'transaksi_logistik',
    'transaksi_dompet',
    'kas',
    'stok_masuk',
    'stok_mutasi',
    'product_activity_logs',
    'audit_logs',
    'transaksi',
    'shifts',
    'suppliers'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('delete from public.%I', v_table);
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.wallet_accounts') is not null then
    update public.wallet_accounts
    set current_balance = 0,
        updated_at = now();
  end if;
end $$;

insert into public.app_settings (key, value, updated_by, updated_at)
values
  ('pin_required_enabled', '{"enabled": true}'::jsonb, null, now()),
  (
    'security_controls',
    '{
      "refund": {"enabled": true, "requiredBy": "kasir_owner"},
      "retur": {"enabled": true, "requiredBy": "kasir_owner"},
      "stock": {"enabled": true, "requiredBy": "kasir_owner"},
      "price": {"enabled": true, "requiredBy": "owner_only"},
      "delete_transaction": {"enabled": true, "requiredBy": "owner_only"},
      "closing_shift": {"enabled": true, "requiredBy": "kasir_owner"}
    }'::jsonb,
    null,
    now()
  )
on conflict (key)
do update set
  value = excluded.value,
  updated_by = null,
  updated_at = excluded.updated_at;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'audit_logs',
    'return_items',
    'returns',
    'transaksi_dompet'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('alter table public.%I enable trigger user', v_table);
    end if;
  end loop;
end $$;

commit;

-- Product rows and current stock are intentionally preserved.
