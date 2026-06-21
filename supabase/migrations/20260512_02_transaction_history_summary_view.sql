-- Paginated transaction history surface for the frontend.

create index if not exists idx_transaksi_deleted_created
on public.transaksi (deleted_at, created_at desc);

create index if not exists idx_transaksi_digital_deleted_created
on public.transaksi_digital (deleted_at, created_at desc);

create index if not exists idx_transaksi_logistik_created_at_desc
on public.transaksi_logistik (created_at desc);

create index if not exists idx_transaksi_dompet_deleted_created
on public.transaksi_dompet (deleted_at, created_at desc);

create index if not exists idx_kas_deleted_created
on public.kas (deleted_at, created_at desc);

create or replace view public.transaction_history_summary as
with item_summary as (
  select
    i.transaksi_id,
    coalesce(sum(i.qty), 0)::integer as item_count,
    coalesce(sum(i.qty * coalesce(p.harga_beli, 0)), 0)::bigint as cost,
    string_agg(coalesce(i.nama_produk, ''), ' ') as item_names,
    (array_agg(i.nama_produk))[1] as first_item
  from public.item_transaksi i
  left join public.produk p on p.id = i.produk_id
  group by i.transaksi_id
)
select
  ('aks-' || t.id::text) as id,
  'aksesoris'::text as source,
  'masuk'::text as flow,
  t.created_at as occurred_at,
  t.created_at as date_filter_value,
  t.id as raw_id,
  coalesce(t.no_transaksi, 'TRX-' || t.id::text) as reference,
  coalesce(nullif(item_summary.first_item, ''), 'Penjualan aksesoris') as summary,
  concat(coalesce(item_summary.item_count, 0), ' item - ', coalesce(t.metode_bayar::text, '-')) as caption,
  coalesce(t.total_bayar, 0)::bigint as amount,
  coalesce(item_summary.cost, 0)::bigint as secondary_amount,
  'Modal estimasi'::text as secondary_label,
  coalesce(t.total_bayar, 0)::bigint as income_value,
  0::bigint as expense_value,
  0::bigint as internal_value,
  (coalesce(t.total_bayar, 0) - coalesce(item_summary.cost, 0))::bigint as profit_impact,
  lower(coalesce(t.metode_bayar::text, '')) as payment_method,
  coalesce(t.catatan, '') as note,
  lower(concat_ws(' ', t.no_transaksi, t.catatan, t.metode_bayar::text, t.kasir_id::text, item_summary.item_names)) as searchable_text
from public.transaksi t
left join item_summary on item_summary.transaksi_id = t.id
where t.deleted_at is null

union all

select
  ('dig-' || d.id::text) as id,
  'digital'::text as source,
  'masuk'::text as flow,
  d.created_at as occurred_at,
  d.created_at as date_filter_value,
  d.id as raw_id,
  coalesce(d.no_transaksi, 'LYN-' || d.id::text) as reference,
  coalesce(d.jenis::text, 'Layanan digital') as summary,
  concat_ws(' - ', d.provider, d.nomor_tujuan) as caption,
  coalesce(d.harga_jual, 0)::bigint as amount,
  coalesce(d.modal, d.cost, 0)::bigint as secondary_amount,
  'Modal'::text as secondary_label,
  coalesce(d.harga_jual, 0)::bigint as income_value,
  0::bigint as expense_value,
  0::bigint as internal_value,
  coalesce(d.keuntungan, d.profit, coalesce(d.harga_jual, 0) - coalesce(d.modal, d.cost, 0))::bigint as profit_impact,
  ''::text as payment_method,
  coalesce(d.catatan, '') as note,
  lower(concat_ws(' ', d.no_transaksi, d.jenis::text, d.provider, d.nomor_tujuan, d.nama_tujuan, d.platform_sumber::text, d.catatan)) as searchable_text
from public.transaksi_digital d
where d.deleted_at is null

union all

select
  ('log-' || l.id::text) as id,
  'logistik'::text as source,
  'masuk'::text as flow,
  l.created_at as occurred_at,
  l.created_at as date_filter_value,
  l.id as raw_id,
  coalesce(l.no_transaksi, 'LOG-' || l.id::text) as reference,
  coalesce(l.ekspedisi, 'Transaksi logistik') as summary,
  coalesce(l.no_resi, '-') as caption,
  coalesce(l.harga_jual, 0)::bigint as amount,
  coalesce(l.modal, 0)::bigint as secondary_amount,
  'Modal'::text as secondary_label,
  coalesce(l.harga_jual, 0)::bigint as income_value,
  0::bigint as expense_value,
  0::bigint as internal_value,
  coalesce(l.keuntungan, coalesce(l.harga_jual, 0) - coalesce(l.modal, 0))::bigint as profit_impact,
  ''::text as payment_method,
  coalesce(l.catatan, '') as note,
  lower(concat_ws(' ', l.no_transaksi, l.ekspedisi, l.no_resi, l.catatan)) as searchable_text
from public.transaksi_logistik l
where l.deleted_at is null

union all

select
  ('wal-' || w.id::text) as id,
  'saldo'::text as source,
  case
    when w.jenis::text = 'masuk' then 'masuk'
    when w.jenis::text = 'keluar' then 'keluar'
    else 'internal'
  end as flow,
  w.created_at as occurred_at,
  w.created_at as date_filter_value,
  w.id as raw_id,
  'DOMPET-' || upper(left(w.id::text, 8)) as reference,
  coalesce(w.jenis::text, 'Mutasi saldo') as summary,
  concat_ws(' -> ', w.platform::text, w.platform_tujuan::text) as caption,
  coalesce(w.nominal, 0)::bigint as amount,
  coalesce(w.biaya_admin, 0)::bigint as secondary_amount,
  'Biaya admin'::text as secondary_label,
  0::bigint as income_value,
  coalesce(w.biaya_admin, 0)::bigint as expense_value,
  coalesce(w.nominal, 0)::bigint as internal_value,
  (-coalesce(w.biaya_admin, 0))::bigint as profit_impact,
  ''::text as payment_method,
  coalesce(w.keterangan, '') as note,
  lower(concat_ws(' ', w.jenis::text, w.platform::text, w.platform_tujuan::text, w.keterangan)) as searchable_text
from public.transaksi_dompet w
where w.deleted_at is null

union all

select
  ('kas-' || k.id::text) as id,
  'operasional'::text as source,
  case when k.jenis::text = 'pemasukan' then 'masuk' else 'keluar' end as flow,
  coalesce(k.created_at, k.tanggal::timestamptz) as occurred_at,
  coalesce(k.tanggal::timestamptz, k.created_at) as date_filter_value,
  k.id as raw_id,
  'KAS-' || coalesce(k.tanggal::text, left(k.id::text, 8)) as reference,
  coalesce(k.kategori::text, 'Kas') as summary,
  coalesce(k.keterangan, '-') as caption,
  coalesce(k.nominal, 0)::bigint as amount,
  coalesce(k.nominal, 0)::bigint as secondary_amount,
  case when k.jenis::text = 'pemasukan' then 'Masuk ke kas' else 'Keluar dari kas' end as secondary_label,
  case when k.jenis::text = 'pemasukan' then coalesce(k.nominal, 0) else 0 end::bigint as income_value,
  case when k.jenis::text = 'pengeluaran' then coalesce(k.nominal, 0) else 0 end::bigint as expense_value,
  0::bigint as internal_value,
  case when k.jenis::text = 'pengeluaran' then -coalesce(k.nominal, 0) else 0 end::bigint as profit_impact,
  ''::text as payment_method,
  coalesce(k.keterangan, '') as note,
  lower(concat_ws(' ', k.kategori::text, k.jenis::text, k.keterangan, k.tanggal::text)) as searchable_text
from public.kas k
where k.deleted_at is null;

grant select on public.transaction_history_summary to authenticated;

notify pgrst, 'reload schema';
