alter type public.metode_bayar add value if not exists 'cash';
alter type public.metode_bayar add value if not exists 'dana';
alter type public.metode_bayar add value if not exists 'bank_mas';
alter type public.metode_bayar add value if not exists 'wahana';
alter type public.metode_bayar add value if not exists 'pasar_kuota';
alter type public.metode_bayar add value if not exists 'shopee';
alter type public.metode_bayar add value if not exists 'bca';

alter type public.nama_platform add value if not exists 'cash';
alter type public.nama_platform add value if not exists 'bank_mas';
alter type public.nama_platform add value if not exists 'wahana';
alter type public.nama_platform add value if not exists 'pasar_kuota';
alter type public.nama_platform add value if not exists 'shopee';
alter type public.nama_platform add value if not exists 'qris';
