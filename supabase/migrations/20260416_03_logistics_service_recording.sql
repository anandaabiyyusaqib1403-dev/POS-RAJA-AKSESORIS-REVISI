alter table public.transaksi_logistik
  add column if not exists type text not null default 'logistik',
  add column if not exists sender_name text,
  add column if not exists receiver_name text,
  add column if not exists destination text,
  add column if not exists package_type text,
  add column if not exists weight numeric(10, 2) not null default 0,
  add column if not exists price integer not null default 0,
  add column if not exists payment_method nama_platform;

update public.transaksi_logistik
set
  type = coalesce(type, 'logistik'),
  receiver_name = coalesce(receiver_name, no_resi, 'Penerima'),
  destination = coalesce(destination, catatan, '-'),
  package_type = coalesce(package_type, 'Regular'),
  price = case when price > 0 then price else harga_jual end,
  payment_method = coalesce(payment_method, 'cash'::public.nama_platform);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transaksi_logistik_type_check'
  ) then
    alter table public.transaksi_logistik
      add constraint transaksi_logistik_type_check check (type = 'logistik');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transaksi_logistik_weight_check'
  ) then
    alter table public.transaksi_logistik
      add constraint transaksi_logistik_weight_check check (weight >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transaksi_logistik_price_check'
  ) then
    alter table public.transaksi_logistik
      add constraint transaksi_logistik_price_check check (price >= 0);
  end if;
end $$;
