import { formatDateTime, formatRupiah } from "../utils/format";
import { formatReceiptCashierName } from "../utils/print";
import logo from '../assets/raja-aksesoris-logo.png';

function formatLabel(key) {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ReceiptPrint({ selectedRow }) {
  if (!selectedRow?.details) {
    return null;
  }

  const details = selectedRow.details;
  const items = Array.isArray(details.items)
    ? details.items
    : details.order_items || [];

  const receiptItems = items.length
    ? items
    : details.product_name
    ? [
        {
          nama_produk: details.product_name,
          qty: details.qty || 1,
          harga_satuan: details.price || details.harga_jual || 0,
          subtotal:
            details.subtotal || details.harga_jual || details.total_bayar || 0,
        },
      ]
    : [];

  const paymentMethod =
    details.metode_bayar || details.payment_method || details.payment || "Tunai";
  const customer =
    details.nama_pelanggan || details.customer_name || details.customer || "-";
  const cashier = formatReceiptCashierName(
    details.kasir_nama || details.kasir || details.kasir_id
  );
  const subtotal =
    details.subtotal ?? details.harga_jual ?? details.nominal ?? selectedRow.amount;
  const total = details.total_bayar ?? details.harga_jual ?? details.nominal ?? selectedRow.amount;
  const paid = details.uang_diterima ?? details.paid ?? total;
  const change = details.kembalian ?? details.change ?? 0;
  const date = details.created_at || details.tanggal || selectedRow.timestamp;

  return (
    <div className="receipt-print hidden print:block">
      <div className="mx-auto w-[340px] max-w-[340px] overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-900">
        <div className="h-2 bg-[linear-gradient(90deg,#0f172a_0%,#d4af37_45%,#0f172a_100%)]" />
        <div className="space-y-1 border-b border-slate-200 px-5 pb-4 pt-5 text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--brand-gold)]/40 bg-white p-2 shadow-sm">
            <img src={logo} alt="Raja Aksesoris Logo" className="h-full w-full object-contain" />
          </div>
          <p className="text-base font-black uppercase tracking-[0.22em]">Raja Aksesoris</p>
          <div className="mx-auto h-[2px] w-16 rounded-full bg-[var(--brand-gold)]" />
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Transaksi POS</p>
          <p className="mt-2 text-[11px] font-medium text-slate-700">
            {formatDateTime(date, { dateStyle: "medium", timeStyle: "short" })}
          </p>
          <p className="text-[11px] text-slate-600">ID: {selectedRow.title}</p>
        </div>

        <div className="space-y-3 border-b border-slate-200 px-5 py-4 text-[12px]">
          <div className="flex justify-between text-slate-500">
            <span>Customer</span>
            <span>{customer}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Kasir</span>
            <span>{cashier}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Metode</span>
            <span>{paymentMethod}</span>
          </div>
        </div>

        <div className="px-5 pt-4 text-[12px]">
          {receiptItems.length > 0 ? (
            <div className="space-y-3">
              {receiptItems.map((item, index) => (
                <div key={index} className="space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-slate-900">{item.nama_produk || item.name || "Produk"}</p>
                    <p className="font-semibold text-slate-900">
                      {formatRupiah(item.subtotal ?? item.harga_satuan ?? 0)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>{item.qty}x {formatRupiah(item.harga_satuan ?? item.price ?? 0)}</span>
                    <span>{formatLabel(item.unit || "")}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-slate-500">Tidak ada item detail untuk struk ini.</div>
          )}
        </div>

        <div className="mx-5 mt-4 space-y-2 border-t border-slate-200 pt-4 text-[12px]">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span>{formatRupiah(subtotal)}</span>
          </div>
          <div className="rounded-lg bg-slate-950 px-3 py-2 text-white">
            <div className="flex justify-between font-black">
              <span>Total</span>
              <span>{formatRupiah(total)}</span>
            </div>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Bayar</span>
            <span>{formatRupiah(paid)}</span>
          </div>
          <div className="flex justify-between font-semibold text-slate-900">
            <span>Kembalian</span>
            <span>{formatRupiah(change)}</span>
          </div>
        </div>

        <div className="mx-5 mt-4 border-t border-slate-200 pb-5 pt-3 text-center text-[10px] text-slate-500">
          <p>Terima kasih sudah berbelanja</p>
          <p className="mt-1 font-bold uppercase tracking-[0.2em] text-[var(--brand-gold-strong)]">Raja Aksesoris</p>
        </div>
      </div>
    </div>
  );
}
