alter table public.transaksi
  alter column metode_bayar set default 'cash';

update public.transaksi
set metode_bayar = 'cash'::public.metode_bayar
where metode_bayar::text = 'tunai';

update public.transaksi_dompet
set platform = 'cash'::public.nama_platform
where platform::text = 'tunai';

update public.transaksi_dompet
set platform_tujuan = 'cash'::public.nama_platform
where platform_tujuan::text = 'tunai';

update public.transaksi_dompet
set platform = 'shopee'::public.nama_platform
where platform::text = 'shopeepay';

update public.transaksi_dompet
set platform_tujuan = 'shopee'::public.nama_platform
where platform_tujuan::text = 'shopeepay';
