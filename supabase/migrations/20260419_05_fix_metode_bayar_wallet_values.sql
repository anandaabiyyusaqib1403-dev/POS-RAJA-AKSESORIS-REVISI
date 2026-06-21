-- 20260419_05_fix_metode_bayar_wallet_values.sql
-- Hotfix: make POS payment enum match every wallet option used by the app.

alter type public.metode_bayar add value if not exists 'cash';
alter type public.metode_bayar add value if not exists 'qris';
alter type public.metode_bayar add value if not exists 'transfer';
alter type public.metode_bayar add value if not exists 'dana';
alter type public.metode_bayar add value if not exists 'bank_mas';
alter type public.metode_bayar add value if not exists 'wahana';
alter type public.metode_bayar add value if not exists 'pasar_kuota';
alter type public.metode_bayar add value if not exists 'shopee';
alter type public.metode_bayar add value if not exists 'bca';
alter type public.metode_bayar add value if not exists 'split';
alter type public.metode_bayar add value if not exists 'gopay';
alter type public.metode_bayar add value if not exists 'ovo';
alter type public.metode_bayar add value if not exists 'mandiri';
alter type public.metode_bayar add value if not exists 'bri';
alter type public.metode_bayar add value if not exists 'bni';

alter type public.nama_platform add value if not exists 'cash';
alter type public.nama_platform add value if not exists 'qris';
alter type public.nama_platform add value if not exists 'dana';
alter type public.nama_platform add value if not exists 'bank_mas';
alter type public.nama_platform add value if not exists 'wahana';
alter type public.nama_platform add value if not exists 'pasar_kuota';
alter type public.nama_platform add value if not exists 'shopee';
alter type public.nama_platform add value if not exists 'bca';
alter type public.nama_platform add value if not exists 'split';
alter type public.nama_platform add value if not exists 'gopay';
alter type public.nama_platform add value if not exists 'ovo';
alter type public.nama_platform add value if not exists 'mandiri';
alter type public.nama_platform add value if not exists 'bri';
alter type public.nama_platform add value if not exists 'bni';

notify pgrst, 'reload schema';
