create extension if not exists pgcrypto;
set search_path = public, extensions;

alter table public.employee_sessions
  add column if not exists activity_status text,
  add column if not exists activity_updated_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.users(id),
  add column if not exists revoke_reason text;

create index if not exists idx_employee_sessions_revoked
on public.employee_sessions (user_id, revoked_at desc)
where revoked_at is not null;

create index if not exists idx_employee_sessions_activity_seen
on public.employee_sessions (user_id, activity_updated_at desc, last_seen_at desc);

create table if not exists public.employee_permissions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users(id) on delete cascade,
  permission_key text not null,
  allowed boolean not null default false,
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, permission_key),
  constraint employee_permissions_key_check
    check (permission_key ~ '^[a-z_]+[.][a-z_]+$')
);

alter table public.employee_permissions enable row level security;

create index if not exists idx_employee_permissions_employee
on public.employee_permissions (employee_id, permission_key);

drop policy if exists "employee permissions read own or owner" on public.employee_permissions;
create policy "employee permissions read own or owner"
on public.employee_permissions
for select
to authenticated
using (
  employee_id = auth.uid()
  or public.current_user_role() = 'pemilik'::public.user_role
);

drop policy if exists "owner manage employee permissions" on public.employee_permissions;
create policy "owner manage employee permissions"
on public.employee_permissions
for all
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role)
with check (public.current_user_role() = 'pemilik'::public.user_role);

create table if not exists public.employee_notes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users(id) on delete cascade,
  note_type text not null default 'note',
  note text not null,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_notes_type_check check (note_type in ('note', 'warning', 'trusted')),
  constraint employee_notes_text_check check (length(btrim(note)) between 1 and 600)
);

alter table public.employee_notes enable row level security;

create index if not exists idx_employee_notes_employee_created
on public.employee_notes (employee_id, created_at desc);

drop policy if exists "owner read employee notes" on public.employee_notes;
create policy "owner read employee notes"
on public.employee_notes
for select
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role);

drop policy if exists "owner manage employee notes" on public.employee_notes;
create policy "owner manage employee notes"
on public.employee_notes
for all
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role)
with check (public.current_user_role() = 'pemilik'::public.user_role);

create or replace function public.touch_employee_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_employee_notes_updated_at on public.employee_notes;
create trigger trg_touch_employee_notes_updated_at
before update on public.employee_notes
for each row execute function public.touch_employee_notes_updated_at();

create or replace function public.touch_employee_permissions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_employee_permissions_updated_at on public.employee_permissions;
create trigger trg_touch_employee_permissions_updated_at
before update on public.employee_permissions
for each row execute function public.touch_employee_permissions_updated_at();

create or replace function public.employee_permission_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'transaction.refund',
    'transaction.void',
    'transaction.delete',
    'product.stock_edit',
    'product.price_edit',
    'shift.close',
    'finance.cash_wallet',
    'employee.pin_reset',
    'employee.session_revoke',
    'settings.security_manage'
  ]::text[];
$$;

create or replace function public.current_user_has_employee_permission(p_permission_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_status text;
begin
  if auth.uid() is null then
    return false;
  end if;

  select role, status
  into v_role, v_status
  from public.users
  where id = auth.uid()
    and archived_at is null;

  if v_role = 'pemilik'::public.user_role then
    return true;
  end if;

  if coalesce(v_status, 'active') <> 'active' then
    return false;
  end if;

  return exists (
    select 1
    from public.employee_permissions
    where employee_id = auth.uid()
      and permission_key = p_permission_key
      and allowed is true
  );
end;
$$;

create or replace function public.owner_get_employee_permissions(p_employee_id uuid)
returns table (
  permission_key text,
  allowed boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_owner_employee_access();

  if not exists (
    select 1 from public.users where id = p_employee_id and archived_at is null
  ) then
    raise exception 'Karyawan tidak ditemukan.';
  end if;

  return query
  select
    keys.permission_key,
    coalesce(permission.allowed, false) as allowed,
    permission.updated_at
  from unnest(public.employee_permission_keys()) as keys(permission_key)
  left join public.employee_permissions as permission
    on permission.employee_id = p_employee_id
   and permission.permission_key = keys.permission_key
  order by keys.permission_key;
end;
$$;

create or replace function public.owner_set_employee_permissions(
  p_employee_id uuid,
  p_permissions jsonb,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_allowed_keys text[] := public.employee_permission_keys();
  v_item record;
begin
  perform public.ensure_owner_employee_access();

  if jsonb_typeof(coalesce(p_permissions, '{}'::jsonb)) <> 'object' then
    raise exception 'Format permission tidak valid.';
  end if;

  if not exists (
    select 1 from public.users where id = p_employee_id and archived_at is null
  ) then
    raise exception 'Karyawan tidak ditemukan.';
  end if;

  select coalesce(jsonb_object_agg(permission_key, allowed), '{}'::jsonb)
  into v_before
  from public.employee_permissions
  where employee_id = p_employee_id;

  for v_item in select key, value from jsonb_each(p_permissions)
  loop
    if not (v_item.key = any(v_allowed_keys)) then
      raise exception 'Permission % tidak dikenal.', v_item.key;
    end if;

    if jsonb_typeof(v_item.value) <> 'boolean' then
      raise exception 'Permission % harus boolean.', v_item.key;
    end if;

    insert into public.employee_permissions (
      employee_id,
      permission_key,
      allowed,
      updated_by
    )
    values (
      p_employee_id,
      v_item.key,
      (v_item.value #>> '{}')::boolean,
      auth.uid()
    )
    on conflict (employee_id, permission_key)
    do update set
      allowed = excluded.allowed,
      updated_by = excluded.updated_by,
      updated_at = now();
  end loop;

  select coalesce(jsonb_object_agg(permission_key, allowed), '{}'::jsonb)
  into v_after
  from public.employee_permissions
  where employee_id = p_employee_id;

  perform public.write_employee_audit(
    'employee.permissions.update',
    p_employee_id,
    coalesce(v_before, '{}'::jsonb),
    coalesce(v_after, '{}'::jsonb),
    coalesce(p_reason, 'Update permission karyawan')
  );

  return coalesce(v_after, '{}'::jsonb);
end;
$$;

create or replace function public.owner_save_employee_note(
  p_employee_id uuid,
  p_note_type text,
  p_note text
)
returns public.employee_notes
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_note public.employee_notes;
begin
  perform public.ensure_owner_employee_access();

  if p_note_type not in ('note', 'warning', 'trusted') then
    raise exception 'Jenis catatan tidak valid.';
  end if;

  if not exists (
    select 1 from public.users where id = p_employee_id and archived_at is null
  ) then
    raise exception 'Karyawan tidak ditemukan.';
  end if;

  insert into public.employee_notes (
    employee_id,
    note_type,
    note,
    created_by
  )
  values (
    p_employee_id,
    p_note_type,
    btrim(p_note),
    auth.uid()
  )
  returning * into v_note;

  perform public.write_employee_audit(
    'employee.note.create',
    p_employee_id,
    '{}'::jsonb,
    to_jsonb(v_note),
    'Tambah catatan karyawan'
  );

  return v_note;
end;
$$;

create or replace function public.owner_revoke_employee_session(
  p_session_id text,
  p_reason text default ''
)
returns public.employee_sessions
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_before jsonb;
  v_session public.employee_sessions;
begin
  perform public.ensure_owner_employee_access();

  if coalesce(btrim(p_session_id), '') = '' then
    raise exception 'Session tidak valid.';
  end if;

  select to_jsonb(session_row.*)
  into v_before
  from public.employee_sessions as session_row
  where session_id = left(p_session_id, 120)
  for update;

  if v_before is null then
    raise exception 'Session tidak ditemukan.';
  end if;

  update public.employee_sessions
  set
    status = 'offline',
    revoked_at = coalesce(revoked_at, now()),
    revoked_by = auth.uid(),
    revoke_reason = nullif(left(coalesce(p_reason, ''), 240), ''),
    ended_at = coalesce(ended_at, now()),
    last_seen_at = now()
  where session_id = left(p_session_id, 120)
  returning * into v_session;

  perform public.write_employee_audit(
    'employee.session.revoke',
    v_session.user_id,
    coalesce(v_before, '{}'::jsonb),
    to_jsonb(v_session),
    coalesce(p_reason, 'Revoke session karyawan')
  );

  return v_session;
end;
$$;

create or replace function public.touch_employee_session(
  p_session_id text,
  p_device_summary text default null,
  p_user_agent text default null,
  p_route text default null,
  p_status text default 'online',
  p_shift_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.employee_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.employee_sessions;
  v_existing public.employee_sessions;
  v_status text := coalesce(nullif(p_status, ''), 'online');
  v_activity text := nullif(left(coalesce(p_metadata->>'activity_status', ''), 80), '');
begin
  if auth.uid() is null then
    raise exception 'User belum login.';
  end if;

  if coalesce(nullif(btrim(p_session_id), ''), '') = '' then
    raise exception 'Session id tidak valid.';
  end if;

  if v_status not in ('online', 'idle', 'offline') then
    raise exception 'Status session tidak valid.';
  end if;

  select *
  into v_existing
  from public.employee_sessions
  where session_id = left(p_session_id, 120);

  if v_existing.session_id is not null and v_existing.user_id <> auth.uid() then
    raise exception 'Session tidak dapat diperbarui.';
  end if;

  if v_existing.revoked_at is not null then
    return v_existing;
  end if;

  insert into public.employee_sessions (
    session_id,
    user_id,
    status,
    device_summary,
    user_agent,
    route,
    shift_id,
    metadata,
    activity_status,
    activity_updated_at,
    started_at,
    last_seen_at,
    ended_at
  )
  values (
    left(p_session_id, 120),
    auth.uid(),
    v_status,
    nullif(left(coalesce(p_device_summary, ''), 120), ''),
    nullif(left(coalesce(p_user_agent, ''), 512), ''),
    nullif(left(coalesce(p_route, ''), 160), ''),
    p_shift_id,
    coalesce(p_metadata, '{}'::jsonb),
    v_activity,
    case when v_activity is null then null else now() end,
    now(),
    now(),
    null
  )
  on conflict (session_id)
  do update set
    status = excluded.status,
    device_summary = coalesce(excluded.device_summary, public.employee_sessions.device_summary),
    user_agent = coalesce(excluded.user_agent, public.employee_sessions.user_agent),
    route = coalesce(excluded.route, public.employee_sessions.route),
    shift_id = coalesce(excluded.shift_id, public.employee_sessions.shift_id),
    metadata = public.employee_sessions.metadata || excluded.metadata,
    activity_status = coalesce(excluded.activity_status, public.employee_sessions.activity_status),
    activity_updated_at = case
      when excluded.activity_status is not null
       and excluded.activity_status is distinct from public.employee_sessions.activity_status
      then now()
      else public.employee_sessions.activity_updated_at
    end,
    last_seen_at = now(),
    ended_at = null
  where public.employee_sessions.user_id = auth.uid()
    and public.employee_sessions.revoked_at is null
  returning * into v_session;

  if v_session.session_id is null then
    raise exception 'Session tidak dapat diperbarui.';
  end if;

  return v_session;
end;
$$;

create or replace view public.employee_roster_operational
with (security_invoker = true)
as
with latest_session as (
  select distinct on (session_row.user_id)
    session_row.*
  from public.employee_sessions as session_row
  order by session_row.user_id, session_row.last_seen_at desc, session_row.started_at desc
),
active_shift as (
  select distinct on (shift_row.cashier_id)
    shift_row.id,
    shift_row.cashier_id,
    shift_row.start_time,
    shift_row.status
  from public.shifts as shift_row
  where shift_row.status = 'active'
  order by shift_row.cashier_id, shift_row.start_time desc
),
today_performance as (
  select
    performance.employee_id,
    performance.transactions,
    performance.revenue,
    performance.items,
    performance.refund,
    performance.closing_difference
  from public.employee_performance_daily as performance
  where performance.period_date = (now() at time zone 'Asia/Jakarta')::date
)
select
  users.id,
  users.nama,
  users.email,
  users.username,
  users.phone,
  users.role,
  users.status as account_status,
  users.pin_hash is not null as pin_enabled,
  users.base_salary,
  users.default_bonus,
  users.default_deduction,
  users.last_login,
  users.last_device,
  users.created_at,
  users.updated_at,
  latest_session.session_id,
  latest_session.status as session_status_raw,
  latest_session.device_summary,
  latest_session.user_agent,
  latest_session.route,
  latest_session.activity_status,
  latest_session.activity_updated_at,
  latest_session.started_at as session_started_at,
  latest_session.last_seen_at,
  latest_session.ended_at,
  latest_session.revoked_at,
  latest_session.revoked_by,
  latest_session.revoke_reason,
  case
    when users.status <> 'active' then 'blocked'
    when latest_session.session_id is null then 'offline'
    when latest_session.revoked_at is not null then 'offline'
    when latest_session.ended_at is not null then 'offline'
    when latest_session.last_seen_at >= now() - interval '60 seconds' then 'online'
    when latest_session.last_seen_at >= now() - interval '5 minutes' then 'idle'
    else 'offline'
  end as session_status,
  active_shift.id as active_shift_id,
  active_shift.start_time as active_shift_started_at,
  case
    when active_shift.id is not null then 'on_shift'
    else 'no_shift'
  end as shift_status,
  coalesce(today_performance.transactions, 0)::integer as today_transactions,
  coalesce(today_performance.revenue, 0)::bigint as today_revenue,
  coalesce(today_performance.items, 0)::integer as today_items,
  coalesce(today_performance.refund, 0)::bigint as today_refund,
  coalesce(today_performance.closing_difference, 0)::bigint as today_closing_difference
from public.users
left join latest_session on latest_session.user_id = users.id
left join active_shift on active_shift.cashier_id = users.id
left join today_performance on today_performance.employee_id = users.id
where users.archived_at is null;

create or replace function public.owner_get_employee_activity(
  p_employee_id uuid,
  p_limit integer default 30,
  p_before_created_at timestamptz default null,
  p_before_id text default null,
  p_days integer default 30
)
returns table (
  id text,
  created_at timestamptz,
  action text,
  title text,
  detail text,
  tone text,
  source text,
  metadata jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
begin
  perform public.ensure_owner_employee_access();

  if not exists (
    select 1 from public.users where id = p_employee_id and archived_at is null
  ) then
    raise exception 'Karyawan tidak ditemukan.';
  end if;

  return query
  with raw_events as (
    select
      audit.id::text as id,
      audit.created_at,
      audit.action,
      case
        when audit.action like 'employee.%' then 'Perubahan data karyawan'
        when audit.action like 'settings.%' then 'Pengaturan keamanan'
        when audit.action like '%void%' then 'Void transaksi'
        when audit.action like '%return%' or audit.action like '%retur%' then 'Retur/refund'
        else audit.action
      end as title,
      coalesce(nullif(audit.reason, ''), audit.incident_code, audit.target_table) as detail,
      case
        when audit.action like '%void%' or audit.action like '%delete%' then 'danger'
        when audit.action like '%pin%' or audit.action like '%security%' then 'warning'
        when audit.action like '%payroll%' then 'success'
        else 'neutral'
      end as tone,
      'audit'::text as source,
      jsonb_build_object(
        'target_table', audit.target_table,
        'target_id', audit.target_id,
        'incident_code', audit.incident_code
      ) as metadata
    from public.audit_logs as audit
    where audit.actor_id = p_employee_id
       or audit.target_id = p_employee_id

    union all

    select
      ('session-start:' || session_row.session_id)::text as id,
      session_row.started_at as created_at,
      'session.login'::text as action,
      'Login POS'::text as title,
      coalesce(session_row.device_summary, 'Device belum tercatat') as detail,
      'success'::text as tone,
      'session'::text as source,
      jsonb_build_object('route', session_row.route, 'session_id', session_row.session_id) as metadata
    from public.employee_sessions as session_row
    where session_row.user_id = p_employee_id

    union all

    select
      ('session-end:' || session_row.session_id)::text as id,
      session_row.ended_at as created_at,
      case when session_row.revoked_at is not null then 'session.revoked' else 'session.logout' end as action,
      case when session_row.revoked_at is not null then 'Session direvoke owner' else 'Logout POS' end as title,
      coalesce(session_row.revoke_reason, session_row.device_summary, 'Session selesai') as detail,
      case when session_row.revoked_at is not null then 'danger' else 'neutral' end as tone,
      'session'::text as source,
      jsonb_build_object('route', session_row.route, 'session_id', session_row.session_id) as metadata
    from public.employee_sessions as session_row
    where session_row.user_id = p_employee_id
      and session_row.ended_at is not null

    union all

    select
      ('shift-open:' || shift_row.id::text)::text as id,
      shift_row.start_time as created_at,
      'shift.open'::text as action,
      'Opening shift'::text as title,
      coalesce(shift_row.status, 'Shift dibuka') as detail,
      'success'::text as tone,
      'shift'::text as source,
      jsonb_build_object('shift_id', shift_row.id, 'status', shift_row.status) as metadata
    from public.shifts as shift_row
    where shift_row.cashier_id = p_employee_id

    union all

    select
      ('shift-close:' || shift_row.id::text)::text as id,
      shift_row.end_time as created_at,
      'shift.close'::text as action,
      'Closing shift'::text as title,
      ('Selisih ' || coalesce(shift_row.difference, 0)::text) as detail,
      case when coalesce(shift_row.difference, 0) = 0 then 'success' else 'warning' end as tone,
      'shift'::text as source,
      jsonb_build_object('shift_id', shift_row.id, 'status', shift_row.status) as metadata
    from public.shifts as shift_row
    where shift_row.cashier_id = p_employee_id
      and shift_row.end_time is not null

    union all

    select
      ('trx:' || trx.id::text)::text as id,
      trx.created_at,
      case when trx.voided_at is not null then 'transaction.voided' else 'transaction.accessory' end as action,
      case when trx.voided_at is not null then 'Transaksi void' else 'Transaksi aksesoris' end as title,
      coalesce(trx.no_transaksi, trx.id::text) || ' - Rp ' || coalesce(trx.total_bayar, 0)::text as detail,
      case when trx.voided_at is not null then 'danger' else 'success' end as tone,
      'transaction'::text as source,
      jsonb_build_object('transaction_id', trx.id, 'status', trx.status) as metadata
    from public.transaksi as trx
    where trx.kasir_id = p_employee_id
      and trx.deleted_at is null

    union all

    select
      ('digital:' || digital.id::text)::text as id,
      digital.created_at,
      case when digital.voided_at is not null then 'transaction.voided' else 'transaction.digital' end as action,
      case when digital.voided_at is not null then 'Transaksi digital void' else 'Transaksi digital' end as title,
      coalesce(digital.no_transaksi, digital.provider, digital.jenis, digital.id::text) || ' - Rp ' || coalesce(digital.harga_jual, 0)::text as detail,
      case when digital.voided_at is not null then 'danger' else 'success' end as tone,
      'transaction'::text as source,
      jsonb_build_object('transaction_id', digital.id, 'status', digital.status) as metadata
    from public.transaksi_digital as digital
    where digital.kasir_id = p_employee_id
      and digital.deleted_at is null

    union all

    select
      ('return:' || return_row.id::text)::text as id,
      return_row.created_at,
      'return.customer'::text as action,
      'Retur/refund konsumen'::text as title,
      coalesce(return_row.no_retur, return_row.transaction_no, return_row.id::text) || ' - Rp ' || coalesce(return_row.total_refund_amount, 0)::text as detail,
      'warning'::text as tone,
      'return'::text as source,
      jsonb_build_object('return_id', return_row.id, 'status', return_row.status) as metadata
    from public.customer_returns as return_row
    where return_row.created_by = p_employee_id
  ),
  bounded as (
    select *
    from raw_events
    where created_at is not null
      and created_at >= now() - make_interval(days => v_days)
      and (
        p_before_created_at is null
        or created_at < p_before_created_at
        or (created_at = p_before_created_at and id < coalesce(p_before_id, ''))
      )
  )
  select *
  from bounded
  order by created_at desc, id desc
  limit v_limit;
end;
$$;

create or replace function public.owner_get_employee_performance(
  p_employee_id uuid,
  p_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 30);
  v_start date := ((now() at time zone 'Asia/Jakarta')::date - (least(greatest(coalesce(p_days, 7), 1), 30) - 1));
  v_summary jsonb;
  v_trend jsonb;
  v_top_products jsonb;
  v_hours numeric := 0;
  v_shift_count integer := 0;
begin
  perform public.ensure_owner_employee_access();

  if not exists (
    select 1 from public.users where id = p_employee_id and archived_at is null
  ) then
    raise exception 'Karyawan tidak ditemukan.';
  end if;

  select
    coalesce(sum(extract(epoch from coalesce(end_time, now()) - start_time)) / 3600, 0),
    count(*)
  into v_hours, v_shift_count
  from public.shifts
  where cashier_id = p_employee_id
    and start_time >= v_start::timestamptz;

  select jsonb_build_object(
    'transactions', coalesce(sum(transactions), 0),
    'revenue', coalesce(sum(revenue), 0),
    'items', coalesce(sum(items), 0),
    'refund', coalesce(sum(refund), 0),
    'refundCount', (
      select count(*)
      from public.customer_returns as return_row
      where return_row.created_by = p_employee_id
        and return_row.created_at >= v_start::timestamptz
    ),
    'voidCount', (
      select count(*)
      from (
        select id from public.transaksi where kasir_id = p_employee_id and voided_at is not null and voided_at >= v_start::timestamptz
        union all
        select id from public.transaksi_digital where kasir_id = p_employee_id and voided_at is not null and voided_at >= v_start::timestamptz
        union all
        select id from public.transaksi_logistik where kasir_id = p_employee_id and voided_at is not null and voided_at >= v_start::timestamptz
      ) voids
    ),
    'averageTransaction',
      case when coalesce(sum(transactions), 0) = 0 then 0 else round(coalesce(sum(revenue), 0)::numeric / sum(transactions)) end,
    'activeHours', round(v_hours, 2),
    'shiftCount', v_shift_count
  )
  into v_summary
  from public.employee_performance_daily
  where employee_id = p_employee_id
    and period_date >= v_start;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', period_date,
      'transactions', transactions,
      'revenue', revenue,
      'items', items,
      'refund', refund,
      'closingDifference', closing_difference
    )
    order by period_date
  ), '[]'::jsonb)
  into v_trend
  from public.employee_performance_daily
  where employee_id = p_employee_id
    and period_date >= v_start;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'name', product_name,
      'qty', qty,
      'revenue', revenue
    )
    order by qty desc, revenue desc
  ), '[]'::jsonb)
  into v_top_products
  from (
    select
      coalesce(nullif(item.nama_produk, ''), product.nama, 'Produk') as product_name,
      sum(item.qty)::integer as qty,
      sum(item.subtotal)::bigint as revenue
    from public.item_transaksi as item
    join public.transaksi as trx on trx.id = item.transaksi_id
    left join public.produk as product on product.id = item.produk_id
    where trx.kasir_id = p_employee_id
      and trx.deleted_at is null
      and trx.created_at >= v_start::timestamptz
    group by 1
    order by qty desc, revenue desc
    limit 5
  ) top_rows;

  return jsonb_build_object(
    'rangeDays', v_days,
    'summary', coalesce(v_summary, '{}'::jsonb),
    'trend', coalesce(v_trend, '[]'::jsonb),
    'topProducts', coalesce(v_top_products, '[]'::jsonb)
  );
end;
$$;

grant select, insert, update on public.employee_permissions to authenticated;
grant select, insert, update on public.employee_notes to authenticated;
grant execute on function public.employee_permission_keys() to authenticated;
grant execute on function public.current_user_has_employee_permission(text) to authenticated;
grant execute on function public.owner_get_employee_permissions(uuid) to authenticated;
grant execute on function public.owner_set_employee_permissions(uuid, jsonb, text) to authenticated;
grant execute on function public.owner_save_employee_note(uuid, text, text) to authenticated;
grant execute on function public.owner_revoke_employee_session(text, text) to authenticated;
grant execute on function public.owner_get_employee_activity(uuid, integer, timestamptz, text, integer) to authenticated;
grant execute on function public.owner_get_employee_performance(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
