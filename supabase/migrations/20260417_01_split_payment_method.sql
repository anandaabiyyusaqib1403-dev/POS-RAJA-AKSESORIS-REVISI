alter type public.metode_bayar add value if not exists 'split';

alter table public.transaksi
  add column if not exists payments jsonb not null default '[]'::jsonb;
