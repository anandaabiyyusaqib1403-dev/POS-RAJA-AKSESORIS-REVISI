import { buildReceiptPrintModel } from "../utils/print";
import { formatRupiah } from "../utils/format";

export default function PrintReceipt({ transaction }) {
  if (!transaction) return null;

  const receipt = buildReceiptPrintModel(transaction);

  return (
    <div className="receipt-print min-h-screen bg-slate-100 px-4 py-8 text-black print:min-h-0 print:bg-white print:px-0 print:py-0">
      <div
        id="print-area"
        className="thermal-paper mx-auto w-[320px] overflow-hidden bg-white font-mono text-[12px] leading-[1.5] text-slate-950 print:mx-0 print:shadow-none"
      >
        <div className="h-2 bg-[linear-gradient(90deg,#0f172a_0%,#d4af37_45%,#0f172a_100%)]" />
        <div className="p-3">
          <header className="text-center">
            <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-xl border border-[var(--brand-gold)]/40 bg-white p-2 shadow-[0_8px_20px_rgba(15,23,42,0.10)]">
              <img
                src={receipt.store.logoSrc}
                alt="Logo Raja Aksesoris"
                className="h-full w-full object-contain"
              />
            </div>
            <h1 className="text-[17px] font-black uppercase tracking-[0.14em]">
              {receipt.store.name}
            </h1>
            <div className="mx-auto mt-2 h-[2px] w-20 rounded-full bg-[var(--brand-gold)]" />
            <div className="mt-2 space-y-0.5 text-[11px] leading-[1.45] text-slate-700">
              {receipt.store.addressLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p>{receipt.store.phone}</p>
            </div>
            <div className="mt-3 inline-flex rounded-md border border-slate-900 bg-slate-950 px-3 py-1 text-[9px] font-black uppercase tracking-[0.22em] text-white">
              Struk Pembayaran
            </div>
          </header>

          <section className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="grid grid-cols-[1fr_auto] gap-x-3">
              <span>No</span>
              <span className="font-bold">{receipt.noTransaksi}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-x-3">
              <span>Tanggal</span>
              <span>{receipt.dateLabel}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-x-3">
              <span>Jam</span>
              <span>{receipt.timeLabel}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-x-3">
              <span>Kasir</span>
              <span>{receipt.cashierLabel}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-x-3">
              <span>Bayar via</span>
              <span className="font-bold">{receipt.paymentMethodLabel}</span>
            </div>
          </section>

          <section className="mt-3 border-t border-dashed border-slate-400 pt-3">
            {receipt.items.length ? (
              <div className="space-y-3">
                {receipt.items.map((item, index) => (
                  <div key={item.key}>
                    <p className="break-words font-bold">
                      {index + 1}. {item.name}
                    </p>
                    <div className="mt-0.5 grid grid-cols-[1fr_auto] gap-x-3 text-[11px] text-slate-700">
                      <span>
                        {item.qty} x {formatRupiah(item.unitPrice)}
                      </span>
                      <span className="text-right font-bold text-slate-950">
                        {formatRupiah(item.subtotal)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>Belum ada item transaksi.</p>
            )}
          </section>

          <section className="mt-3 border-t border-dashed border-slate-400 pt-3">
            <div className="grid grid-cols-[1fr_auto] gap-x-3">
              <span>Total QTY</span>
              <span>{receipt.totalQty} item</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-x-3">
              <span>Subtotal</span>
              <span>{formatRupiah(receipt.subtotal)}</span>
            </div>
            <div className="my-2 rounded-lg border border-slate-950 bg-[linear-gradient(135deg,#111827_0%,#0f172a_100%)] px-3 py-2 text-white">
              <div className="grid grid-cols-[1fr_auto] gap-x-3 text-[14px] font-black">
                <span>TOTAL</span>
                <span>{formatRupiah(receipt.total)}</span>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-x-3">
              <span>Bayar</span>
              <span>{formatRupiah(receipt.paid)}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-x-3 font-bold">
              <span>Kembali</span>
              <span>{formatRupiah(receipt.change)}</span>
            </div>
          </section>

          {receipt.note ? (
            <section className="mt-3 border-t border-dashed border-slate-400 pt-3">
              <p className="font-bold">Catatan</p>
              <p className="mt-1 whitespace-pre-wrap break-words">{receipt.note}</p>
            </section>
          ) : null}

          <footer className="mt-4 border-t border-dashed border-slate-400 pt-3 text-center text-[11px] leading-5 text-slate-700">
            <p className="font-bold text-slate-950">Terima kasih telah berbelanja</p>
            <p>Cek barang sebelum meninggalkan toko</p>
            <p className="mt-2 font-black uppercase tracking-[0.2em] text-[var(--brand-gold-strong)]">
              Raja POS
            </p>
          </footer>
          <div className="mt-3 flex justify-center gap-1">
            {Array.from({ length: 22 }).map((_, index) => (
              <span key={index} className="h-1 w-1 rounded-full bg-slate-300" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
