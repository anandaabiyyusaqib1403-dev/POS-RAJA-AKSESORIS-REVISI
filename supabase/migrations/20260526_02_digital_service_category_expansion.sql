-- Expand digital service categories for scalable product catalog UX.

alter type public.jenis_digital add value if not exists 'tagihan';
alter type public.jenis_digital add value if not exists 'tv';
alter type public.jenis_digital add value if not exists 'internet';
alter type public.jenis_digital add value if not exists 'multifinance';

alter table public.services_products
  drop constraint if exists services_products_category_check;

alter table public.services_products
  add constraint services_products_category_check
  check (
    category in (
      'pulsa',
      'kuota',
      'voucher_game',
      'token_listrik',
      'transfer_bank',
      'transfer_ewallet',
      'tagihan',
      'tv',
      'internet',
      'multifinance'
    )
  );

notify pgrst, 'reload schema';
