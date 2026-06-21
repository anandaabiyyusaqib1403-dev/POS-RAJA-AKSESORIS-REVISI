create extension if not exists pgcrypto;
set search_path = public, extensions;

alter table public.users
  add column if not exists cashier_station text,
  add column if not exists station_code text,
  add column if not exists station_name text;

alter table public.shifts
  add column if not exists employee_id uuid,
  add column if not exists employee_name text,
  add column if not exists cashier_station text,
  add column if not exists station_code text,
  add column if not exists station_name text,
  add column if not exists shift_type text not null default 'Pagi';

alter table public.shifts
  add constraint shifts_employee_id_fkey
  foreign key (employee_id) references public.users(id)
  not valid;

do $$
begin
  alter table public.shifts validate constraint shifts_employee_id_fkey;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.users
    add constraint users_cashier_station_check
    check (cashier_station is null or cashier_station in ('Kasir 1', 'Kasir 2', 'Kasir 3', 'Kasir 4'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.shifts
    add constraint shifts_cashier_station_check
    check (cashier_station is null or cashier_station in ('Kasir 1', 'Kasir 2', 'Kasir 3', 'Kasir 4'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.shifts
    add constraint shifts_shift_type_check
    check (shift_type in ('Pagi', 'Siang', 'Full Day', 'Lembur', 'Backup'));
exception
  when duplicate_object then null;
end $$;

update public.users
set
  station_name = coalesce(station_name, cashier_station),
  station_code = coalesce(
    station_code,
    case
      when cashier_station is null then null
      else lower(replace(cashier_station, ' ', '_'))
    end
  )
where station_name is distinct from coalesce(station_name, cashier_station)
   or station_code is null;

update public.shifts as shift_row
set
  employee_id = coalesce(shift_row.employee_id, shift_row.cashier_id),
  employee_name = coalesce(shift_row.employee_name, app_user.nama),
  station_name = coalesce(shift_row.station_name, shift_row.cashier_station),
  station_code = coalesce(
    shift_row.station_code,
    case
      when shift_row.cashier_station is null then null
      else lower(replace(shift_row.cashier_station, ' ', '_'))
    end
  ),
  shift_type = coalesce(nullif(shift_row.shift_type, ''), 'Pagi')
from public.users as app_user
where app_user.id = shift_row.cashier_id;

create unique index if not exists idx_shifts_active_cashier_station
on public.shifts (cashier_station)
where status = 'active'::public.shift_status
  and cashier_station is not null;

create index if not exists idx_shifts_station_start
on public.shifts (cashier_station, start_time desc);

create index if not exists idx_users_cashier_station
on public.users (cashier_station)
where archived_at is null;

drop function if exists public.owner_update_employee_profile(
  uuid,
  text,
  text,
  text,
  public.user_role,
  integer,
  integer,
  integer
);

create or replace function public.owner_update_employee_profile(
  p_user_id uuid,
  p_nama text,
  p_username text,
  p_phone text,
  p_role public.user_role,
  p_base_salary integer default 0,
  p_default_bonus integer default 0,
  p_default_deduction integer default 0,
  p_cashier_station text default null
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
  v_station text := nullif(btrim(coalesce(p_cashier_station, '')), '');
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

  if v_station is not null and v_station not in ('Kasir 1', 'Kasir 2', 'Kasir 3', 'Kasir 4') then
    raise exception 'Pos kasir tidak valid.';
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
    cashier_station = v_station,
    station_name = v_station,
    station_code = case when v_station is null then null else lower(replace(v_station, ' ', '_')) end,
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

grant execute on function public.owner_update_employee_profile(
  uuid,
  text,
  text,
  text,
  public.user_role,
  integer,
  integer,
  integer,
  text
) to authenticated;

notify pgrst, 'reload schema';
