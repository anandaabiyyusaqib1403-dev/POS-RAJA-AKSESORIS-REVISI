-- Production hardening activation: authoritative shift close, void/reversal,
-- wallet snapshots, durable notifications, operational events, and opname conflicts.

create extension if not exists pgcrypto;

alter table public.shifts
  add column if not exists digital_breakdown jsonb not null default '{}'::jsonb;

alter table public.transaksi
  add column if not exists status text not null default 'active',
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id),
  add column if not exists void_reason text not null default '',
  add column if not exists void_reversal_id uuid;

alter table public.transaksi_digital
  add column if not exists status text not null default 'active',
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id),
  add column if not exists void_reason text not null default '',
  add column if not exists void_reversal_id uuid;

alter table public.transaksi_logistik
  add column if not exists status text not null default 'active',
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id),
  add column if not exists void_reason text not null default '',
  add column if not exists void_reversal_id uuid;

alter table public.transaksi_dompet
  add column if not exists balance_before integer,
  add column if not exists balance_after integer,
  add column if not exists reversal_of uuid references public.transaksi_dompet(id);

create table if not exists public.wallet_accounts (
  platform public.nama_platform primary key,
  current_balance integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.wallet_accounts (platform, current_balance, updated_at)
select platform_value, public.pos_wallet_balance(platform_value), now()
from unnest(enum_range(null::public.nama_platform)) as platform_value
on conflict (platform) do update
set
  current_balance = excluded.current_balance,
  updated_at = excluded.updated_at;

alter table public.wallet_accounts enable row level security;

drop policy if exists "authenticated read wallet accounts" on public.wallet_accounts;
create policy "authenticated read wallet accounts"
on public.wallet_accounts
for select
to authenticated
using (true);

create or replace function public.prevent_wallet_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Wallet ledger production bersifat append-only. Gunakan reversal/adjustment.';
end;
$$;

drop trigger if exists trg_prevent_wallet_ledger_update on public.transaksi_dompet;
create trigger trg_prevent_wallet_ledger_update
before update on public.transaksi_dompet
for each row execute function public.prevent_wallet_ledger_mutation();

drop trigger if exists trg_prevent_wallet_ledger_delete on public.transaksi_dompet;
create trigger trg_prevent_wallet_ledger_delete
before delete on public.transaksi_dompet
for each row execute function public.prevent_wallet_ledger_mutation();

create table if not exists public.operational_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  source text not null default 'pos',
  source_id uuid,
  actor_id uuid references auth.users(id),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.operational_events enable row level security;

drop policy if exists "owner read operational events" on public.operational_events;
create policy "owner read operational events"
on public.operational_events
for select
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role);

drop policy if exists "authenticated append operational events" on public.operational_events;
create policy "authenticated append operational events"
on public.operational_events
for insert
to authenticated
with check (actor_id is null or actor_id = auth.uid());

create index if not exists idx_operational_events_open
on public.operational_events (status, severity, created_at desc);

create or replace function public.log_operational_event(
  p_event_type text,
  p_severity text default 'info',
  p_source text default 'pos',
  p_source_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_severity text := case
    when p_severity in ('info', 'warning', 'critical') then p_severity
    else 'info'
  end;
begin
  insert into public.operational_events (
    id,
    event_type,
    severity,
    source,
    source_id,
    actor_id,
    details,
    created_at
  )
  values (
    v_id,
    coalesce(nullif(p_event_type, ''), 'operational_event'),
    v_severity,
    coalesce(nullif(p_source, ''), 'pos'),
    p_source_id,
    auth.uid(),
    coalesce(p_details, '{}'::jsonb),
    now()
  );

  return v_id;
end;
$$;

grant execute on function public.log_operational_event(text, text, text, uuid, jsonb) to authenticated;

create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('opening', 'closing')),
  idempotency_key text not null unique,
  shift_id uuid references public.shifts(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'retrying', 'sent', 'failed', 'held')
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider_response jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_jobs enable row level security;

drop policy if exists "owner read notification jobs" on public.notification_jobs;
create policy "owner read notification jobs"
on public.notification_jobs
for select
to authenticated
using (public.current_user_role() = 'pemilik'::public.user_role);

create index if not exists idx_notification_jobs_status_next
on public.notification_jobs (status, next_attempt_at, created_at);

create or replace function public.set_notification_job_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_notification_jobs_updated_at on public.notification_jobs;
create trigger trg_notification_jobs_updated_at
before update on public.notification_jobs
for each row execute function public.set_notification_job_updated_at();

create or replace function public.pos_insert_wallet_movement_hardened(
  p_kasir_id uuid,
  p_platform public.nama_platform,
  p_jenis public.jenis_dompet_trx,
  p_nominal integer,
  p_biaya_admin integer,
  p_platform_tujuan public.nama_platform,
  p_keterangan text,
  p_source_type text,
  p_source_id uuid,
  p_source_ref text,
  p_created_at timestamptz,
  p_reversal_of uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_source_before integer;
  v_source_after integer;
  v_target_before integer;
  v_target_after integer;
  v_outgoing integer := coalesce(p_nominal, 0) + coalesce(p_biaya_admin, 0);
  v_incoming integer := greatest(coalesce(p_nominal, 0) - coalesce(p_biaya_admin, 0), 0);
begin
  if p_platform is null or coalesce(p_nominal, 0) <= 0 then
    return null;
  end if;

  if coalesce(p_biaya_admin, 0) < 0 then
    raise exception 'Biaya admin tidak boleh negatif.';
  end if;

  if p_jenis = 'masuk'::public.jenis_dompet_trx and coalesce(p_biaya_admin, 0) > p_nominal then
    raise exception 'Biaya admin tidak boleh lebih besar dari nominal masuk.';
  end if;

  insert into public.wallet_accounts (platform, current_balance, updated_at)
  values (p_platform, public.pos_wallet_balance(p_platform), now())
  on conflict (platform) do nothing;

  select current_balance
  into v_source_before
  from public.wallet_accounts
  where platform = p_platform
  for update;

  if p_jenis = 'masuk'::public.jenis_dompet_trx then
    v_source_after := v_source_before + v_incoming;
  elsif p_jenis in ('keluar'::public.jenis_dompet_trx, 'tarik_tunai'::public.jenis_dompet_trx) then
    if p_platform::text not in ('cash', 'qris', 'split') and v_source_before < v_outgoing then
      raise exception 'Saldo tidak mencukupi, silakan isi saldo terlebih dahulu';
    end if;
    v_source_after := v_source_before - v_outgoing;
  elsif p_jenis = 'transfer_antar'::public.jenis_dompet_trx then
    if p_platform_tujuan is null then
      raise exception 'Pilih tujuan transfer wallet.';
    end if;
    if p_platform = p_platform_tujuan then
      raise exception 'Wallet asal dan tujuan tidak boleh sama.';
    end if;
    if p_platform::text not in ('cash', 'qris', 'split') and v_source_before < v_outgoing then
      raise exception 'Saldo tidak mencukupi, silakan isi saldo terlebih dahulu';
    end if;
    v_source_after := v_source_before - v_outgoing;
  else
    raise exception 'Jenis mutasi wallet tidak valid.';
  end if;

  update public.wallet_accounts
  set current_balance = v_source_after,
      updated_at = now()
  where platform = p_platform;

  insert into public.transaksi_dompet (
    id,
    kasir_id,
    platform,
    jenis,
    platform_tujuan,
    nominal,
    biaya_admin,
    keterangan,
    source_type,
    source_id,
    source_ref,
    balance_before,
    balance_after,
    reversal_of,
    created_at
  )
  values (
    v_id,
    p_kasir_id,
    p_platform,
    p_jenis,
    p_platform_tujuan,
    p_nominal,
    coalesce(p_biaya_admin, 0),
    p_keterangan,
    p_source_type,
    p_source_id,
    p_source_ref,
    v_source_before,
    v_source_after,
    p_reversal_of,
    coalesce(p_created_at, now())
  );

  if p_jenis = 'transfer_antar'::public.jenis_dompet_trx and p_platform_tujuan is not null then
    insert into public.wallet_accounts (platform, current_balance, updated_at)
    values (p_platform_tujuan, public.pos_wallet_balance(p_platform_tujuan), now())
    on conflict (platform) do nothing;

    select current_balance
    into v_target_before
    from public.wallet_accounts
    where platform = p_platform_tujuan
    for update;

    v_target_after := v_target_before + v_incoming;

    update public.wallet_accounts
    set current_balance = v_target_after,
        updated_at = now()
    where platform = p_platform_tujuan;
  end if;

  return v_id;
end;
$$;

grant execute on function public.pos_insert_wallet_movement_hardened(
  uuid,
  public.nama_platform,
  public.jenis_dompet_trx,
  integer,
  integer,
  public.nama_platform,
  text,
  text,
  uuid,
  text,
  timestamptz,
  uuid
) to authenticated;

create or replace function public.pos_insert_wallet_movement(
  p_kasir_id uuid,
  p_platform public.nama_platform,
  p_jenis public.jenis_dompet_trx,
  p_nominal integer,
  p_biaya_admin integer default 0,
  p_platform_tujuan public.nama_platform default null,
  p_keterangan text default null,
  p_source_type text default null,
  p_source_id uuid default null,
  p_source_ref text default null,
  p_created_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.pos_insert_wallet_movement_hardened(
    p_kasir_id,
    p_platform,
    p_jenis,
    p_nominal,
    p_biaya_admin,
    p_platform_tujuan,
    p_keterangan,
    p_source_type,
    p_source_id,
    p_source_ref,
    p_created_at,
    null
  );
end;
$$;

grant execute on function public.pos_insert_wallet_movement(
  uuid,
  public.nama_platform,
  public.jenis_dompet_trx,
  integer,
  integer,
  public.nama_platform,
  text,
  text,
  uuid,
  text,
  timestamptz
) to authenticated;

create or replace function public.close_shift_atomic(
  p_shift_id uuid,
  p_actual_cash integer,
  p_notes text default '',
  p_pin text default null
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
  v_total_transactions integer := 0;
  v_total_items integer := 0;
  v_total_cash integer := 0;
  v_total_digital integer := 0;
  v_digital_breakdown jsonb := '{}'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if coalesce(p_actual_cash, -1) < 0 then
    raise exception 'Actual cash harus diisi dengan angka 0 atau lebih.';
  end if;

  select *
  into v_shift
  from public.shifts
  where id = p_shift_id
  for update;

  if not found then
    raise exception 'Shift tidak ditemukan.';
  end if;

  if v_shift.status is distinct from 'active'::public.shift_status then
    raise exception 'Shift sudah tidak aktif.';
  end if;

  if v_role <> 'pemilik'::public.user_role and v_shift.cashier_id <> v_user_id then
    raise exception 'Kasir hanya bisa menutup shift miliknya sendiri.';
  end if;

  with payment_rows as (
    select
      coalesce(nullif(payment.value->>'method', ''), t.metode_bayar::text, 'cash') as method,
      coalesce((payment.value->>'amount')::numeric::integer, t.total_bayar) as amount
    from public.transaksi as t
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(t.payments) = 'array' and jsonb_array_length(t.payments) > 0
          then t.payments
        else jsonb_build_array(jsonb_build_object('method', t.metode_bayar::text, 'amount', t.total_bayar))
      end
    ) as payment(value)
    where t.shift_id = p_shift_id
      and t.deleted_at is null
      and t.voided_at is null
      and coalesce(t.status, 'active') <> 'voided'
    union all
    select
      coalesce(d.payment_method::text, 'cash') as method,
      coalesce(d.harga_jual, d.selling_price, d.total, 0) as amount
    from public.transaksi_digital as d
    where d.shift_id = p_shift_id
      and d.deleted_at is null
      and d.voided_at is null
      and coalesce(d.status, 'active') <> 'voided'
    union all
    select
      coalesce(l.payment_method::text, l.platform_sumber::text, 'cash') as method,
      coalesce(l.price, l.harga_jual, 0) as amount
    from public.transaksi_logistik as l
    where l.shift_id = p_shift_id
      and l.deleted_at is null
      and l.voided_at is null
      and coalesce(l.status, 'active') <> 'voided'
  ),
  grouped as (
    select method, sum(amount)::integer as amount
    from payment_rows
    group by method
  )
  select
    coalesce(sum(amount) filter (where method in ('cash', 'tunai')), 0)::integer,
    coalesce(sum(amount) filter (where method not in ('cash', 'tunai')), 0)::integer,
    coalesce(jsonb_object_agg(method, amount) filter (where method not in ('cash', 'tunai')), '{}'::jsonb)
  into v_total_cash, v_total_digital, v_digital_breakdown
  from grouped;

  select
    (
      select count(*) from public.transaksi t
      where t.shift_id = p_shift_id
        and t.deleted_at is null
        and t.voided_at is null
        and coalesce(t.status, 'active') <> 'voided'
    ) +
    (
      select count(*) from public.transaksi_digital d
      where d.shift_id = p_shift_id
        and d.deleted_at is null
        and d.voided_at is null
        and coalesce(d.status, 'active') <> 'voided'
    ) +
    (
      select count(*) from public.transaksi_logistik l
      where l.shift_id = p_shift_id
        and l.deleted_at is null
        and l.voided_at is null
        and coalesce(l.status, 'active') <> 'voided'
    )
  into v_total_transactions;

  select
    coalesce(
      (
        select sum(i.qty)
        from public.item_transaksi i
        join public.transaksi t on t.id = i.transaksi_id
        where t.shift_id = p_shift_id
          and t.deleted_at is null
          and t.voided_at is null
          and coalesce(t.status, 'active') <> 'voided'
      ),
      0
    )::integer +
    (
      select count(*)::integer from public.transaksi_digital d
      where d.shift_id = p_shift_id
        and d.deleted_at is null
        and d.voided_at is null
        and coalesce(d.status, 'active') <> 'voided'
    ) +
    (
      select count(*)::integer from public.transaksi_logistik l
      where l.shift_id = p_shift_id
        and l.deleted_at is null
        and l.voided_at is null
        and coalesce(l.status, 'active') <> 'voided'
    )
  into v_total_items;

  update public.shifts as shift_row
  set
    end_time = now(),
    total_cash = v_total_cash,
    total_digital = v_total_digital,
    digital_breakdown = v_digital_breakdown,
    total_transactions = v_total_transactions,
    total_items = v_total_items,
    actual_cash = p_actual_cash,
    notes = coalesce(p_notes, ''),
    status = 'pending'::public.shift_status,
    approved_by = null,
    approved_at = null,
    approval_notes = '',
    correction_difference = 0,
    correction_type = '',
    closed_by = v_user_id,
    updated_at = now()
  where id = p_shift_id
  returning to_jsonb(shift_row)
  into v_result;

  v_summary := jsonb_build_object(
    'total_trx', v_total_transactions,
    'omzet', v_total_cash + v_total_digital,
    'modal', 0,
    'profit', 0,
    'cash', v_total_cash,
    'qris', coalesce((v_digital_breakdown->>'qris')::integer, 0),
    'transfer',
      coalesce((v_digital_breakdown->>'transfer')::integer, 0) +
      coalesce((v_digital_breakdown->>'transfer_bank')::integer, 0) +
      coalesce((v_digital_breakdown->>'bca')::integer, 0) +
      coalesce((v_digital_breakdown->>'bank_mas')::integer, 0),
    'ewallet', greatest(
      v_total_digital -
      coalesce((v_digital_breakdown->>'qris')::integer, 0) -
      coalesce((v_digital_breakdown->>'transfer')::integer, 0) -
      coalesce((v_digital_breakdown->>'transfer_bank')::integer, 0) -
      coalesce((v_digital_breakdown->>'bca')::integer, 0) -
      coalesce((v_digital_breakdown->>'bank_mas')::integer, 0),
      0
    )
  );

  insert into public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_table,
    target_id,
    before_value,
    after_value,
    reason,
    created_at
  )
  values (
    v_user_id,
    v_role::text,
    'close_shift_atomic',
    'shifts',
    p_shift_id,
    to_jsonb(v_shift),
    v_result || jsonb_build_object('closing_summary', v_summary),
    coalesce(p_notes, ''),
    now()
  );

  perform public.log_operational_event(
    case when abs(coalesce(p_actual_cash, 0) - v_total_cash) >= 50000
      then 'closing_mismatch'
      else 'shift_closed'
    end,
    case when abs(coalesce(p_actual_cash, 0) - v_total_cash) >= 50000
      then 'warning'
      else 'info'
    end,
    'shift',
    p_shift_id,
    jsonb_build_object(
      'expected_cash', v_total_cash,
      'actual_cash', p_actual_cash,
      'difference', coalesce(p_actual_cash, 0) - v_total_cash,
      'total_transactions', v_total_transactions
    )
  );

  return v_result || jsonb_build_object('closing_summary', v_summary);
end;
$$;

grant execute on function public.close_shift_atomic(uuid, integer, text, text) to authenticated;

create or replace function public.reverse_wallet_movements_for_source(
  p_source_id uuid,
  p_reason text default ''
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.transaksi_dompet%rowtype;
  v_count integer := 0;
  v_reverse_type public.jenis_dompet_trx;
  v_reverse_platform public.nama_platform;
  v_reverse_target public.nama_platform;
  v_reverse_amount integer;
begin
  for v_wallet in
    select *
    from public.transaksi_dompet
    where source_id = p_source_id
      and reversal_of is null
    order by created_at, id
  loop
    if v_wallet.jenis = 'masuk'::public.jenis_dompet_trx then
      v_reverse_type := 'keluar'::public.jenis_dompet_trx;
      v_reverse_platform := v_wallet.platform;
      v_reverse_target := null;
      v_reverse_amount := v_wallet.nominal + coalesce(v_wallet.biaya_admin, 0);
    elsif v_wallet.jenis = 'keluar'::public.jenis_dompet_trx then
      v_reverse_type := 'masuk'::public.jenis_dompet_trx;
      v_reverse_platform := v_wallet.platform;
      v_reverse_target := null;
      v_reverse_amount := v_wallet.nominal + coalesce(v_wallet.biaya_admin, 0);
    elsif v_wallet.jenis in ('tarik_tunai'::public.jenis_dompet_trx, 'transfer_antar'::public.jenis_dompet_trx) then
      v_reverse_type := 'masuk'::public.jenis_dompet_trx;
      v_reverse_platform := v_wallet.platform;
      v_reverse_target := null;
      v_reverse_amount := v_wallet.nominal + coalesce(v_wallet.biaya_admin, 0);
    else
      continue;
    end if;

    perform public.pos_insert_wallet_movement_hardened(
      v_wallet.kasir_id,
      v_reverse_platform,
      v_reverse_type,
      v_reverse_amount,
      0,
      v_reverse_target,
      'Reversal: ' || coalesce(nullif(p_reason, ''), v_wallet.keterangan, 'void transaction'),
      'wallet_reversal',
      p_source_id,
      v_wallet.source_ref,
      now(),
      v_wallet.id
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.void_transaction_atomic(
  p_source text,
  p_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_before jsonb;
  v_after jsonb;
  v_item record;
  v_product public.produk%rowtype;
  v_reversal_id uuid := gen_random_uuid();
  v_reversal_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role is distinct from 'pemilik'::public.user_role then
    raise exception 'Hanya owner yang dapat void transaksi.';
  end if;

  if v_reason = '' then
    raise exception 'Alasan void wajib diisi.';
  end if;

  case p_source
    when 'aksesoris' then
      select to_jsonb(t)
      into v_before
      from public.transaksi t
      where t.id = p_id
      for update;

      if v_before is null then
        raise exception 'Transaksi tidak ditemukan.';
      end if;

      if v_before->>'voided_at' is not null or coalesce(v_before->>'status', 'active') = 'voided' then
        raise exception 'Transaksi sudah void.';
      end if;

      for v_item in
        select *
        from public.item_transaksi
        where transaksi_id = p_id
      loop
        select *
        into v_product
        from public.produk
        where id = v_item.produk_id
        for update;

        if found then
          update public.produk
          set stok = stok + v_item.qty,
              updated_at = now()
          where id = v_product.id;

          insert into public.stok_mutasi (
            id,
            produk_id,
            tipe,
            jumlah,
            stok_sebelum,
            stok_sesudah,
            referensi,
            catatan,
            created_at
          )
          values (
            gen_random_uuid(),
            v_product.id,
            'masuk'::public.stock_mutation_type,
            v_item.qty,
            v_product.stok,
            v_product.stok + v_item.qty,
            v_before->>'no_transaksi',
            'Reversal void transaksi: ' || v_reason,
            now()
          );
        end if;
      end loop;

      v_reversal_count := public.reverse_wallet_movements_for_source(p_id, v_reason);

      update public.transaksi as trx_row
      set
        status = 'voided',
        voided_at = now(),
        voided_by = v_user_id,
        void_reason = v_reason,
        void_reversal_id = v_reversal_id,
        deleted_at = coalesce(deleted_at, now()),
        deleted_by = coalesce(deleted_by, v_user_id)
      where id = p_id
      returning to_jsonb(trx_row)
      into v_after;

    when 'digital' then
      select to_jsonb(d)
      into v_before
      from public.transaksi_digital d
      where d.id = p_id
      for update;

      if v_before is null then
        raise exception 'Transaksi digital tidak ditemukan.';
      end if;

      if v_before->>'voided_at' is not null or coalesce(v_before->>'status', 'active') = 'voided' then
        raise exception 'Transaksi sudah void.';
      end if;

      v_reversal_count := public.reverse_wallet_movements_for_source(p_id, v_reason);

      update public.transaksi_digital as digital_row
      set
        status = 'voided',
        voided_at = now(),
        voided_by = v_user_id,
        void_reason = v_reason,
        void_reversal_id = v_reversal_id,
        deleted_at = coalesce(deleted_at, now()),
        deleted_by = coalesce(deleted_by, v_user_id)
      where id = p_id
      returning to_jsonb(digital_row)
      into v_after;

    when 'logistik' then
      select to_jsonb(l)
      into v_before
      from public.transaksi_logistik l
      where l.id = p_id
      for update;

      if v_before is null then
        raise exception 'Transaksi logistik tidak ditemukan.';
      end if;

      if v_before->>'voided_at' is not null or coalesce(v_before->>'status', 'active') = 'voided' then
        raise exception 'Transaksi sudah void.';
      end if;

      v_reversal_count := public.reverse_wallet_movements_for_source(p_id, v_reason);

      update public.transaksi_logistik as logistics_row
      set
        status = 'voided',
        voided_at = now(),
        voided_by = v_user_id,
        void_reason = v_reason,
        void_reversal_id = v_reversal_id,
        deleted_at = coalesce(deleted_at, now()),
        deleted_by = coalesce(deleted_by, v_user_id)
      where id = p_id
      returning to_jsonb(logistics_row)
      into v_after;

    when 'saldo' then
      select to_jsonb(w)
      into v_before
      from public.transaksi_dompet w
      where w.id = p_id
      for update;

      if v_before is null then
        raise exception 'Mutasi wallet tidak ditemukan.';
      end if;

      if exists (
        select 1
        from public.transaksi_dompet
        where reversal_of = p_id
      ) then
        raise exception 'Mutasi wallet sudah punya reversal.';
      end if;

      perform public.reverse_wallet_movements_for_source((v_before->>'source_id')::uuid, v_reason);

      if not exists (
        select 1
        from public.transaksi_dompet
        where reversal_of = p_id
      ) then
        if v_before->>'jenis' = 'masuk' then
          perform public.pos_insert_wallet_movement_hardened(
            (v_before->>'kasir_id')::uuid,
            (v_before->>'platform')::public.nama_platform,
            'keluar'::public.jenis_dompet_trx,
            coalesce((v_before->>'nominal')::integer, 0),
            coalesce((v_before->>'biaya_admin')::integer, 0),
            null,
            'Reversal mutasi wallet: ' || v_reason,
            'wallet_reversal',
            p_id,
            v_before->>'source_ref',
            now(),
            p_id
          );
        else
          perform public.pos_insert_wallet_movement_hardened(
            (v_before->>'kasir_id')::uuid,
            (v_before->>'platform')::public.nama_platform,
            'masuk'::public.jenis_dompet_trx,
            coalesce((v_before->>'nominal')::integer, 0) + coalesce((v_before->>'biaya_admin')::integer, 0),
            0,
            null,
            'Reversal mutasi wallet: ' || v_reason,
            'wallet_reversal',
            p_id,
            v_before->>'source_ref',
            now(),
            p_id
          );
        end if;
      end if;

      v_after := v_before || jsonb_build_object(
        'status', 'voided',
        'voided_at', now(),
        'voided_by', v_user_id,
        'void_reason', v_reason,
        'void_reversal_id', v_reversal_id
      );

    else
      raise exception 'Sumber transaksi tidak valid.';
  end case;

  insert into public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_table,
    target_id,
    before_value,
    after_value,
    reason,
    created_at
  )
  values (
    v_user_id,
    v_role::text,
    'void_transaction_atomic',
    p_source,
    p_id,
    coalesce(v_before, '{}'::jsonb),
    coalesce(v_after, '{}'::jsonb) || jsonb_build_object(
      'reversal_count', v_reversal_count,
      'void_reversal_id', v_reversal_id
    ),
    v_reason,
    now()
  );

  perform public.log_operational_event(
    'transaction_voided',
    'warning',
    p_source,
    p_id,
    jsonb_build_object(
      'reason', v_reason,
      'reversal_count', v_reversal_count,
      'void_reversal_id', v_reversal_id
    )
  );

  return coalesce(v_after, '{}'::jsonb) || jsonb_build_object(
    'reversal_count', v_reversal_count,
    'void_reversal_id', v_reversal_id
  );
end;
$$;

grant execute on function public.void_transaction_atomic(text, uuid, text) to authenticated;

alter table public.stock_opname_sessions
  add column if not exists cutoff_at timestamptz;

update public.stock_opname_sessions
set cutoff_at = coalesce(cutoff_at, created_at, now())
where cutoff_at is null;

alter table public.stock_opname_sessions
  alter column cutoff_at set default now();

alter table public.stock_opname_items
  add column if not exists counted_at timestamptz,
  add column if not exists conflict_status text not null default 'clear',
  add column if not exists conflict_reason text not null default '';

create or replace function public.set_stock_opname_counted_at()
returns trigger
language plpgsql
as $$
begin
  if new.real_stock is not null and (
    tg_op = 'INSERT' or old.real_stock is distinct from new.real_stock
  ) then
    new.counted_at = now();
    new.conflict_status = 'clear';
    new.conflict_reason = '';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_stock_opname_counted_at on public.stock_opname_items;
create trigger trg_stock_opname_counted_at
before insert or update of real_stock on public.stock_opname_items
for each row execute function public.set_stock_opname_counted_at();

create or replace function public.apply_stock_opname_session_atomic(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_session public.stock_opname_sessions%rowtype;
  v_item public.stock_opname_items%rowtype;
  v_product public.produk%rowtype;
  v_delta integer;
  v_reference text;
  v_conflict_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'User belum login.';
  end if;

  if v_role is distinct from 'pemilik'::public.user_role then
    raise exception 'Stock Opname hanya bisa diterapkan owner.';
  end if;

  select *
  into v_session
  from public.stock_opname_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Sesi Stock Opname tidak ditemukan.';
  end if;

  if v_session.status = 'completed' then
    raise exception 'Sesi Stock Opname sudah selesai.';
  end if;

  if not exists (
    select 1
    from public.stock_opname_items
    where session_id = p_session_id
      and real_stock is not null
  ) then
    raise exception 'Isi minimal satu stok real sebelum menerapkan penyesuaian.';
  end if;

  update public.stock_opname_items as item
  set
    conflict_status = 'conflict',
    conflict_reason = 'Ada mutasi stok setelah produk dihitung.',
    updated_at = now()
  where item.session_id = p_session_id
    and item.real_stock is not null
    and exists (
      select 1
      from public.stok_mutasi as mutation
      where mutation.produk_id = item.product_id
        and mutation.created_at > coalesce(item.counted_at, v_session.cutoff_at, v_session.created_at)
    );

  get diagnostics v_conflict_count = row_count;

  if v_conflict_count > 0 then
    perform public.log_operational_event(
      'stock_opname_conflict',
      'warning',
      'stock_opname',
      p_session_id,
      jsonb_build_object('conflict_count', v_conflict_count)
    );

    raise exception 'Stock Opname memiliki % konflik. Resolve dulu sebelum apply.', v_conflict_count;
  end if;

  v_reference := 'OPNAME-' || left(replace(p_session_id::text, '-', ''), 8);

  for v_item in
    select *
    from public.stock_opname_items
    where session_id = p_session_id
      and real_stock is not null
    order by product_name
  loop
    select *
    into v_product
    from public.produk
    where id = v_item.product_id
    for update;

    if not found or coalesce(v_product.status, 'active') = 'deleted' then
      continue;
    end if;

    v_delta := v_item.real_stock - v_product.stok;

    update public.stock_opname_items
    set
      difference = v_item.real_stock - v_item.system_stock,
      applied_delta = v_delta,
      conflict_status = 'clear',
      conflict_reason = '',
      updated_at = now()
    where id = v_item.id;

    if v_delta <> 0 then
      update public.produk
      set
        stok = v_item.real_stock,
        updated_at = now()
      where id = v_product.id;

      insert into public.stok_mutasi (
        id,
        produk_id,
        tipe,
        jumlah,
        stok_sebelum,
        stok_sesudah,
        referensi,
        catatan,
        created_at
      )
      values (
        gen_random_uuid(),
        v_product.id,
        'penyesuaian'::public.stock_mutation_type,
        v_delta,
        v_product.stok,
        v_item.real_stock,
        v_reference,
        'Penyesuaian dari Stock Opname: ' || v_session.name,
        now()
      );
    end if;
  end loop;

  perform public.recalculate_stock_opname_session(p_session_id);

  update public.stock_opname_sessions
  set
    status = 'completed',
    applied_by = v_user_id,
    completed_at = now(),
    updated_at = now()
  where id = p_session_id;

  perform public.log_operational_event(
    'stock_opname_applied',
    'info',
    'stock_opname',
    p_session_id,
    jsonb_build_object('reference', v_reference)
  );

  return (
    select to_jsonb(session_row)
    from public.stock_opname_sessions as session_row
    where session_row.id = p_session_id
  );
end;
$$;

grant execute on function public.apply_stock_opname_session_atomic(uuid) to authenticated;

notify pgrst, 'reload schema';
