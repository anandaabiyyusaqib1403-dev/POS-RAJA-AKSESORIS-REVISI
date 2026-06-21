create table if not exists public.employee_sessions (
  session_id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'online',
  device_summary text,
  user_agent text,
  route text,
  shift_id uuid references public.shifts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint employee_sessions_status_check check (status in ('online', 'idle', 'offline'))
);

alter table public.employee_sessions enable row level security;

create index if not exists idx_employee_sessions_user_seen
on public.employee_sessions (user_id, last_seen_at desc);

create index if not exists idx_employee_sessions_live
on public.employee_sessions (last_seen_at desc)
where ended_at is null;

drop policy if exists "employee sessions read own or owner" on public.employee_sessions;
create policy "employee sessions read own or owner"
on public.employee_sessions
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_role() = 'pemilik'::public.user_role
);

drop policy if exists "employee sessions insert own" on public.employee_sessions;
create policy "employee sessions insert own"
on public.employee_sessions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "employee sessions update own or owner" on public.employee_sessions;
create policy "employee sessions update own or owner"
on public.employee_sessions
for update
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_role() = 'pemilik'::public.user_role
)
with check (
  user_id = auth.uid()
  or public.current_user_role() = 'pemilik'::public.user_role
);

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
  v_status text := coalesce(nullif(p_status, ''), 'online');
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

  insert into public.employee_sessions (
    session_id,
    user_id,
    status,
    device_summary,
    user_agent,
    route,
    shift_id,
    metadata,
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
    last_seen_at = now(),
    ended_at = null
  where public.employee_sessions.user_id = auth.uid()
  returning * into v_session;

  if v_session.session_id is null then
    raise exception 'Session tidak dapat diperbarui.';
  end if;

  return v_session;
end;
$$;

create or replace function public.end_employee_session(p_session_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update public.employee_sessions
  set
    status = 'offline',
    last_seen_at = now(),
    ended_at = coalesce(ended_at, now())
  where session_id = left(coalesce(p_session_id, ''), 120)
    and user_id = auth.uid();
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
  latest_session.started_at as session_started_at,
  latest_session.last_seen_at,
  latest_session.ended_at,
  case
    when users.status <> 'active' then 'blocked'
    when latest_session.session_id is null then 'offline'
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

revoke all on public.employee_sessions from anon, public;
revoke all on public.employee_roster_operational from anon, public;

grant select, insert, update on public.employee_sessions to authenticated;
grant select on public.employee_roster_operational to authenticated;
grant execute on function public.touch_employee_session(text, text, text, text, text, uuid, jsonb) to authenticated;
grant execute on function public.end_employee_session(text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.employee_sessions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

comment on table public.employee_sessions is
  'Per-tab staff session heartbeat for POS online/idle/offline visibility.';

comment on view public.employee_roster_operational is
  'Owner/staff roster aggregate with account, session, active shift, and today performance data.';

notify pgrst, 'reload schema';
