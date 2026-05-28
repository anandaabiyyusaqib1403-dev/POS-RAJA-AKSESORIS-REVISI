create extension if not exists pgcrypto;
set search_path = public, extensions;

alter table public.users
  add column if not exists email text,
  add column if not exists username text,
  add column if not exists phone text,
  add column if not exists status text not null default 'active',
  add column if not exists base_salary integer not null default 0,
  add column if not exists default_bonus integer not null default 0,
  add column if not exists default_deduction integer not null default 0,
  add column if not exists last_login timestamptz,
  add column if not exists last_device text,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.users
  drop constraint if exists users_status_check,
  add constraint users_status_check check (status in ('active', 'inactive', 'suspended', 'archived'));

alter table public.users
  drop constraint if exists users_base_salary_check,
  add constraint users_base_salary_check check (base_salary >= 0),
  drop constraint if exists users_default_bonus_check,
  add constraint users_default_bonus_check check (default_bonus >= 0),
  drop constraint if exists users_default_deduction_check,
  add constraint users_default_deduction_check check (default_deduction >= 0);

create unique index if not exists idx_users_email_unique
on public.users (lower(email))
where email is not null and archived_at is null;

create unique index if not exists idx_users_username_unique
on public.users (lower(username))
where username is not null and archived_at is null;

create index if not exists idx_users_status_role on public.users (status, role);

update public.users as app_user
set
  email = coalesce(app_user.email, auth_user.email),
  username = coalesce(
    app_user.username,
    nullif(split_part(auth_user.email, '@', 1), ''),
    regexp_replace(lower(app_user.nama), '[^a-z0-9]+', '.', 'g')
  ),
  status = coalesce(nullif(app_user.status, ''), 'active'),
  updated_at = now()
from auth.users as auth_user
where auth_user.id = app_user.id;

create table if not exists public.employee_payrolls (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users(id) on delete cascade,
  period_month date not null,
  base_salary integer not null default 0 check (base_salary >= 0),
  bonus integer not null default 0 check (bonus >= 0),
  deduction integer not null default 0 check (deduction >= 0),
  status text not null default 'waiting' check (status in ('waiting', 'paid', 'late', 'void')),
  notes text not null default '',
  paid_at timestamptz,
  paid_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, period_month)
);

alter table public.employee_payrolls enable row level security;

drop policy if exists "owner read employee payrolls" on public.employee_payrolls;
create policy "owner read employee payrolls"
on public.employee_payrolls
for select
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role);

drop policy if exists "owner manage employee payrolls" on public.employee_payrolls;
create policy "owner manage employee payrolls"
on public.employee_payrolls
for all
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role)
with check (public.current_user_role() = 'pemilik'::public.user_role);

create index if not exists idx_employee_payrolls_employee_period
on public.employee_payrolls (employee_id, period_month desc);

create or replace function public.touch_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_users_updated_at on public.users;
create trigger trg_touch_users_updated_at
before update on public.users
for each row execute function public.touch_users_updated_at();

create or replace function public.touch_employee_payrolls_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_employee_payrolls_updated_at on public.employee_payrolls;
create trigger trg_touch_employee_payrolls_updated_at
before update on public.employee_payrolls
for each row execute function public.touch_employee_payrolls_updated_at();

create or replace function public.ensure_owner_employee_access()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'User belum login.';
  end if;

  if public.current_user_role() <> 'pemilik'::public.user_role then
    raise exception 'Hanya pemilik yang dapat mengelola karyawan.';
  end if;
end;
$$;

create or replace function public.write_employee_audit(
  p_action text,
  p_target_id uuid,
  p_before jsonb default '{}'::jsonb,
  p_after jsonb default '{}'::jsonb,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor_role text;
begin
  select role::text into v_actor_role from public.users where id = auth.uid();

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
    coalesce(v_actor_role, 'unknown'),
    p_action,
    'users',
    p_target_id,
    coalesce(p_before, '{}'::jsonb),
    coalesce(p_after, '{}'::jsonb),
    coalesce(p_reason, ''),
    'EMPLOYEE-MANAGEMENT'
  );
end;
$$;

create or replace function public.owner_update_employee_profile(
  p_user_id uuid,
  p_nama text,
  p_username text,
  p_phone text,
  p_role public.user_role,
  p_base_salary integer default 0,
  p_default_bonus integer default 0,
  p_default_deduction integer default 0
)
returns public.users
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_before jsonb;
  v_after public.users;
  v_owner_count integer;
begin
  perform public.ensure_owner_employee_access();

  if p_user_id is null then
    raise exception 'Karyawan wajib dipilih.';
  end if;

  if coalesce(btrim(p_nama), '') = '' then
    raise exception 'Nama karyawan wajib diisi.';
  end if;

  if coalesce(btrim(p_username), '') !~ '^[a-zA-Z0-9._-]{3,40}$' then
    raise exception 'Username harus 3-40 karakter dan hanya boleh huruf, angka, titik, underscore, atau strip.';
  end if;

  if coalesce(p_base_salary, 0) < 0 or coalesce(p_default_bonus, 0) < 0 or coalesce(p_default_deduction, 0) < 0 then
    raise exception 'Nominal payroll tidak boleh minus.';
  end if;

  select to_jsonb(app_user.*) into v_before from public.users as app_user where app_user.id = p_user_id for update;
  if v_before is null then
    raise exception 'Profil karyawan tidak ditemukan.';
  end if;

  if p_role = 'pemilik'::public.user_role then
    select count(*) into v_owner_count
    from public.users
    where role = 'pemilik'::public.user_role
      and status = 'active'
      and archived_at is null
      and id <> p_user_id;

    if v_owner_count > 0 then
      raise exception 'Tidak bisa membuat lebih dari satu owner aktif dari halaman karyawan.';
    end if;
  end if;

  update public.users
  set
    nama = btrim(p_nama),
    username = lower(btrim(p_username)),
    phone = nullif(btrim(coalesce(p_phone, '')), ''),
    role = p_role,
    base_salary = coalesce(p_base_salary, 0),
    default_bonus = coalesce(p_default_bonus, 0),
    default_deduction = coalesce(p_default_deduction, 0)
  where id = p_user_id
  returning * into v_after;

  perform public.write_employee_audit(
    'employee.profile.update',
    p_user_id,
    v_before,
    to_jsonb(v_after),
    'Update profil karyawan'
  );

  return v_after;
end;
$$;

create or replace function public.owner_set_employee_status(
  p_user_id uuid,
  p_status text,
  p_reason text default ''
)
returns public.users
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_before jsonb;
  v_after public.users;
  v_active_owner_count integer;
begin
  perform public.ensure_owner_employee_access();

  if p_status not in ('active', 'inactive', 'suspended', 'archived') then
    raise exception 'Status karyawan tidak valid.';
  end if;

  select to_jsonb(app_user.*) into v_before from public.users as app_user where app_user.id = p_user_id for update;
  if v_before is null then
    raise exception 'Profil karyawan tidak ditemukan.';
  end if;

  if (v_before->>'role') = 'pemilik' and p_status <> 'active' then
    select count(*) into v_active_owner_count
    from public.users
    where role = 'pemilik'::public.user_role
      and status = 'active'
      and archived_at is null
      and id <> p_user_id;

    if v_active_owner_count = 0 then
      raise exception 'Tidak bisa menonaktifkan satu-satunya owner aktif.';
    end if;
  end if;

  update public.users
  set
    status = p_status,
    archived_at = case when p_status = 'archived' then now() else archived_at end
  where id = p_user_id
  returning * into v_after;

  perform public.write_employee_audit(
    'employee.status.' || p_status,
    p_user_id,
    v_before,
    to_jsonb(v_after),
    p_reason
  );

  return v_after;
end;
$$;

create or replace function public.owner_reset_employee_pin(
  p_user_id uuid,
  p_new_pin text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_before jsonb;
begin
  perform public.ensure_owner_employee_access();

  if coalesce(btrim(p_new_pin), '') !~ '^[0-9]{4,8}$' then
    raise exception 'PIN baru harus berisi 4 sampai 8 digit angka.';
  end if;

  select jsonb_build_object('id', id, 'pin_status', case when pin_hash is null then 'empty' else 'set' end)
  into v_before
  from public.users
  where id = p_user_id
  for update;

  if v_before is null then
    raise exception 'Profil karyawan tidak ditemukan.';
  end if;

  update public.users
  set pin_hash = crypt(btrim(p_new_pin), gen_salt('bf'))
  where id = p_user_id;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'pin'
  where id = p_user_id;

  perform public.write_employee_audit(
    'employee.pin.reset',
    p_user_id,
    v_before,
    jsonb_build_object('id', p_user_id, 'pin_status', 'set'),
    'Reset PIN karyawan'
  );

  return true;
end;
$$;

create or replace function public.owner_save_employee_payroll(
  p_employee_id uuid,
  p_period_month date,
  p_base_salary integer,
  p_bonus integer,
  p_deduction integer,
  p_status text,
  p_notes text default ''
)
returns public.employee_payrolls
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_period date := date_trunc('month', coalesce(p_period_month, current_date))::date;
  v_before jsonb := '{}'::jsonb;
  v_after public.employee_payrolls;
begin
  perform public.ensure_owner_employee_access();

  if p_status not in ('waiting', 'paid', 'late', 'void') then
    raise exception 'Status payroll tidak valid.';
  end if;

  if coalesce(p_base_salary, 0) < 0 or coalesce(p_bonus, 0) < 0 or coalesce(p_deduction, 0) < 0 then
    raise exception 'Nominal payroll tidak boleh minus.';
  end if;

  if not exists (select 1 from public.users where id = p_employee_id and archived_at is null) then
    raise exception 'Karyawan tidak ditemukan.';
  end if;

  select to_jsonb(payroll.*)
  into v_before
  from public.employee_payrolls as payroll
  where payroll.employee_id = p_employee_id and payroll.period_month = v_period
  for update;

  insert into public.employee_payrolls (
    employee_id,
    period_month,
    base_salary,
    bonus,
    deduction,
    status,
    notes,
    paid_at,
    paid_by
  )
  values (
    p_employee_id,
    v_period,
    coalesce(p_base_salary, 0),
    coalesce(p_bonus, 0),
    coalesce(p_deduction, 0),
    p_status,
    coalesce(p_notes, ''),
    case when p_status = 'paid' then now() else null end,
    case when p_status = 'paid' then auth.uid() else null end
  )
  on conflict (employee_id, period_month)
  do update set
    base_salary = excluded.base_salary,
    bonus = excluded.bonus,
    deduction = excluded.deduction,
    status = excluded.status,
    notes = excluded.notes,
    paid_at = case when excluded.status = 'paid' then coalesce(public.employee_payrolls.paid_at, now()) else null end,
    paid_by = case when excluded.status = 'paid' then coalesce(public.employee_payrolls.paid_by, auth.uid()) else null end
  returning * into v_after;

  perform public.write_employee_audit(
    'employee.payroll.save',
    p_employee_id,
    coalesce(v_before, '{}'::jsonb),
    to_jsonb(v_after),
    'Simpan payroll karyawan'
  );

  return v_after;
end;
$$;

create or replace function public.record_user_login(p_device text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update public.users
  set
    last_login = now(),
    last_device = nullif(left(coalesce(p_device, ''), 160), '')
  where id = auth.uid();
end;
$$;

create or replace view public.employee_performance_daily as
with accessory_sales as (
  select
    t.kasir_id as employee_id,
    date_trunc('day', t.created_at)::date as period_date,
    count(distinct t.id)::integer as transactions,
    coalesce(sum(t.total_bayar), 0)::bigint as revenue,
    coalesce(sum(i.qty), 0)::integer as items,
    0::bigint as refund,
    0::bigint as closing_difference
  from public.transaksi t
  left join public.item_transaksi i on i.transaksi_id = t.id
  where t.deleted_at is null
  group by 1, 2
),
digital_sales as (
  select
    kasir_id as employee_id,
    date_trunc('day', created_at)::date as period_date,
    count(*)::integer as transactions,
    coalesce(sum(harga_jual), 0)::bigint as revenue,
    count(*)::integer as items,
    0::bigint as refund,
    0::bigint as closing_difference
  from public.transaksi_digital
  where deleted_at is null
  group by 1, 2
),
shift_differences as (
  select
    cashier_id as employee_id,
    date_trunc('day', coalesce(end_time, start_time, created_at))::date as period_date,
    0::integer as transactions,
    0::bigint as revenue,
    0::integer as items,
    0::bigint as refund,
    coalesce(sum(difference), 0)::bigint as closing_difference
  from public.shifts
  group by 1, 2
)
select
  employee_id,
  period_date,
  sum(transactions)::integer as transactions,
  sum(revenue)::bigint as revenue,
  sum(items)::integer as items,
  sum(refund)::bigint as refund,
  sum(closing_difference)::bigint as closing_difference
from (
  select * from accessory_sales
  union all select * from digital_sales
  union all select * from shift_differences
) rows
where employee_id is not null
group by employee_id, period_date;

grant select on public.employee_payrolls, public.employee_performance_daily to authenticated;
grant execute on function public.owner_update_employee_profile(uuid, text, text, text, public.user_role, integer, integer, integer) to authenticated;
grant execute on function public.owner_set_employee_status(uuid, text, text) to authenticated;
grant execute on function public.owner_reset_employee_pin(uuid, text) to authenticated;
grant execute on function public.owner_save_employee_payroll(uuid, date, integer, integer, integer, text, text) to authenticated;
grant execute on function public.record_user_login(text) to authenticated;

notify pgrst, 'reload schema';
