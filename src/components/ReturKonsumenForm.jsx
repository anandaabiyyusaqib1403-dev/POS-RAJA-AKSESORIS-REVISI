import {
  AlertTriangle,
  BadgeDollarSign,
  CheckCircle2,
  LoaderCircle,
  PackageCheck,
  ReceiptText,
  Save,
  XCircle,
} from "lucide-react";
import Panel from "./app/Panel";
import { ReturConditionChips, ReturWorkflowSection } from "./ReturWorkflowPrimitives";

const outcomeStyles = {
  exchange: {
    icon: PackageCheck,
    active: "border-emerald-300 bg-emerald-50 text-emerald-900",
    inactive: "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50/60",
  },
  refund: {
    icon: BadgeDollarSign,
    active: "border-sky-300 bg-sky-50 text-sky-900",
    inactive: "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50/60",
  },
  rejected: {
    icon: XCircle,
    active: "border-rose-300 bg-rose-50 text-rose-900",
    inactive: "border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:bg-rose-50/60",
  },
};

export default function ReturKonsumenForm({
  form,
  setForm,
  transactions,
  products,
  selectedTransaction,
  selectedTransactionItem,
  selectedReplacementProduct,
  reasonOptions,
  outcomeOptions,
  estimatedRefund,
  formatRupiah,
  submitting,
  onSubmit,
}) {
  const claimOutcome = form.claimOutcome || "exchange";
  const quantity = Math.max(0, Number(form.quantity || 0));
  const replacementQuantity = Math.max(0, Number(form.replacementQuantity || 0));
  const replacementStock = Number(selectedReplacementProduct?.stok || 0);
  const isExchange = claimOutcome === "exchange";
  const isRefund = claimOutcome === "refund";
  const isRejected = claimOutcome === "rejected";
  const replacementStockInsufficient =
    isExchange && selectedReplacementProduct && replacementQuantity > replacementStock;
  const canSubmit =
    selectedTransactionItem &&
    quantity > 0 &&
    ((isExchange && selectedReplacementProduct && replacementQuantity > 0 && !replacementStockInsufficient) ||
      (isRefund && form.refundMethod) ||
      (isRejected && form.notes.trim().length > 0));

  const summaryLabel = isExchange ? "Barang pengganti" : isRefund ? "Estimasi refund" : "Hasil klaim";
  const summaryValue = isExchange
    ? `${replacementQuantity || 0} pcs`
    : isRefund
      ? formatRupiah(estimatedRefund)
      : "Ditolak";

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-3">
      <Panel className="p-5 sm:p-6 lg:col-span-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
            <ReceiptText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-slate-950">
              Garansi Konsumen
            </h2>
            <p className="text-sm text-slate-500">Validasi nota asal, item, dan hasil klaim garansi.</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <ReturWorkflowSection
            step="01"
            title="Pilih transaksi"
            description="Klaim garansi harus terhubung ke transaksi penjualan asal."
            complete={Boolean(selectedTransaction)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700">
                Transaksi Asal
                <select
                  value={form.transactionId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      transactionId: event.target.value,
                      transactionItemId: "",
                    }))
                  }
                  className="input mt-2"
                  required
                >
                  <option value="">Pilih transaksi</option>
                  {transactions.map((transaction) => (
                    <option key={transaction.id} value={transaction.id}>
                      {transaction.no_transaksi} - {formatRupiah(transaction.total_bayar)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Nama Konsumen
                <input
                  value={form.customerName}
                  onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))}
                  className="input mt-2"
                  placeholder="Opsional"
                />
              </label>
            </div>
          </ReturWorkflowSection>

          <ReturWorkflowSection
            step="02"
            title="Pilih item garansi"
            description="Pilih produk dari nota yang sedang diklaim."
            complete={Boolean(selectedTransactionItem && quantity > 0)}
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <label className="block text-sm font-semibold text-slate-700">
                Item Transaksi
                <select
                  value={form.transactionItemId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      transactionItemId: event.target.value,
                    }))
                  }
                  className="input mt-2"
                  required
                  disabled={!selectedTransaction}
                >
                  <option value="">Pilih item</option>
                  {(selectedTransaction?.items || []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nama_produk} - {item.qty} pcs
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Jumlah Klaim
                <input
                  value={form.quantity}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      quantity: event.target.value,
                      replacementQuantity: current.replacementQuantity || event.target.value,
                    }))
                  }
                  className="input mt-2"
                  type="number"
                  min="1"
                  max={selectedTransactionItem?.qty || undefined}
                  placeholder="0"
                  required
                />
              </label>
            </div>
          </ReturWorkflowSection>

          <ReturWorkflowSection
            step="03"
            title="Alasan dan kondisi"
            description="Catat kerusakan atau alasan klaim agar arsip garansi mudah diperiksa."
            complete={Boolean(form.condition.trim())}
          >
            <label className="block text-sm font-semibold text-slate-700 sm:max-w-sm">
              Alasan Klaim
              <select
                value={form.reason}
                onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                className="input mt-2"
              >
                {reasonOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Kondisi Barang
              <ReturConditionChips
                value={form.condition}
                onChange={(condition) => setForm((current) => ({ ...current, condition }))}
              />
              <textarea
                value={form.condition}
                onChange={(event) => setForm((current) => ({ ...current, condition: event.target.value }))}
                className="input mt-3 h-20 resize-y py-3"
                placeholder="Contoh: kabel putus, tidak bisa charge, fisik masih lengkap"
              />
            </label>
          </ReturWorkflowSection>

          <ReturWorkflowSection
            step="04"
            title="Hasil klaim"
            description="Pilih keputusan akhir klaim garansi."
            complete={canSubmit}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {outcomeOptions.map((option) => {
                const styles = outcomeStyles[option.value] || outcomeStyles.exchange;
                const Icon = styles.icon;
                const active = claimOutcome === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        claimOutcome: option.value,
                      }))
                    }
                    className={`flex min-h-[72px] items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm font-bold transition ${
                      active ? styles.active : styles.inactive
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    {option.label}
                  </button>
                );
              })}
            </div>

            {isExchange ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_180px]">
                <label className="block text-sm font-semibold text-slate-700">
                  Produk Pengganti
                  <select
                    value={form.replacementProductId}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, replacementProductId: event.target.value }))
                    }
                    className="input mt-2"
                    required={isExchange}
                  >
                    <option value="">Pilih produk</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.nama} - stok {product.stok}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Qty Pengganti
                  <input
                    value={form.replacementQuantity}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, replacementQuantity: event.target.value }))
                    }
                    className="input mt-2"
                    type="number"
                    min="1"
                    placeholder="1"
                    required={isExchange}
                  />
                </label>
                {selectedReplacementProduct ? (
                  <div
                    className={`sm:col-span-2 rounded-lg border px-4 py-3 text-sm font-semibold ${
                      replacementStockInsufficient
                        ? "border-rose-200 bg-rose-50 text-rose-800"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    Stok {selectedReplacementProduct.nama}: {replacementStock} pcs
                    {replacementStockInsufficient ? " - tidak cukup untuk klaim ini." : ""}
                  </div>
                ) : null}
              </div>
            ) : null}

            {isRefund ? (
              <label className="mt-4 block text-sm font-semibold text-slate-700 sm:max-w-sm">
                Metode Refund
                <select
                  value={form.refundMethod}
                  onChange={(event) => setForm((current) => ({ ...current, refundMethod: event.target.value }))}
                  className="input mt-2"
                >
                  <option value="cash">Cash</option>
                  <option value="qris">QRIS</option>
                  <option value="transfer">Transfer</option>
                </select>
              </label>
            ) : null}

            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Catatan Klaim
              <textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                className="input mt-2 h-20 resize-y py-3"
                placeholder={isRejected ? "Wajib isi alasan klaim ditolak" : "Nomor garansi, kelengkapan barang, atau catatan tambahan"}
                required={isRejected}
              />
            </label>
            {isRejected && !form.notes.trim() ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Catatan wajib diisi saat klaim ditolak.
              </div>
            ) : null}
          </ReturWorkflowSection>
        </div>
      </Panel>

      <Panel className="h-fit overflow-hidden border-[var(--brand-gold)]/22 p-0 lg:sticky lg:top-6">
        <div className="bg-slate-950 px-5 py-6 text-white sm:px-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
            {isRejected ? (
              <XCircle className="h-4 w-4" aria-hidden="true" />
            ) : isExchange ? (
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
            ) : (
              <BadgeDollarSign className="h-4 w-4" aria-hidden="true" />
            )}
            {summaryLabel}
          </div>
          <p className="mt-3 text-4xl font-black tracking-tight">{summaryValue}</p>
          <p className="mt-2 text-sm text-slate-300">
            {isExchange
              ? "Stok produk pengganti akan berkurang setelah klaim disimpan."
              : isRefund
                ? "Nominal yang dikembalikan kepada konsumen."
                : "Klaim dicatat tanpa perubahan stok atau refund."}
          </p>
        </div>

        <div className="p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Item klaim</p>
              <p className="mt-1 text-base font-bold text-slate-950">{quantity || 0} pcs</p>
            </div>
            <div className={`rounded-lg p-3 ${isExchange ? "bg-emerald-50" : "bg-slate-50"}`}>
              <p className={`text-xs ${isExchange ? "text-emerald-700" : "text-slate-500"}`}>Dampak stok</p>
              <p className={`mt-1 text-base font-bold ${isExchange ? "text-emerald-800" : "text-slate-700"}`}>
                {isExchange ? "- stok pengganti" : "Tidak berubah"}
              </p>
            </div>
          </div>
          {selectedTransactionItem ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-950">{selectedTransactionItem.nama_produk}</p>
              <p className="mt-1">Harga nota {formatRupiah(selectedTransactionItem.harga_satuan)}</p>
              <p className="mt-1">Qty transaksi: {selectedTransactionItem.qty} pcs</p>
              {isExchange && selectedReplacementProduct ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-100/70 px-3 py-2 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  Pengganti: {selectedReplacementProduct.nama} ({replacementQuantity || 0} pcs)
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              Pilih transaksi dan item untuk membuat klaim garansi.
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !canSubmit}
            aria-busy={submitting}
            className="mt-5 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand-gold)] px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_26px_rgba(212,175,55,0.28)] transition hover:bg-[#c9a227] hover:shadow-[0_14px_30px_rgba(212,175,55,0.36)] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
          >
            {submitting ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {submitting ? "Memproses Klaim..." : "Simpan Klaim Garansi"}
          </button>
          {!canSubmit && !submitting ? (
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">
              Lengkapi transaksi, item, dan hasil klaim sebelum menyimpan.
            </p>
          ) : null}
        </div>
      </Panel>
    </form>
  );
}
