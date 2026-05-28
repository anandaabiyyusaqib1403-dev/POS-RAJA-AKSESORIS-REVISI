-- Hotfix: ensure shift approval columns exist and are visible to PostgREST.
-- Run this in Supabase SQL Editor, then hard refresh the POS app.

alter type public.shift_status add value if not exists 'approved_with_correction';

alter table public.shifts
  add column if not exists approval_notes text,
  add column if not exists approved_at timestamptz,
  add column if not exists correction_difference integer not null default 0,
  add column if not exists correction_type text not null default '',
  add column if not exists closed_by uuid references public.users(id);

do $$
begin
  alter table public.shifts
    drop constraint if exists shifts_correction_type_check;

  alter table public.shifts
    add constraint shifts_correction_type_check
    check (correction_type in ('', 'Kas Lebih', 'Kas Kurang'));
end $$;

notify pgrst, 'reload schema';

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'shifts'
  and column_name in (
    'approval_notes',
    'approved_at',
    'correction_difference',
    'correction_type',
    'closed_by'
  )
order by column_name;
