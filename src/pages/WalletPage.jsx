import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PaginationBar from "../components/PaginationBar";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import PinConfirmationModal from "../components/PinConfirmationModal";
import { showNotification } from "../contexts/NotificationContext";
import {
  isPinActionCancelledError,
  usePinConfirmation,
} from "../hooks/usePinConfirmation";
import { useReports } from "../hooks/useReports";
import { useWallet } from "../hooks/useWallet";
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
import CurrencyInput from "../components/CurrencyInput";
import { getMoneySaveFailureMessage } from "../core/money/moneyRetry";
import {
  createDateRangeFilters,
  usePagedSupabaseRows,
} from "../hooks/usePagedSupabaseRows";

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
const WALLET_LEDGER_SELECT = [
  "id",
  "platform",
  "jenis",
  "platform_tujuan",
  "nominal",
  "biaya_admin",
  "keterangan",
  "created_at",
].join(", ");

export default function WalletPage() {
  const location = useLocation();
  const {
    createWalletTransaction,
    refreshWallet,
    walletBalances,
  } = useWallet();
  const { getDashboardSummary } = useReports();
  const {
    isPinModalOpen,
    closePinModal,
    executeSensitiveAction,
    executeConfirmedAction,
    actionDescription,
  } = usePinConfirmation();
  const [period, setPeriod] = useState("today");
  const [customRange, setCustomRange] = useState({
    startDate: formatDateInput(new Date()),
    endDate: formatDateInput(new Date()),
  });
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const submissionRef = useRef(false);
  const [walletHydrating, setWalletHydrating] = useState(false);
  const [walletHydrationError, setWalletHydrationError] = useState("");
  const walletHydrationRef = useRef(false);
  const criticalOnly = new URLSearchParams(location.search).get("filter") === "critical";
  const visibleWalletBalances = walletBalances
    .filter((wallet) => wallet.id !== "cash")
    .filter((wallet) => !criticalOnly || Number(wallet.balance || 0) <= 0);

  const range = useMemo(() => getRange(period, customRange), [customRange, period]);
  const queryRange = useMemo(
    () => ({
      startDate: range.startDate ? formatDateInput(range.startDate) : "",
      endDate: range.endDate ? formatDateInput(range.endDate) : "",
    }),
    [range]
  );
  const walletLedger = usePagedSupabaseRows({
    table: "transaksi_dompet",
    select: WALLET_LEDGER_SELECT,
    filters: createDateRangeFilters("created_at", queryRange),
    pageSize: 12,
    orderBy: "created_at",
    ascending: false,
  });
  const summary = useMemo(() => getDashboardSummary(range), [getDashboardSummary, range]);
  const walletRows = walletLedger.error
    ? summary.walletTransactions.slice(0, 12)
    : walletLedger.rows;

  const requiresTarget = form.jenis === "transfer_antar";

  const hydrateWallet = useCallback(async () => {
    walletHydrationRef.current = true;
    setWalletHydrating(true);
    setWalletHydrationError("");

    try {
      await refreshWallet();
    } catch (error) {
      const message = error.message || "Gagal memuat saldo internal.";
      console.error("Gagal memuat saldo internal:", error);
      setWalletHydrationError(message);
      showNotification("error", message);
    } finally {
      setWalletHydrating(false);
    }
  }, [refreshWallet]);

  useEffect(() => {
    if (walletHydrationRef.current) return undefined;

    void hydrateWallet();
    return undefined;
  }, [hydrateWallet]);

  const retryWalletHydration = () => {
    walletHydrationRef.current = false;
    void hydrateWallet();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submissionRef.current) return;
    submissionRef.current = true;
    setSubmitting(true);
    try {
      await executeSensitiveAction(
        async () => {
          await createWalletTransaction({
            jenis: form.jenis,
            platform: form.platform,
            platform_tujuan: requiresTarget ? form.platform_tujuan : null,
            nominal: Number(form.nominal),
            biaya_admin: Number(form.biaya_admin || 0),
            keterangan: form.keterangan,
          });
        },
        "WALLET.MUTATE"
      );
      setForm(initialForm);
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification(
        "error",
        getMoneySaveFailureMessage(error, "Gagal menyimpan mutasi saldo.")
      );
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Saldo toko"
        title="Saldo Aplikasi"
        description="Pantau saldo internal toko, koreksi manual, dan alur dana dari transaksi harian."
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

      {walletHydrating ? (
        <Panel className="p-4 text-sm font-semibold text-slate-600">
          Memuat saldo internal...
        </Panel>
      ) : null}

      {walletHydrationError ? (
        <Panel className="border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">{walletHydrationError}</p>
          <button type="button" onClick={retryWalletHydration} className="brand-button-secondary mt-3">
            Coba Lagi
          </button>
        </Panel>
      ) : null}

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
        {criticalOnly ? (
          <div className="col-span-full flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            Menampilkan saldo kritis dari alert dashboard.
            <Link to="/saldo" className="underline underline-offset-4">Tampilkan semua saldo</Link>
          </div>
        ) : null}
        {visibleWalletBalances.map((wallet) => {
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
                  ? "Dipakai untuk modal layanan dan koreksi saldo."
                  : wallet.type === "qris"
                    ? "QRIS bertambah dari transaksi kasir."
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
            Catat koreksi saldo di sini. Transaksi harian akan ikut membentuk saldo yang tampil.
          </p>
          <form
            onSubmit={handleSubmit}
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
            <CurrencyInput
              value={form.nominal}
              onChange={(value) => setForm((prev) => ({ ...prev, nominal: value }))}
              className="brand-input"
              placeholder="Nominal"
              required
            />
            <CurrencyInput
              value={form.biaya_admin}
              onChange={(value) => setForm((prev) => ({ ...prev, biaya_admin: value }))}
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                Riwayat saldo
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Data ledger dimuat per halaman supaya menu saldo tetap ringan.
              </p>
            </div>
            {walletLedger.loading ? (
              <span className="brand-badge-neutral">Memuat</span>
            ) : null}
          </div>
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
                {walletRows.length ? (
                  walletRows.map((transaction) => (
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
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="py-10 text-center text-slate-500">
                      Belum ada riwayat saldo pada periode ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!walletLedger.error ? (
            <PaginationBar
              page={walletLedger.page}
              pageCount={walletLedger.pageCount}
              from={walletLedger.from}
              to={walletLedger.to}
              count={walletLedger.count}
              onPageChange={walletLedger.setPage}
            />
          ) : null}
        </Panel>
      </div>
      <PinConfirmationModal
        isOpen={isPinModalOpen}
        onClose={closePinModal}
        onConfirm={async () => {
          try {
            await executeConfirmedAction();
          } catch (error) {
            if (isPinActionCancelledError(error)) return;
            showNotification("error", error.message);
          }
        }}
        title="Konfirmasi PIN"
        message={`Masukkan PIN untuk lanjut: ${actionDescription}`}
      />
    </div>
  );
}

