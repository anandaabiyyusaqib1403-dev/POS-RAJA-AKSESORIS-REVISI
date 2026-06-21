import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Repeat2,
  Save,
} from "lucide-react";
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
const QUICK_AMOUNT_CHIPS = [
  { label: "+50rb", value: 50000 },
  { label: "+100rb", value: 100000 },
  { label: "+200rb", value: 200000 },
  { label: "+500rb", value: 500000 },
];
const walletFormPlatforms = walletPlatforms.filter((platform) => platform.value !== "cash");
const walletMutationMeta = {
  masuk: {
    icon: ArrowDownLeft,
    label: "Masuk",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  keluar: {
    icon: ArrowUpRight,
    label: "Keluar",
    tone: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  transfer_antar: {
    icon: Repeat2,
    label: "Transfer",
    tone: "bg-blue-50 text-blue-700 ring-blue-200",
  },
};
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

function MutationFormSection({ step, title, helper, children, className = "" }) {
  return (
    <section className={`rounded-lg bg-slate-50/80 p-3 ring-1 ring-inset ring-slate-200/80 ${className}`}>
      <div className="mb-2 flex items-start gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-xs font-black text-[var(--brand-gold-strong)] ring-1 ring-inset ring-[var(--brand-gold)]/30">
          {step}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black tracking-tight text-slate-950">{title}</p>
          {helper ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{helper}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

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
  const selectedPlatformLabel = walletPlatformLabelMap[form.platform] || form.platform;
  const selectedTargetLabel = form.platform_tujuan
    ? walletPlatformLabelMap[form.platform_tujuan] || form.platform_tujuan
    : "Pilih tujuan";
  const selectedMutationLabel = walletTransactionTypeLabelMap[form.jenis] || form.jenis;
  const selectedMutationMeta = walletMutationMeta[form.jenis] || walletMutationMeta.masuk;
  const SelectedMutationIcon = selectedMutationMeta.icon;

  const updateForm = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleMutationTypeChange = (event) => {
    const jenis = event.target.value;
    setForm((prev) => ({
      ...prev,
      jenis,
      platform_tujuan: jenis === "transfer_antar" ? prev.platform_tujuan : "",
    }));
  };

  const handleQuickAmount = (amount) => {
    setForm((prev) => ({
      ...prev,
      nominal: String(Number(prev.nominal || 0) + amount),
    }));
  };

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
        <Panel className="p-5">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Mutasi saldo
          </h3>
          <p className="mt-1.5 text-sm leading-6 text-slate-600">
            Catat koreksi saldo di sini. Transaksi harian akan ikut membentuk saldo yang tampil.
          </p>
          <form
            onSubmit={handleSubmit}
            className="mt-4 space-y-3"
          >
            <MutationFormSection
              step="1"
              title="Jenis mutasi + platform"
              helper="Pilih alur dana dan platform asal."
            >
              <div className="grid gap-2 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                    Jenis
                  </span>
                  <select
                    value={form.jenis}
                    onChange={handleMutationTypeChange}
                    className="brand-select h-10 border-slate-300 bg-white font-semibold"
                  >
                    {walletTransactionTypes.map((item) => (
                      <option key={item.value} value={item.value} className="bg-white">
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                    Platform asal
                  </span>
                  <select
                    value={form.platform}
                    onChange={(event) => updateForm({ platform: event.target.value })}
                    className="brand-select h-10 border-slate-300 bg-white font-semibold"
                  >
                    {walletFormPlatforms.map((item) => (
                      <option key={item.value} value={item.value} className="bg-white">
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                {requiresTarget ? (
                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                      Platform tujuan
                    </span>
                    <select
                      value={form.platform_tujuan}
                      onChange={(event) => updateForm({ platform_tujuan: event.target.value })}
                      className="brand-select h-10 border-slate-300 bg-white font-semibold"
                    >
                      <option value="" className="bg-white">
                        Pilih tujuan transfer
                      </option>
                      {walletFormPlatforms.map((item) => (
                        <option key={item.value} value={item.value} className="bg-white">
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-white px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
                <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 ring-1 ring-inset ${selectedMutationMeta.tone}`}>
                  <SelectedMutationIcon className="h-3.5 w-3.5" />
                  {selectedMutationMeta.label}
                </span>
                <span>{selectedMutationLabel}</span>
                <span className="text-slate-300">/</span>
                <span className="text-slate-950">{selectedPlatformLabel}</span>
                {requiresTarget ? (
                  <>
                    <span className="text-slate-300">ke</span>
                    <span className="text-slate-950">{selectedTargetLabel}</span>
                  </>
                ) : null}
              </div>
            </MutationFormSection>

            <MutationFormSection step="2" title="Nominal" helper="Isi angka manual atau tambah cepat.">
              <div className="grid gap-2 md:grid-cols-[1fr_0.72fr]">
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                    Jumlah
                  </span>
                  <CurrencyInput
                    value={form.nominal}
                    onChange={(value) => updateForm({ nominal: value })}
                    className="brand-input h-10 border-slate-300 bg-white text-base font-black"
                    placeholder="Nominal"
                    required
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                    Biaya admin
                  </span>
                  <CurrencyInput
                    value={form.biaya_admin}
                    onChange={(value) => updateForm({ biaya_admin: value })}
                    className="brand-input h-10 border-slate-300 bg-white"
                    placeholder="Opsional"
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_AMOUNT_CHIPS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => handleQuickAmount(item.value)}
                    className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm transition hover:border-[var(--brand-gold)]/60 hover:bg-[var(--brand-surface-tint)] hover:text-slate-950"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </MutationFormSection>

            <MutationFormSection
              step="3"
              title="Keterangan"
              helper="Catatan pendek agar riwayat mudah dicek saat closing."
            >
              <textarea
                value={form.keterangan}
                onChange={(event) => updateForm({ keterangan: event.target.value })}
                className="brand-textarea min-h-[78px] border-slate-300 bg-white py-2.5"
                placeholder="Contoh: modal deposit, koreksi saldo, transfer antar platform"
              />
            </MutationFormSection>

            <MutationFormSection step="4" title="Aksi simpan" className="bg-white">
              <button
                type="submit"
                disabled={submitting}
                className="brand-button-success min-h-[44px] w-full shadow-[0_12px_24px_rgba(21,128,61,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Menyimpan mutasi...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Simpan Mutasi
                  </>
                )}
              </button>
            </MutationFormSection>
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

