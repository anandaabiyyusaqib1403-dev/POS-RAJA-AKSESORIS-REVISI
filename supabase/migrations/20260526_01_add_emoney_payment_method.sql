-- Add standalone eMoney as a customer e-wallet payment option.

alter type public.nama_platform add value if not exists 'emoney';
alter type public.metode_bayar add value if not exists 'emoney';

notify pgrst, 'reload schema';
