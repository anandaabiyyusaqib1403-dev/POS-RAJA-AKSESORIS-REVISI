alter type public.shift_status add value if not exists 'approved_with_correction';

do $$
begin
  if to_regclass('public.financial_logs') is null
     and to_regclass('public.finacial_logs') is not null then
    alter table public.finacial_logs rename to financial_logs;
  end if;
end $$;

create table if not exists public.financial_logs (
  id uuid primary key default gen_random_uuid(),
  kasir_id uuid references public.users(id),
  log_type text not null,
  direction text not null,
  amount integer not null,
  payment_method text,
  source_type text,
  source_id uuid,
  reference text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.financial_logs enable row level security;

alter table public.shifts
  add column if not exists approved_at timestamptz,
  add column if not exists correction_difference integer not null default 0,
  add column if not exists correction_type text not null default '';

do $$
begin
  alter table public.shifts
    drop constraint if exists shifts_correction_type_check;

  alter table public.shifts
    add constraint shifts_correction_type_check
    check (correction_type in ('', 'Kas Lebih', 'Kas Kurang'));
end $$;

alter table public.financial_logs
  drop constraint if exists finacial_logs_log_type_check,
  drop constraint if exists financial_logs_log_type_check;

alter table public.financial_logs
  add constraint financial_logs_log_type_check
  check (
    log_type in (
      'adjustment',
      'Kas Lebih',
      'Kas Kurang'
    )
  );

drop policy if exists "owner insert financial logs" on public.financial_logs;
create policy "owner insert financial logs"
on public.financial_logs
for insert
to authenticated
with check (public.current_user_role() = 'pemilik');

comment on column public.shifts.approved_at is
  'Timestamp saat owner menyetujui shift.';

comment on column public.shifts.correction_difference is
  'Nilai selisih kas yang disetujui owner saat approve with correction.';

comment on column public.shifts.correction_type is
  'Jenis koreksi kas: Kas Lebih atau Kas Kurang.';

create or replace function public.approve_shift_with_correction_atomic(
  p_shift_id uuid,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_shift public.shifts%rowtype;
  v_shift_found boolean := false;
  v_notes text := btrim(coalesce(p_notes, ''));
  v_difference integer;
  v_correction_type text;
  v_approved_at timestamptz := now();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role <> 'pemilik'::public.user_role then
    raise exception 'Hanya owner yang bisa setujui shift dengan koreksi.';
  end if;

  if v_notes = '' then
    raise exception 'Catatan owner wajib diisi untuk setujui dengan koreksi.';
  end if;

  for v_shift in
    select *
    from public.shifts
    where id = p_shift_id
      and status in ('pending'::public.shift_status, 'flagged'::public.shift_status)
    for update
  loop
    v_shift_found := true;
    exit;
  end loop;

  if not v_shift_found then
    raise exception 'Shift tidak ditemukan atau belum siap disetujui.';
  end if;

  v_difference := coalesce((v_shift).difference, coalesce((v_shift).actual_cash, 0) - (v_shift).total_cash);

  if v_difference = 0 then
    raise exception 'Setujui dengan koreksi hanya untuk shift yang memiliki selisih.';
  end if;

  v_correction_type := case when v_difference > 0 then 'Kas Lebih' else 'Kas Kurang' end;

  update public.shifts
  set
    status = 'approved_with_correction'::public.shift_status,
    approved_by = v_user_id,
    approved_at = v_approved_at,
    approval_notes = v_notes,
    correction_difference = v_difference,
    correction_type = v_correction_type
  where id = p_shift_id;

  insert into public.financial_logs (
    kasir_id,
    log_type,
    direction,
    amount,
    payment_method,
    source_type,
    source_id,
    reference,
    notes,
    created_by,
    created_at
  )
  values (
    (v_shift).cashier_id,
    v_correction_type,
    case when v_difference > 0 then 'in' else 'out' end,
    abs(v_difference),
    'cash',
    'shift_correction',
    p_shift_id,
    'SHIFT-' || p_shift_id::text,
    v_notes,
    v_user_id,
    v_approved_at
  );

  v_result := (
    select to_jsonb(shift_row)
    from public.shifts as shift_row
    where shift_row.id = p_shift_id
  );
  return v_result;
end;
$$;

grant execute on function public.approve_shift_with_correction_atomic(uuid, text) to authenticated;
