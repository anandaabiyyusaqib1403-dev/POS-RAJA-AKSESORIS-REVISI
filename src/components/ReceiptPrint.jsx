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
      <div className="mx-auto w-[340px] max-w-[340px] rounded-[20px] border border-slate-200 bg-white p-5 text-slate-900">
        <div className="space-y-1 border-b border-slate-200 pb-4 text-center">
          <img src={logo} alt="Raja Aksesoris Logo" className="mx-auto h-12 w-auto mb-2" />
          <p className="text-base font-black tracking-[0.3em] uppercase">Raja Aksesoris</p>
          <p className="text-[10px] text-slate-500">Transaksi POS</p>
          <p className="mt-2 text-[11px] font-medium text-slate-700">
            {formatDateTime(date, { dateStyle: "medium", timeStyle: "short" })}
          </p>
          <p className="text-[11px] text-slate-600">ID: {selectedRow.title}</p>
        </div>

        <div className="space-y-3 border-b border-slate-200 py-4 text-[12px]">
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

        <div className="pt-4 text-[12px]">
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

        <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-[12px]">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span>{formatRupiah(subtotal)}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Total</span>
            <span>{formatRupiah(total)}</span>
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

        <div className="mt-4 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-500">
          <p>Terima kasih sudah berbelanja</p>
          <p className="mt-1">Raja Aksesoris</p>
        </div>
      </div>
    </div>
  );
}
