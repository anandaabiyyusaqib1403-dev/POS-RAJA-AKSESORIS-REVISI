import { useEffect, useMemo, useRef, useState } from "react";
import { showNotification } from "../contexts/NotificationContext";
import { formatRupiah } from "../utils/format";
import { buildReceiptPrintModel, printTransactionReceiptWithStatus } from "../utils/print";
import { recordOperationalEventSoon } from "../services/observability";
import AppIcon from "./app/AppIcon";
import LottieState from "./LottieState";
import PrintReceipt from "./PrintReceipt";

const printStatusStyles = {
  idle: {
    className: "border-slate-200 bg-slate-50 text-slate-600",
    icon: "receipt",
  },
  info: {
    className: "border-blue-200 bg-blue-50 text-blue-700",
    icon: "spark",
  },
  success: {
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: "check",
  },
  error: {
    className: "border-rose-200 bg-rose-50 text-rose-700",
    icon: "return",
  },
};

function PrintStatus({ status }) {
  const resolvedStatus = status || {
    type: "idle",
    message: "Struk siap dicetak saat pelanggan membutuhkan bukti transaksi.",
  };
  const style = printStatusStyles[resolvedStatus.type] || printStatusStyles.idle;

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${style.className}`}
    >
      {resolvedStatus.type === "info" ? (
        <LottieState
          ariaLabel="Menyiapkan struk"
          className="-my-1"
          icon="receipt"
          size={34}
        />
      ) : (
        <AppIcon name={style.icon} className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span>{resolvedStatus.message}</span>
    </div>
  );
}

function ReceiptRow({ label, value, strong = false, valueClassName = "" }) {
  return (
    <div className={`grid grid-cols-[1fr_auto] gap-4 ${strong ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className={`text-right ${valueClassName}`.trim()}>{value}</span>
    </div>
  );
}

function SummaryTile({ label, value, tone = "default" }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "gold"
        ? "border-[var(--brand-gold)]/30 bg-[var(--brand-gold)]/10 text-slate-950"
        : "border-slate-200 bg-white text-slate-950";

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
        {label}
      </p>
      <p className="mt-2 text-lg font-black tracking-tight">{value}</p>
    </div>
  );
}

function ThermalReceiptPreview({ receipt }) {
  return (
    <div className="thermal-paper mx-auto w-full max-w-[356px] overflow-hidden bg-white font-mono text-[12px] leading-6 text-slate-950">
      <div className="h-2 bg-[linear-gradient(90deg,#0f172a_0%,#d4af37_45%,#0f172a_100%)]" />
      <div className="p-5">
      <header className="text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-xl border border-[var(--brand-gold)]/40 bg-white p-2 shadow-[0_8px_20px_rgba(15,23,42,0.10)]">
          <img
            src={receipt.store.logoSrc}
            alt="Logo Raja Aksesoris"
            className="h-full w-full object-contain"
          />
        </div>
        <p className="text-base font-black uppercase tracking-[0.22em]">{receipt.store.name}</p>
        <div className="mx-auto mt-2 h-[2px] w-20 rounded-full bg-[var(--brand-gold)]" />
        <div className="mt-2 text-[11px] leading-5 text-slate-600">
          {receipt.store.addressLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p>{receipt.store.phone}</p>
        </div>
        <div className="mt-3 inline-flex rounded border border-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em]">
          Struk Pembayaran
        </div>
      </header>

      <section className="mt-4 border-t border-dashed border-slate-400 pt-3">
        <ReceiptRow label="No" value={receipt.noTransaksi} />
        <ReceiptRow label="Tanggal" value={receipt.dateLabel} />
        <ReceiptRow label="Jam" value={receipt.timeLabel} />
        <ReceiptRow label="Kasir" value={receipt.cashierLabel} />
        <ReceiptRow
          label="Bayar via"
          value={receipt.paymentMethodLabel}
          valueClassName="font-black"
        />
      </section>

      <section className="mt-4 border-t border-dashed border-slate-400 pt-3">
        {receipt.items.length ? (
          <div className="space-y-3">
            {receipt.items.map((item, index) => (
              <div key={item.key}>
                <p className="break-words font-bold">
                  {index + 1}. {item.name}
                </p>
                <ReceiptRow
                  label={`${item.qty} x ${formatRupiah(item.unitPrice)}`}
                  value={formatRupiah(item.subtotal)}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500">Belum ada item transaksi.</p>
        )}
      </section>

      <section className="mt-4 border-t border-dashed border-slate-400 pt-3">
        <ReceiptRow label="Total QTY" value={`${receipt.totalQty} item`} />
        <ReceiptRow label="Subtotal" value={formatRupiah(receipt.subtotal)} />
        <div className="my-3 rounded-lg border border-slate-900 bg-slate-950 px-3 py-2 text-white">
          <ReceiptRow label="TOTAL" value={formatRupiah(receipt.total)} strong />
        </div>
        <ReceiptRow label="Bayar" value={formatRupiah(receipt.paid)} />
        <ReceiptRow
          label="Kembali"
          value={formatRupiah(receipt.change)}
          valueClassName="font-black"
        />
      </section>

      {receipt.note ? (
        <section className="mt-4 border-t border-dashed border-slate-400 pt-3">
          <p className="font-bold">Catatan</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{receipt.note}</p>
        </section>
      ) : null}

      <footer className="mt-4 border-t border-dashed border-slate-400 pt-3 text-center text-[11px] leading-5 text-slate-600">
        <p>Terima kasih telah berbelanja</p>
        <p>Cek barang sebelum meninggalkan toko</p>
        <p className="mt-2 font-bold uppercase tracking-[0.2em] text-[var(--brand-gold-strong)]">Raja POS</p>
      </footer>
      </div>
    </div>
  );
}

export default function ReceiptModal({ transaction, onClose, onNewTransaction }) {
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printStatus, setPrintStatus] = useState(null);
  const printStatusTimerRef = useRef(null);
  const printButtonRef = useRef(null);
  const browserPrintButtonRef = useRef(null);
  const receipt = useMemo(() => buildReceiptPrintModel(transaction), [transaction]);

  useEffect(
    () => () => {
      window.clearTimeout(printStatusTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!transaction) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      const targetButton = showPrintPreview ? browserPrintButtonRef.current : printButtonRef.current;
      targetButton?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [showPrintPreview, transaction]);

  if (!transaction) return null;

  const handlePrint = () => {
    window.clearTimeout(printStatusTimerRef.current);
    setPrintStatus({
      type: "info",
      message: "Menyiapkan jendela cetak struk.",
    });

    const printResult = printTransactionReceiptWithStatus(transaction);
    if (!printResult.ok) {
      const message =
        printResult.message ||
        "Jendela cetak tidak bisa dibuka. Izinkan popup browser, lalu tekan Cetak Struk lagi.";
      recordOperationalEventSoon({
        eventType: printResult.blocked ? "receipt_print_blocked" : "receipt_print_failed",
        severity: "warning",
        source: "printer",
        sourceId: transaction.id || null,
        details: printResult,
      });
      setPrintStatus({ type: "error", message });
      showNotification("warning", message);
      return;
    }

    recordOperationalEventSoon({
      eventType: "receipt_print_opened",
      severity: "info",
      source: "printer",
      sourceId: transaction.id || null,
      details: printResult,
    });

    const message = "Jendela cetak sudah dibuka. Pilih printer thermal lalu cetak struk.";
    printStatusTimerRef.current = window.setTimeout(() => {
      setPrintStatus({ type: "success", message });
      showNotification("success", message);
    }, 850);
  };

  const handleBrowserPrint = () => {
    try {
      window.print();
      setPrintStatus({
        type: "success",
        message: "Dialog cetak browser dibuka. Pilih printer thermal lalu lanjutkan.",
      });
    } catch {
      setPrintStatus({
        type: "error",
        message: "Dialog cetak gagal dibuka. Coba gunakan tombol Cetak Struk dari modal.",
      });
    }
  };

  if (showPrintPreview) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-slate-100">
        <PrintReceipt transaction={transaction} />
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-3 shadow-[0_18px_42px_rgba(15,23,42,0.16)] print:hidden">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-gold)]/14 text-slate-950">
                <AppIcon name="receipt" className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-950">Mode thermal 80mm</p>
                <p className="mt-1 text-xs text-slate-500">
                  Tampilan ini mengikuti ukuran cetak agar hasil struk lebih konsisten.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                ref={browserPrintButtonRef}
                type="button"
                onClick={handleBrowserPrint}
                className="brand-button-primary gap-2"
              >
                <AppIcon name="receipt" className="h-4 w-4" />
                Cetak Sekarang
              </button>
              <button
                type="button"
                onClick={() => setShowPrintPreview(false)}
                className="brand-button-secondary"
              >
                Kembali ke Modal
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center">
        <div className="brand-panel brand-panel-strong w-full max-w-5xl overflow-hidden">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="bg-[linear-gradient(180deg,#F8FAFC_0%,#EEF2F7_100%)] px-4 py-6 sm:px-8">
              <div className="mb-4 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                <AppIcon name="receipt" className="h-4 w-4" />
                Preview thermal
              </div>
              <ThermalReceiptPreview receipt={receipt} />
            </div>

            <aside className="flex flex-col gap-5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 gap-4">
                  <LottieState
                    ariaLabel="Pembayaran berhasil"
                    icon="check"
                    size={78}
                  />
                  <div className="min-w-0">
                    <span className="brand-badge-success">
                      <AppIcon name="check" className="h-3.5 w-3.5" />
                      Transaksi tersimpan
                    </span>
                    <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                      Struk siap dicetak
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {receipt.noTransaksi} sudah tercatat. Cetak struknya atau lanjut melayani
                      pelanggan berikutnya.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="brand-button-secondary min-h-[38px] px-3 py-2"
                >
                  Tutup
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <SummaryTile label="Total bayar" value={formatRupiah(receipt.total)} tone="gold" />
                <SummaryTile
                  label="Kembalian"
                  value={formatRupiah(receipt.change)}
                  tone={receipt.change > 0 ? "success" : "default"}
                />
              </div>

              <div className="brand-subtle-block space-y-3 text-sm text-slate-600">
                <ReceiptRow label="Nomor" value={receipt.noTransaksi} />
                <ReceiptRow label="Tanggal" value={`${receipt.dateLabel}, ${receipt.timeLabel}`} />
                <ReceiptRow label="Kasir" value={receipt.cashierLabel} />
                <ReceiptRow
                  label="Metode bayar"
                  value={receipt.paymentMethodLabel}
                  strong
                />
                <ReceiptRow label="Dibayar" value={formatRupiah(receipt.paid)} />
              </div>

              <PrintStatus status={printStatus} />

              <div className="grid gap-3">
                <button
                  ref={printButtonRef}
                  type="button"
                  onClick={handlePrint}
                  className="brand-button-primary gap-2"
                >
                  <AppIcon name="receipt" className="h-4 w-4" />
                  Cetak Struk Thermal
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintPreview(true)}
                  className="brand-button-secondary gap-2"
                >
                  <AppIcon name="search" className="h-4 w-4" />
                  Preview 80mm
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNewTransaction?.();
                  }}
                  className="brand-button-success gap-2"
                >
                  <AppIcon name="pos" className="h-4 w-4" />
                  Transaksi Baru
                </button>
                <button type="button" onClick={onClose} className="brand-button-secondary">
                  Selesai
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
