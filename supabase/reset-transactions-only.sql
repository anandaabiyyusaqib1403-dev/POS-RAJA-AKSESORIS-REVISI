begin;

-- Disable triggers for tables that may have insert/update hooks
-- while cleaning up transaction history.
do $$
declare
  v_table text;
begin
  foreach v_table in array['audit_logs', 'return_items', 'returns', 'transaksi_dompet']
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('alter table public.%I disable trigger user', v_table);
    end if;
  end loop;
end $$;

-- Delete only transaction and related history tables.
do $$
declare
  v_table text;
begin
  foreach v_table in array[
    'audit_logs',
    'return_items',
    'returns',
    'transaksi_dompet',
    'item_transaksi',
    'transaksi_digital',
    'transaksi_logistik',
    'transaksi',
    'product_activity_logs'
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

-- Re-enable triggers after cleanup.
do $$
declare
  v_table text;
begin
  foreach v_table in array['audit_logs', 'return_items', 'returns', 'transaksi_dompet']
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('alter table public.%I enable trigger user', v_table);
    end if;
  end loop;
end $$;

commit;

-- Product rows and current stock are preserved.
