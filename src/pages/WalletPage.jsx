import { useMemo, useState } from "react";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { useData } from "../contexts/DataContext";
import { showNotification } from "../contexts/NotificationContext";
import {
  walletPlatformLabelMap,
  walletPlatforms,
  walletTransactionTypeLabelMap,
  walletTransactionTypes,
} from "../data/businessOptions";
import {
  formatDateInput,
  formatDateTime,
  formatRupiah,
  parseDateInput,
} from "../utils/format";

function getRange(period, customRange) {
  const today = new Date();

  if (period === "today") return { startDate: today, endDate: today };
  if (period === "7") {
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 6);
    return { startDate, endDate: today };
  }

  return {
    startDate: parseDateInput(customRange.startDate),
    endDate: parseDateInput(customRange.endDate),
  };
}

const initialForm = {
  jenis: "masuk",
  platform: "dana",
  platform_tujuan: "",
  nominal: "",
  biaya_admin: "0",
  keterangan: "",
};

const LOW_BALANCE_THRESHOLD = 50000;

export default function WalletPage() {
  const { loading, createWalletTransaction, getDashboardSummary, walletBalances } = useData();
  const [period, setPeriod] = useState("today");
  const [customRange, setCustomRange] = useState({
    startDate: formatDateInput(new Date()),
    endDate: formatDateInput(new Date()),
  });
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const range = useMemo(() => getRange(period, customRange), [customRange, period]);
  const summary = useMemo(() => getDashboardSummary(range), [getDashboardSummary, range]);

  const requiresTarget = form.jenis === "transfer_antar";

  if (loading) {
    return <div className="brand-panel px-6 py-10 text-slate-600">Memuat saldo internal...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Internal Balance"
        title="SALDO APLIKASI"
        description="Saldo hanya berubah dari Saldo Masuk, Saldo Keluar, dan Transfer Antar Wallet. Transaksi POS memakai saldo ini untuk validasi, tanpa potong atau tambah saldo otomatis."
        icon="coins"
        actions={
          <>
            {["today", "7", "custom"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPeriod(item)}
                className={item === period ? "brand-button-primary" : "brand-button-secondary"}
              >
                {item === "today" ? "Hari Ini" : item === "7" ? "7 Hari" : "Custom"}
              </button>
            ))}
          </>
        }
      />

      {period === "custom" ? (
        <Panel className="grid gap-3 p-5 md:grid-cols-2">
          <input
            type="date"
            value={customRange.startDate}
            onChange={(event) =>
              setCustomRange((prev) => ({ ...prev, startDate: event.target.value }))
            }
            className="brand-input"
          />
          <input
            type="date"
            value={customRange.endDate}
            onChange={(event) =>
              setCustomRange((prev) => ({ ...prev, endDate: event.target.value }))
            }
            className="brand-input"
          />
        </Panel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {walletBalances.filter(wallet => wallet.id !== 'cash').map((wallet) => {
          const balanceClass =
            wallet.balance < 0
              ? "text-rose-600"
              : wallet.balance === 0
                ? "text-slate-400"
                : "text-slate-950";
          const isLowBalance =
            wallet.type === "validated" &&
            wallet.balance > 0 &&
            wallet.balance <= LOW_BALANCE_THRESHOLD;
          const statusLabel =
            wallet.balance < 0
              ? "Saldo minus"
              : wallet.balance === 0
                ? "Saldo kosong"
                : isLowBalance
                  ? "Saldo rendah"
                  : null;

          return (
            <Panel key={wallet.id} className="p-5 shadow-sm">
              <div className="mb-4 h-1.5 w-14 rounded-full bg-[var(--brand-gold)]/80" />
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                  {wallet.name}
                </p>
                {statusLabel ? (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      wallet.balance < 0
                        ? "bg-rose-100 text-rose-700"
                        : isLowBalance
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {statusLabel}
                  </span>
                ) : null}
              </div>
              <p className={`mt-3 text-3xl font-extrabold tracking-tight ${balanceClass}`}>
                {formatRupiah(wallet.balance)}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {wallet.type === "validated"
                  ? "Wajib cukup sebelum transaksi diproses."
                  : wallet.type === "qris"
                    ? "QRIS selalu boleh dan transaksi tidak mengubah saldo."
                    : "Cash selalu boleh dipakai."}
              </p>
            </Panel>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Mutasi saldo
          </h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Gunakan form ini untuk update saldo manual. Transaksi penjualan, layanan, dan logistik
            tidak akan mengubah saldo wallet.
          </p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setSubmitting(true);
              try {
                await createWalletTransaction({
                  jenis: form.jenis,
                  platform: form.platform,
                  platform_tujuan: requiresTarget ? form.platform_tujuan : null,
                  nominal: Number(form.nominal),
                  biaya_admin: Number(form.biaya_admin || 0),
                  keterangan: form.keterangan,
                });
                setForm(initialForm);
              } catch (error) {
                showNotification("error", error.message || "Gagal menyimpan mutasi saldo.");
              } finally {
                setSubmitting(false);
              }
            }}
            className="mt-5 grid gap-4 md:grid-cols-2"
          >
            <select
              value={form.jenis}
              onChange={(event) => setForm((prev) => ({ ...prev, jenis: event.target.value }))}
              className="brand-select"
            >
              {walletTransactionTypes.map((item) => (
                <option key={item.value} value={item.value} className="bg-white">
                  {item.label}
                </option>
              ))}
            </select>
            <select
              value={form.platform}
              onChange={(event) => setForm((prev) => ({ ...prev, platform: event.target.value }))}
              className="brand-select"
            >
              {walletPlatforms.filter(platform => platform.value !== 'cash').map((item) => (
                <option key={item.value} value={item.value} className="bg-white">
                  {item.label}
                </option>
              ))}
            </select>
            {requiresTarget ? (
              <select
                value={form.platform_tujuan}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, platform_tujuan: event.target.value }))
                }
                className="brand-select md:col-span-2"
              >
                <option value="" className="bg-white">
                  Pilih tujuan
                </option>
                {walletPlatforms.filter(platform => platform.value !== 'cash').map((item) => (
                  <option key={item.value} value={item.value} className="bg-white">
                    {item.label}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              type="number"
              min="0"
              value={form.nominal}
              onChange={(event) => setForm((prev) => ({ ...prev, nominal: event.target.value }))}
              className="brand-input"
              placeholder="Nominal"
              required
            />
            <input
              type="number"
              min="0"
              value={form.biaya_admin}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, biaya_admin: event.target.value }))
              }
              className="brand-input"
              placeholder="Biaya admin"
            />
            <textarea
              value={form.keterangan}
              onChange={(event) => setForm((prev) => ({ ...prev, keterangan: event.target.value }))}
              className="brand-textarea md:col-span-2"
              placeholder="Keterangan mutasi"
            />
            <button
              type="submit"
              disabled={submitting}
              className="brand-button-success md:col-span-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Menyimpan..." : "Simpan Mutasi"}
            </button>
          </form>
        </Panel>

        <Panel variant="strong" className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Riwayat saldo
          </h3>
          <div className="brand-scrollbar mt-5 overflow-x-auto">
            <table className="brand-table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Platform</th>
                  <th>Jenis</th>
                  <th>Tujuan</th>
                  <th className="text-right">Nominal</th>
                  <th>Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {summary.walletTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="text-slate-600">
                      {formatDateTime(transaction.created_at, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="font-semibold text-slate-950">
                      {walletPlatformLabelMap[transaction.platform] || transaction.platform}
                    </td>
                    <td className="text-slate-600">
                      {walletTransactionTypeLabelMap[transaction.jenis] || transaction.jenis}
                    </td>
                    <td className="text-slate-600">
                      {transaction.platform_tujuan
                        ? walletPlatformLabelMap[transaction.platform_tujuan] ||
                          transaction.platform_tujuan
                        : "-"}
                    </td>
                    <td className="text-right text-slate-600">
                      {formatRupiah(transaction.nominal)}
                    </td>
                    <td className="text-slate-600">{transaction.keterangan || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
