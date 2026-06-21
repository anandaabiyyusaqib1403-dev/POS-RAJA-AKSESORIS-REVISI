-- Tutup shift aktif setelah batas ganti hari kerja jam 05:00 WIB.

create or replace function public.shift_auto_close_cutoff(
  p_reference timestamptz default now()
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_local timestamp := p_reference at time zone 'Asia/Jakarta';
  v_cutoff_local timestamp;
begin
  v_cutoff_local := date_trunc('day', v_local) + time '05:00';

  if v_local < v_cutoff_local then
    v_cutoff_local := v_cutoff_local - interval '1 day';
  end if;

  return v_cutoff_local at time zone 'Asia/Jakarta';
end;
$$;

create or replace function public.auto_close_expired_active_shifts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := public.shift_auto_close_cutoff(now());
  v_closed_count integer := 0;
begin
  update public.shifts
  set status = 'pending'::public.shift_status,
      end_time = v_cutoff,
      notes = nullif(
        concat_ws(
          E'\n',
          nullif(notes, ''),
          'Shift ditutup karena sudah lewat jam 05.00 WIB.'
        ),
        ''
      ),
      updated_at = now()
  where status = 'active'::public.shift_status
    and start_time < v_cutoff;

  get diagnostics v_closed_count = row_count;
  return v_closed_count;
end;
$$;

create or replace function public.is_shift_active_for_transaction(
  p_shift_id uuid,
  p_cashier_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.auto_close_expired_active_shifts();

  return exists (
    select 1
    from public.shifts s
    where s.id = p_shift_id
      and s.cashier_id = p_cashier_id
      and s.status = 'active'::public.shift_status
      and s.start_time >= public.shift_auto_close_cutoff(now())
  );
end;
$$;

create or replace function public.assert_insert_shift_is_current()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.shift_id is null then
    raise exception 'Mulai shift dulu sebelum menyimpan transaksi.';
  end if;

  if not public.is_shift_active_for_transaction(new.shift_id, new.kasir_id) then
    raise exception 'Shift sudah lewat jam 05.00 WIB. Buka shift baru dulu sebelum menyimpan transaksi.';
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.transaksi') is not null then
    drop trigger if exists trg_transaksi_shift_current on public.transaksi;
    create trigger trg_transaksi_shift_current
    before insert on public.transaksi
    for each row
    execute function public.assert_insert_shift_is_current();
  end if;

  if to_regclass('public.transaksi_digital') is not null then
    drop trigger if exists trg_transaksi_digital_shift_current on public.transaksi_digital;
    create trigger trg_transaksi_digital_shift_current
    before insert on public.transaksi_digital
    for each row
    execute function public.assert_insert_shift_is_current();
  end if;

  if to_regclass('public.transaksi_logistik') is not null then
    drop trigger if exists trg_transaksi_logistik_shift_current on public.transaksi_logistik;
    create trigger trg_transaksi_logistik_shift_current
    before insert on public.transaksi_logistik
    for each row
    execute function public.assert_insert_shift_is_current();
  end if;
end $$;

create or replace view public.current_shifts
with (security_invoker = true)
as
select
  cashier_id,
  id,
  start_time,
  status,
  end_time
from public.shifts
where status = 'active'::public.shift_status
  and start_time >= public.shift_auto_close_cutoff(now());

create or replace function public.get_current_shift_id(cashier_uuid uuid)
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  return (
    select id
    from public.current_shifts
    where cashier_id = cashier_uuid
    limit 1
  );
end;
$$;

grant execute on function public.shift_auto_close_cutoff(timestamptz) to authenticated;
grant execute on function public.auto_close_expired_active_shifts() to authenticated;
grant execute on function public.is_shift_active_for_transaction(uuid, uuid) to authenticated;
grant execute on function public.assert_insert_shift_is_current() to authenticated;
grant select on public.current_shifts to authenticated;
grant execute on function public.get_current_shift_id(uuid) to authenticated;

notify pgrst, 'reload schema';
