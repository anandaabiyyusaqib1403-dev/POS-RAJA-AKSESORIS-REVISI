-- 20260419_01_fix_financial_logs_typo.sql
-- Repair databases where financial_logs was accidentally created as finacial_logs.

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.financial_logs') is null
     and to_regclass('public.finacial_logs') is not null then
    alter table public.finacial_logs rename to financial_logs;
  elsif to_regclass('public.financial_logs') is not null
     and to_regclass('public.finacial_logs') is not null then
    insert into public.financial_logs (
      id,
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
    select
      typo.id,
      typo.kasir_id,
      coalesce(typo.log_type, 'adjustment'),
      coalesce(typo.direction, 'neutral'),
      coalesce(typo.amount, 0),
      typo.payment_method,
      typo.source_type,
      typo.source_id,
      typo.reference,
      typo.notes,
      typo.created_by,
      coalesce(typo.created_at, now())
    from public.finacial_logs typo
    where not exists (
      select 1
      from public.financial_logs existing
      where existing.id = typo.id
    );

    drop table public.finacial_logs;
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

alter table public.financial_logs
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists kasir_id uuid references public.users(id),
  add column if not exists log_type text,
  add column if not exists direction text,
  add column if not exists amount integer,
  add column if not exists payment_method text,
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists reference text,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists created_at timestamptz default now();

update public.financial_logs
set
  id = coalesce(id, gen_random_uuid()),
  log_type = coalesce(log_type, 'adjustment'),
  direction = coalesce(direction, 'neutral'),
  amount = coalesce(amount, 0),
  created_at = coalesce(created_at, now());

update public.financial_logs
set log_type = 'adjustment'
where log_type not in (
  'adjustment',
  'cash_over',
  'cash_short',
  'Kas Lebih',
  'Kas Kurang'
);

update public.financial_logs
set direction = 'neutral'
where direction not in ('in', 'out', 'neutral');

update public.financial_logs
set amount = 0
where amount < 0;

alter table public.financial_logs
  alter column id set default gen_random_uuid(),
  alter column log_type set not null,
  alter column direction set not null,
  alter column amount set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.financial_logs'::regclass
      and contype = 'p'
  ) then
    alter table public.financial_logs
      add constraint financial_logs_pkey primary key (id);
  end if;
end $$;

alter table public.financial_logs
  drop constraint if exists finacial_logs_log_type_check,
  drop constraint if exists financial_logs_log_type_check,
  drop constraint if exists finacial_logs_direction_check,
  drop constraint if exists financial_logs_direction_check,
  drop constraint if exists finacial_logs_amount_check,
  drop constraint if exists financial_logs_amount_check;

alter table public.financial_logs
  add constraint financial_logs_log_type_check
  check (
    log_type in (
      'adjustment',
      'cash_over',
      'cash_short',
      'Kas Lebih',
      'Kas Kurang'
    )
  ),
  add constraint financial_logs_direction_check
  check (direction in ('in', 'out', 'neutral')),
  add constraint financial_logs_amount_check
  check (amount >= 0);

create index if not exists idx_financial_logs_created
on public.financial_logs (created_at desc);

grant select, insert on public.financial_logs to authenticated;

alter table public.financial_logs enable row level security;

drop policy if exists "kasir or owner read financial logs" on public.financial_logs;
create policy "kasir or owner read financial logs"
on public.financial_logs
for select
to authenticated
using (
  kasir_id = auth.uid()
  or created_by = auth.uid()
  or public.current_user_role() = 'pemilik'
);

drop policy if exists "owner insert financial logs" on public.financial_logs;
create policy "owner insert financial logs"
on public.financial_logs
for insert
to authenticated
with check (public.current_user_role() = 'pemilik');

notify pgrst, 'reload schema';
