import { useState } from "react";
import { showNotification } from "../contexts/NotificationContext";
import { formatDateTime, formatRupiah } from "../utils/format";
import { formatReceiptPaymentMethod, generateReceiptHTML } from "../utils/print";
import PrintReceipt from "./PrintReceipt";

function handlePrint(transaction) {
  const printWindow = window.open("", "_blank", "width=420,height=720");
  if (!printWindow) {
    showNotification("error", "Popup print diblokir browser. Izinkan popup lalu coba lagi.");
    return;
  }

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };

  printWindow.document.open();
  printWindow.document.write(generateReceiptHTML(transaction));
  printWindow.document.close();
}

export default function ReceiptModal({ transaction, onClose, onNewTransaction }) {
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  
  if (!transaction) return null;

  if (showPrintPreview) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-white">
        <PrintReceipt transaction={transaction} />
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 gap-3 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="brand-button-primary px-8 py-3 rounded-2xl"
          >
            Print Sekarang
          </button>
          <button
            type="button"
            onClick={() => setShowPrintPreview(false)}
            className="brand-button-secondary px-8 py-3 rounded-2xl"
          >
            Kembali
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="brand-panel brand-panel-strong w-full max-w-md p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--brand-gold)]">
              Struk transaksi
            </p>
            <h3 className="mt-2 text-2xl font-black text-slate-950">
              {transaction.no_transaksi}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {formatDateTime(transaction.created_at, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="brand-button-secondary rounded-full px-3 py-1.5"
          >
            Tutup
          </button>
        </div>

        <div id="printable-receipt" className="mt-6 rounded-[28px] bg-white p-5">
          <div className="border-b border-dashed border-slate-300 pb-4">
            <p className="text-center text-sm font-black text-slate-900">RAJA AKSESORIS</p>
            <p className="mt-1 text-center text-xs text-slate-500">POS Counter HP Premium</p>
          </div>

          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <div className="flex justify-between gap-4">
              <span>No. Transaksi</span>
              <span className="font-semibold text-slate-900">{transaction.no_transaksi}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Metode bayar</span>
              <span className="font-semibold text-slate-900">
                {formatReceiptPaymentMethod(transaction.metode_bayar)}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-3 border-y border-dashed border-slate-300 py-4">
            {(transaction.items || []).map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{item.nama_produk}</p>
                  <p className="text-xs text-slate-500">
                    {item.qty} x {formatRupiah(item.harga_satuan)}
                  </p>
                </div>
                <p className="shrink-0 font-semibold text-slate-900">
                  {formatRupiah(item.subtotal)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <div className="flex justify-between gap-4">
              <span>Total</span>
              <span className="font-bold text-slate-900">
                {formatRupiah(transaction.total_bayar)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Bayar</span>
              <span className="font-semibold text-slate-900">
                {formatRupiah(transaction.uang_diterima)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Kembalian</span>
              <span className="font-semibold text-slate-900">
                {formatRupiah(transaction.kembalian)}
              </span>
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-slate-500">
            Terima kasih. Simpan struk ini sebagai bukti transaksi.
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => setShowPrintPreview(true)}
            className="brand-button-primary"
          >
            Preview Struk
          </button>
          <button
            type="button"
            onClick={() => handlePrint(transaction)}
            className="brand-button-primary"
          >
            Print Langsung
          </button>
          <button
            type="button"
            onClick={onClose}
            className="brand-button-secondary"
          >
            Selesai
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onNewTransaction?.();
            }}
            className="brand-button-success"
          >
            Transaksi Baru
          </button>
        </div>
      </div>
    </div>
  );
}
