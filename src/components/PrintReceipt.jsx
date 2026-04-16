import { buildReceiptPrintModel } from "../utils/print";
import { formatRupiah } from "../utils/format";

export default function PrintReceipt({ transaction }) {
  if (!transaction) return null;

  const receipt = buildReceiptPrintModel(transaction);

  return (
    <div className="receipt-print min-h-screen bg-white px-3 py-3 text-black print:min-h-0 print:bg-white print:px-0 print:py-0">
      <div
        id="print-area"
        className="w-[320px] bg-white p-3 font-mono text-[13px] leading-[1.5] text-black"
      >
        <header className="text-center">
          <img
            src={receipt.store.logoSrc}
            alt="Logo Raja Aksesoris"
            className="mx-auto mb-2 h-10 w-auto object-contain grayscale"
          />
          <h1 className="text-[18px] font-bold uppercase tracking-[0.18em]">
            {receipt.store.name}
          </h1>
          <div className="mt-2 space-y-0.5 text-[12px] leading-[1.45]">
            {receipt.store.addressLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p>{receipt.store.phone}</p>
          </div>
        </header>

        <section className="mt-3 border-t border-dashed border-black pt-3">
          <div className="grid grid-cols-[1fr_auto] gap-x-3">
            <span>No</span>
            <span>{receipt.noTransaksi}</span>
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
            <span>{receipt.paymentMethodLabel}</span>
          </div>
        </section>

        <section className="mt-3 border-t border-dashed border-black pt-3">
          {receipt.items.length ? (
            <div className="space-y-3">
              {receipt.items.map((item, index) => (
                <div key={item.key}>
                  <p className="break-words font-bold">
                    {index + 1}. {item.name}
                  </p>
                  <div className="mt-0.5 grid grid-cols-[1fr_auto] gap-x-3 text-[12px]">
                    <span>
                      {item.qty} x {formatRupiah(item.unitPrice)}
                    </span>
                    <span className="text-right font-semibold">
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

        <section className="mt-3 border-t border-dashed border-black pt-3">
          <div className="grid grid-cols-[1fr_auto] gap-x-3">
            <span>Total QTY</span>
            <span>{receipt.totalQty} item</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-x-3">
            <span>Subtotal</span>
            <span>{formatRupiah(receipt.subtotal)}</span>
          </div>
          <div className="mt-0.5 grid grid-cols-[1fr_auto] gap-x-3 text-[14px] font-bold">
            <span>TOTAL</span>
            <span>{formatRupiah(receipt.total)}</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-x-3">
            <span>Bayar</span>
            <span>{formatRupiah(receipt.paid)}</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-x-3">
            <span>Kembali</span>
            <span>{formatRupiah(receipt.change)}</span>
          </div>
        </section>

        {receipt.note ? (
          <section className="mt-3 border-t border-dashed border-black pt-3">
            <p className="font-bold">Catatan</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{receipt.note}</p>
          </section>
        ) : null}

        <footer className="mt-4 border-t border-dashed border-black pt-3 text-center">
          <p>Terima kasih telah berbelanja</p>
          <p>Barang yang sudah dibeli tidak dapat ditukar</p>
        </footer>
      </div>
    </div>
  );
}
