import { formatDateTime, formatRupiah } from "../utils/format";
import { generateReceiptHTML } from "../utils/print";

function handlePrint(transaction) {
  const printWindow = window.open("", "_blank", "width=420,height=720");
  if (!printWindow) {
    window.alert("Popup print diblokir browser. Izinkan popup lalu coba lagi.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(generateReceiptHTML(transaction));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export default function ReceiptModal({ transaction, onClose, onNewTransaction }) {
  if (!transaction) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
      <div className="w-full max-w-md rounded-[32px] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">
              Struk transaksi
            </p>
            <h3 className="mt-2 text-2xl font-black text-[#1e3a5f]">
              {transaction.no_transaksi}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {formatDateTime(transaction.created_at, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Tutup
          </button>
        </div>

        <div id="printable-receipt" className="mt-6 rounded-[28px] bg-slate-50 p-5">
          <div className="border-b border-dashed border-slate-300 pb-4">
            <p className="text-center text-sm font-black text-slate-900">RAJA AKSESORIS</p>
            <p className="mt-1 text-center text-xs text-slate-500">POS Counter HP</p>
          </div>

          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <div className="flex justify-between gap-4">
              <span>No. Transaksi</span>
              <span className="font-semibold text-slate-900">{transaction.no_transaksi}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Metode bayar</span>
              <span className="font-semibold capitalize text-slate-900">
                {transaction.metode_bayar}
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

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => handlePrint(transaction)}
            className="rounded-2xl bg-[#1e3a5f] px-4 py-3 text-sm font-semibold text-white hover:bg-[#274a75]"
          >
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Selesai
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onNewTransaction?.();
            }}
            className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            Transaksi Baru
          </button>
        </div>
      </div>
    </div>
  );
}
