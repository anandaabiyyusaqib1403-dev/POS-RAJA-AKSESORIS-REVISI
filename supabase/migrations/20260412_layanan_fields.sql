alter type public.jenis_digital add value if not exists 'transfer_bank';
alter type public.jenis_digital add value if not exists 'transfer_ewallet';
alter type public.jenis_digital add value if not exists 'tarik_tunai';

alter table public.transaksi_digital
  add column if not exists nama_tujuan text;

do $$
begin
  if exists (
    select 1
    from pg_type
    where typname = 'nama_platform'
  ) then
    alter table public.transaksi_digital
      add column if not exists platform_sumber nama_platform;
  end if;
end $$;
