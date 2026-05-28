-- Audit retention foundation: measure growth and classify evidence before any archive/purge policy.
-- This migration intentionally does not delete immutable audit evidence.

create or replace function public.audit_retention_class(
  p_action text,
  p_incident_code text default '',
  p_target_table text default ''
)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when upper(coalesce(p_incident_code, '')) in (
      'MONEY-FLOW',
      'INVENTORY-CONTROL',
      'SECURITY-CONTROLS',
      'EMPLOYEE-MANAGEMENT'
    ) then 'critical'
    when lower(coalesce(p_target_table, '')) in (
      'kas',
      'shifts',
      'stok_mutasi',
      'transaksi',
      'transaksi_digital',
      'transaksi_dompet',
      'wallet_accounts',
      'employee_permissions',
      'app_settings'
    ) then 'critical'
    when lower(coalesce(p_action, '')) ~
      '(void|refund|retur|return|wallet|cash|stock|shift|pin|permission|security|delete|revoke|reset|sensitive_action)'
      then 'critical'
    when upper(coalesce(p_incident_code, '')) = 'WHATSAPP-INTEGRATION'
      or lower(coalesce(p_action, '')) ~ '(notification|whatsapp|integration|print)'
      then 'diagnostic'
    else 'operational'
  end;
$$;

comment on function public.audit_retention_class(text, text, text) is
  'Classifies audit evidence for storage planning only. Critical evidence must not be auto-deleted.';

create index if not exists idx_audit_logs_action_created_at
on public.audit_logs (action, created_at desc);

create index if not exists idx_product_activity_logs_action_created_at
on public.product_activity_logs (action, created_at desc);

create or replace function public.owner_get_audit_storage_summary()
returns table (
  source text,
  estimated_rows bigint,
  total_bytes bigint,
  oldest_created_at timestamptz,
  newest_created_at timestamptz,
  retention_note text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.ensure_owner_employee_access();

  return query
  select
    'audit_logs'::text,
    greatest(coalesce(table_stats.n_live_tup, 0), 0)::bigint,
    pg_total_relation_size('public.audit_logs'::regclass)::bigint,
    (select created_at from public.audit_logs order by created_at asc limit 1),
    (select created_at from public.audit_logs order by created_at desc limit 1),
    'Audit kritis dipertahankan. Tinjau diagnostic untuk archive setelah 180 hari.'::text
  from pg_stat_user_tables as table_stats
  where table_stats.relid = 'public.audit_logs'::regclass

  union all

  select
    'product_activity_logs'::text,
    greatest(coalesce(table_stats.n_live_tup, 0), 0)::bigint,
    pg_total_relation_size('public.product_activity_logs'::regclass)::bigint,
    (select created_at from public.product_activity_logs order by created_at asc limit 1),
    (select created_at from public.product_activity_logs order by created_at desc limit 1),
    'Snapshot stok/hapus dipertahankan; snapshot produk rutin dapat diarsipkan setelah kebijakan disetujui.'::text
  from pg_stat_user_tables as table_stats
  where table_stats.relid = 'public.product_activity_logs'::regclass

  union all

  select
    'employee_sessions'::text,
    greatest(coalesce(table_stats.n_live_tup, 0), 0)::bigint,
    pg_total_relation_size('public.employee_sessions'::regclass)::bigint,
    (select started_at from public.employee_sessions order by started_at asc limit 1),
    (select last_seen_at from public.employee_sessions order by last_seen_at desc limit 1),
    'Session non-revoke dapat diarsipkan setelah 180 hari bila investigasi operasional selesai.'::text
  from pg_stat_user_tables as table_stats
  where table_stats.relid = 'public.employee_sessions'::regclass;
end;
$$;

create or replace function public.owner_get_audit_storage_breakdown(
  p_limit integer default 20
)
returns table (
  source text,
  action text,
  retention_class text,
  event_count bigint,
  payload_bytes bigint,
  oldest_created_at timestamptz,
  newest_created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  perform public.ensure_owner_employee_access();

  return query
  select ranked.*
  from (
    select
      'audit_logs'::text as source,
      audit_row.action,
      public.audit_retention_class(
        audit_row.action,
        audit_row.incident_code,
        audit_row.target_table
      ) as retention_class,
      count(*)::bigint as event_count,
      coalesce(sum(pg_column_size(audit_row)), 0)::bigint as payload_bytes,
      min(audit_row.created_at) as oldest_created_at,
      max(audit_row.created_at) as newest_created_at
    from public.audit_logs as audit_row
    group by
      audit_row.action,
      public.audit_retention_class(
        audit_row.action,
        audit_row.incident_code,
        audit_row.target_table
      )

    union all

    select
      'product_activity_logs'::text as source,
      product_log.action,
      case
        when product_log.action in (
          'delete_product',
          'permanent_delete_product',
          'update_stock'
        ) then 'critical'
        else 'operational'
      end as retention_class,
      count(*)::bigint as event_count,
      coalesce(sum(pg_column_size(product_log)), 0)::bigint as payload_bytes,
      min(product_log.created_at) as oldest_created_at,
      max(product_log.created_at) as newest_created_at
    from public.product_activity_logs as product_log
    group by product_log.action
  ) as ranked
  order by ranked.payload_bytes desc, ranked.event_count desc
  limit v_limit;
end;
$$;

revoke all on function public.audit_retention_class(text, text, text) from public, anon;
revoke all on function public.owner_get_audit_storage_summary() from public, anon;
revoke all on function public.owner_get_audit_storage_breakdown(integer) from public, anon;

grant execute on function public.audit_retention_class(text, text, text) to authenticated;
grant execute on function public.owner_get_audit_storage_summary() to authenticated;
grant execute on function public.owner_get_audit_storage_breakdown(integer) to authenticated;

comment on function public.owner_get_audit_storage_summary() is
  'Owner-only lightweight relation-size monitor using PostgreSQL row estimates and indexed date bounds.';

comment on function public.owner_get_audit_storage_breakdown(integer) is
  'Owner-only on-demand event scan used to design retention without deleting critical evidence.';

notify pgrst, 'reload schema';
