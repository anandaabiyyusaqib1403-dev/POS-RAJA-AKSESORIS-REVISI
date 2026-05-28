import {
  AlertTriangle,
  BadgeDollarSign,
  LoaderCircle,
  PackageCheck,
  ReceiptText,
  Save,
} from "lucide-react";
import Panel from "./app/Panel";
import { ReturConditionChips, ReturWorkflowSection } from "./ReturWorkflowPrimitives";

export default function ReturKonsumenForm({
  form,
  setForm,
  transactions,
  selectedTransaction,
  selectedTransactionItem,
  reasonOptions,
  estimatedRefund,
  formatRupiah,
  submitting,
  onSubmit,
}) {
  const quantity = Number(form.quantity || 0);
  const canSubmit = selectedTransactionItem && quantity > 0;
  const heavyDamage = form.condition.trim().toLowerCase() === "rusak berat";

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-3">
      <Panel className="p-5 sm:p-6 lg:col-span-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
            <ReceiptText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-slate-950">
              Retur Konsumen
            </h2>
            <p className="text-sm text-slate-500">Validasi transaksi asal, nilai refund, dan keputusan stok.</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <ReturWorkflowSection
            step="01"
            title="Pilih transaksi"
            description="Refund harus terhubung ke transaksi penjualan asal."
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
            title="Pilih item"
            description="Pilih produk dan jumlah yang benar-benar dikembalikan."
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
                Jumlah Retur
                <input
                  value={form.quantity}
                  onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
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
            title="Alasan dan kondisi barang"
            description="Tentukan apakah barang layak masuk kembali ke stok jual."
            complete={Boolean(form.condition.trim())}
          >
            <label className="block text-sm font-semibold text-slate-700 sm:max-w-sm">
              Alasan Retur
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
                placeholder="Tambahkan detail kondisi bila diperlukan"
              />
            </label>
            <label
              className={`mt-4 flex items-start gap-3 rounded-lg border p-4 text-sm ${
                form.restock
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              <input
                type="checkbox"
                checked={form.restock}
                onChange={(event) => setForm((current) => ({ ...current, restock: event.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span>
                <span className="block font-semibold">Masuk kembali ke stok</span>
                <span className="mt-1 block text-xs font-medium leading-5">
                  {form.restock
                    ? "Stok produk akan otomatis bertambah kembali setelah retur disimpan."
                    : "Stok tidak bertambah; gunakan ini untuk barang yang tidak layak dijual."}
                </span>
              </span>
            </label>
            {form.restock && heavyDamage ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Restock tidak disarankan untuk barang rusak berat. Pastikan kondisi sudah diperiksa.
              </div>
            ) : null}
          </ReturWorkflowSection>

          <ReturWorkflowSection
            step="04"
            title="Refund dan finalisasi"
            description="Pilih aliran uang refund dan simpan catatan jika diperlukan."
            complete={Boolean(form.refundMethod)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700">
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
              <label className="block text-sm font-semibold text-slate-700">
                Catatan Refund
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  className="input mt-2 h-20 resize-y py-3"
                  placeholder="Referensi transfer atau keterangan"
                />
              </label>
            </div>
          </ReturWorkflowSection>
        </div>
      </Panel>

      <Panel className="h-fit overflow-hidden border-[var(--brand-gold)]/22 p-0 lg:sticky lg:top-6">
        <div className="bg-slate-950 px-5 py-6 text-white sm:px-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
            <BadgeDollarSign className="h-4 w-4" aria-hidden="true" />
            Estimasi Refund
          </div>
          <p className="mt-3 text-4xl font-black tracking-tight">{formatRupiah(estimatedRefund)}</p>
          <p className="mt-2 text-sm text-slate-300">Nominal yang akan dikembalikan kepada konsumen.</p>
        </div>

        <div className="p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Item retur</p>
              <p className="mt-1 text-base font-bold text-slate-950">{quantity || 0} pcs</p>
            </div>
            <div className={`rounded-lg p-3 ${form.restock ? "bg-emerald-50" : "bg-slate-50"}`}>
              <p className={`text-xs ${form.restock ? "text-emerald-700" : "text-slate-500"}`}>Dampak stok</p>
              <p className={`mt-1 text-base font-bold ${form.restock ? "text-emerald-800" : "text-slate-700"}`}>
                {form.restock ? "+ stok kembali" : "Tidak berubah"}
              </p>
            </div>
          </div>
          {selectedTransactionItem ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-950">{selectedTransactionItem.nama_produk}</p>
              <p className="mt-1">Harga {formatRupiah(selectedTransactionItem.harga_satuan)}</p>
              <p className="mt-1">Qty transaksi: {selectedTransactionItem.qty} pcs</p>
              <div
                className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                  form.restock
                    ? "bg-emerald-100/70 text-emerald-800"
                    : "bg-slate-200/70 text-slate-700"
                }`}
              >
                <PackageCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {form.restock
                  ? "Produk tercatat kembali sebagai stok tersedia."
                  : "Produk tidak akan ditambahkan kembali ke stok."}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              Pilih item transaksi dan jumlah untuk menghitung refund.
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
            {submitting ? "Memproses Refund..." : "Simpan Retur Konsumen"}
          </button>
          {!canSubmit && !submitting ? (
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">
              Pilih transaksi, item, dan jumlah sebelum memproses refund.
            </p>
          ) : null}
        </div>
      </Panel>
    </form>
  );
}
