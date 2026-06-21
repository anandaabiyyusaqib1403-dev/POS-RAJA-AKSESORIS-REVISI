import { useMemo, useRef, useState } from "react";
import FeatureLoadPanel from "../components/FeatureLoadPanel";
import CurrencyInput from "../components/CurrencyInput";
import MetricCard from "../components/app/MetricCard";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import PinConfirmationModal from "../components/PinConfirmationModal";
import { showNotification } from "../contexts/NotificationContext";
import {
  isPinActionCancelledError,
  usePinConfirmation,
} from "../hooks/usePinConfirmation";
import { useReports } from "../hooks/useReports";
import { useTransactions } from "../hooks/useTransactions";
import {
  cashCategories,
  cashCategoryLabelMap,
  cashTypes,
} from "../data/businessOptions";
import { getMoneySaveFailureMessage } from "../core/money/moneyRetry";
import {
  formatDateInput,
  formatDateTime,
  formatDisplayDate,
  formatRupiah,
  parseDateInput,
} from "../utils/format";

const quickAmountOptions = [
  { label: "+50rb", value: 50000 },
  { label: "+100rb", value: 100000 },
  { label: "+500rb", value: 500000 },
  { label: "+1jt", value: 1000000 },
];

const emptyStateExamples = ["biaya parkir", "beli galon", "uang makan", "biaya supplier"];

function createInitialForm() {
  return {
    jenis: "pengeluaran",
    kategori: "operasional",
    nominal: "",
    keterangan: "",
    tanggal: formatDateInput(new Date()),
  };
}

function createEmptyDailySummary(date) {
  return {
    tanggal: date,
    saldo_awal: 0,
    total_pemasukan: 0,
    total_pengeluaran: 0,
    sisa_saldo: 0,
  };
}

function getRelativeDateInput(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return formatDateInput(date);
}

function formatSignedRupiah(value) {
  const numeric = Number(value || 0);
  if (numeric > 0) return `+ ${formatRupiah(numeric)}`;
  if (numeric < 0) return `- ${formatRupiah(Math.abs(numeric))}`;
  return formatRupiah(0);
}

function formatTimelineDate(value) {
  if (!value) return "Tanpa tanggal";
  const parsed = parseDateInput(value);
  if (parsed) return formatDisplayDate(parsed);
  return formatDateTime(value, { dateStyle: "medium" });
}

function isIncomeType(type) {
  return String(type || "").toLowerCase() === "pemasukan";
}

function getEntrySortValue(entry) {
  const createdAt = new Date(entry.created_at || "").getTime();
  if (Number.isFinite(createdAt)) return createdAt;
  const parsedDate = parseDateInput(entry.tanggal)?.getTime();
  return Number.isFinite(parsedDate) ? parsedDate : 0;
}

function buildTimelineGroups(rows) {
  const groups = [];
  const groupMap = new Map();
  const sortedRows = [...rows].sort((a, b) => getEntrySortValue(b) - getEntrySortValue(a));

  sortedRows.forEach((entry) => {
    const groupDate = entry.tanggal || formatDateInput(entry.created_at) || "tanpa-tanggal";
    if (!groupMap.has(groupDate)) {
      const group = {
        date: groupDate,
        label: formatTimelineDate(groupDate),
        rows: [],
      };
      groupMap.set(groupDate, group);
      groups.push(group);
    }
    groupMap.get(groupDate).rows.push(entry);
  });

  return groups;
}

export default function CashPage() {
  const {
    cashEntries,
    coreError,
    coreLoading,
    createCashEntry,
    updateCashEntry,
    deleteCashEntry,
    refreshTransactions,
  } = useTransactions();
  const { getDashboardSummary } = useReports();
  const {
    isPinModalOpen,
    closePinModal,
    executeSensitiveAction,
    executeConfirmedAction,
    actionDescription,
  } = usePinConfirmation();
  const [summaryDate, setSummaryDate] = useState(formatDateInput(new Date()));
  const [filterDate, setFilterDate] = useState("");
  const [form, setForm] = useState(createInitialForm());
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const submissionRef = useRef(false);
  const isEditing = Boolean(editingId);

  const dailySummary = useMemo(() => {
    const selectedDate = parseDateInput(summaryDate);
    const summary = getDashboardSummary({ startDate: selectedDate, endDate: selectedDate });
    return summary.cashDailySummary[0] || createEmptyDailySummary(summaryDate);
  }, [getDashboardSummary, summaryDate]);

  const historyRows = useMemo(
    () => cashEntries.filter((entry) => (filterDate ? entry.tanggal === filterDate : true)),
    [cashEntries, filterDate]
  );

  const timelineGroups = useMemo(() => buildTimelineGroups(historyRows), [historyRows]);

  const dailyDelta =
    Number(dailySummary.total_pemasukan || 0) - Number(dailySummary.total_pengeluaran || 0);
  const balanceTone =
    Number(dailySummary.sisa_saldo || 0) < 0
      ? "danger"
      : dailyDelta < 0
        ? "warning"
        : "success";
  const balanceStatus = {
    success: "Kas aman",
    warning: "Kas terpakai",
    danger: "Saldo minus",
  }[balanceTone];
  const balanceStatusClass = {
    success: "brand-badge-success",
    warning: "brand-badge-warning",
    danger: "brand-badge-danger",
  }[balanceTone];
  const balanceAccentClass = {
    success: "from-emerald-500 via-emerald-400 to-[var(--brand-gold)]",
    warning: "from-amber-500 via-[var(--brand-gold)] to-orange-300",
    danger: "from-rose-600 via-rose-400 to-amber-300",
  }[balanceTone];
  const todayDate = formatDateInput(new Date());
  const yesterdayDate = getRelativeDateInput(-1);
  const activeFilterLabel = filterDate
    ? `Filter aktif: ${formatTimelineDate(filterDate)}`
    : "Riwayat: semua tanggal";

  const resetForm = () => {
    setEditingId(null);
    setForm(createInitialForm());
  };

  const handleEdit = (entry) => {
    setEditingId(entry.id);
    setForm({
      jenis: entry.jenis,
      kategori: entry.kategori,
      nominal: String(entry.nominal),
      keterangan: entry.keterangan || "",
      tanggal: entry.tanggal,
    });
  };

  const handleDelete = async (entryId) => {
    try {
      await executeSensitiveAction(
        async () => {
          await deleteCashEntry(entryId);
          showNotification("success", "Catatan kas berhasil dihapus");
        },
        "CASH.DELETE_ENTRY"
      );
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Gagal menghapus catatan kas.");
    }
  };

  const handleQuickAmount = (amount) => {
    setForm((prev) => ({
      ...prev,
      nominal: String(Number(prev.nominal || 0) + amount),
    }));
  };

  const applyDateShortcut = (date) => {
    setSummaryDate(date);
    setFilterDate(date);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submissionRef.current) return;
    submissionRef.current = true;
    setSubmitting(true);

    try {
      const payload = {
        jenis: form.jenis,
        kategori: form.kategori,
        nominal: Number(form.nominal),
        keterangan: form.keterangan.trim(),
        tanggal: form.tanggal,
      };

      if (isEditing) {
        await executeSensitiveAction(
          async () => {
            await updateCashEntry(editingId, payload);
          },
          "CASH.EDIT_ENTRY"
        );
      } else {
        await createCashEntry(payload);
      }

      showNotification(
        "success",
        isEditing ? "Catatan operasional diperbarui." : "Catatan operasional tersimpan."
      );
      resetForm();
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification(
        "error",
        getMoneySaveFailureMessage(error, "Gagal menyimpan operasional.")
      );
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kas operasional"
        title="Catat operasional"
        description="Masuk dan keluar kas harian dicatat dari satu tempat supaya kontrol saldo toko tetap rapi."
        icon="receipt"
      />

      <FeatureLoadPanel
        error={coreError}
        loading={coreLoading}
        loadingText="Sinkronisasi operasional kas..."
        onRetry={refreshTransactions}
      />

      <Panel className="p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="brand-kicker">Kontrol tanggal operasional</p>
            <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-slate-950">
              Tanggal laporan dan riwayat kas
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Ringkasan memakai tanggal laporan, riwayat bisa difilter saat cek kas.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] xl:min-w-[720px]">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="brand-kicker">Tanggal ringkasan</span>
                <input
                  type="date"
                  value={summaryDate}
                  onChange={(event) => setSummaryDate(event.target.value)}
                  className="brand-input mt-2"
                />
              </label>
              <label className="block">
                <span className="brand-kicker">Filter timeline</span>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(event) => setFilterDate(event.target.value)}
                  className="brand-input mt-2"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={() => applyDateShortcut(todayDate)}
                className="brand-button-secondary min-h-[44px] px-3 py-2 text-xs"
              >
                Hari ini
              </button>
              <button
                type="button"
                onClick={() => applyDateShortcut(yesterdayDate)}
                className="brand-button-secondary min-h-[44px] px-3 py-2 text-xs"
              >
                Kemarin
              </button>
              <button
                type="button"
                onClick={() => setFilterDate("")}
                className="brand-button-secondary min-h-[44px] px-3 py-2 text-xs"
              >
                Semua
              </button>
              <span className={filterDate ? "brand-badge-info" : "brand-badge-neutral"}>
                {activeFilterLabel}
              </span>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-5">
        <Panel variant="strong" className="relative overflow-hidden p-6 xl:col-span-2">
          <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${balanceAccentClass}`} />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="brand-kicker">Sisa saldo</p>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                Fokus utama kas operasional
              </p>
            </div>
            <span className={balanceStatusClass}>{balanceStatus}</span>
          </div>

          <p className="mt-6 font-display text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
            {formatRupiah(dailySummary.sisa_saldo)}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span
              className={`brand-trend-chip ${
                dailyDelta >= 0 ? "brand-trend-up" : "brand-trend-down"
              }`}
            >
              {formatSignedRupiah(dailyDelta)} hari ini
            </span>
            <span className="text-sm font-semibold text-slate-500">
              Saldo akhir {formatTimelineDate(summaryDate)}
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold text-slate-500">
                Masuk hari ini
              </p>
              <p className="mt-2 text-lg font-black text-emerald-700">
                {formatRupiah(dailySummary.total_pemasukan)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold text-slate-500">
                Keluar hari ini
              </p>
              <p className="mt-2 text-lg font-black text-rose-700">
                {formatRupiah(dailySummary.total_pengeluaran)}
              </p>
            </div>
          </div>
        </Panel>

        <MetricCard
          label="Saldo awal"
          value={formatRupiah(dailySummary.saldo_awal)}
          helper={`Awal ${formatTimelineDate(summaryDate)}`}
          trend={{ label: "Awal", tone: "neutral" }}
        />
        <MetricCard
          label="Pemasukan"
          value={formatRupiah(dailySummary.total_pemasukan)}
          accent="success"
          helper="Kas masuk hari ini"
          trend={{ label: "+Masuk", tone: "up" }}
        />
        <MetricCard
          label="Pengeluaran"
          value={formatRupiah(dailySummary.total_pengeluaran)}
          accent="danger"
          helper="Kas keluar hari ini"
          trend={{ label: "-Keluar", tone: "down" }}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel className="p-6">
          <div className="mb-6">
            <p className="brand-kicker">Input kas</p>
            <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
              {isEditing ? "Edit entri operasional" : "Tambah entri operasional"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Pilih jenis transaksi, isi nominal, lalu tambahkan catatan singkat.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <section className="brand-form-section">
              <div className="mb-4">
                <p className="text-sm font-black text-slate-950">1. Jenis transaksi</p>
                <p className="mt-1 text-sm text-slate-500">
                  Tentukan apakah uang masuk atau keluar dari kas operasional.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {cashTypes.map((item) => {
                  const selected = form.jenis === item.value;
                  const income = isIncomeType(item.value);
                  return (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setForm((prev) => ({ ...prev, jenis: item.value }))}
                      className={`rounded-lg border px-4 py-4 text-left transition ${
                        selected
                          ? income
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm"
                            : "border-rose-300 bg-rose-50 text-rose-800 shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:border-[var(--brand-gold)] hover:bg-amber-50"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-black">{item.label}</span>
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-full text-base font-black ${
                            income ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {income ? "+" : "-"}
                        </span>
                      </span>
                      <span className="mt-2 block text-xs font-semibold opacity-80">
                        {income ? "Tambah saldo kas" : "Catat biaya keluar"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <label className="mt-4 block">
                <span className="text-sm font-bold text-slate-700">Kategori</span>
                <select
                  value={form.kategori}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, kategori: event.target.value }))
                  }
                  className="brand-select mt-2"
                >
                  {cashCategories.map((item) => (
                    <option key={item.value} value={item.value} className="bg-slate-50 text-slate-950">
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="brand-form-section">
              <div className="mb-4">
                <p className="text-sm font-black text-slate-950">2. Nominal & tanggal</p>
                <p className="mt-1 text-sm text-slate-500">
                  Masukkan nominal kas dan tanggal catat.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                <label className="block">
                  <span className="text-sm font-bold text-slate-700">Nominal</span>
                  <CurrencyInput
                    value={form.nominal}
                    onChange={(value) => setForm((prev) => ({ ...prev, nominal: value }))}
                    className="brand-input brand-input-lg mt-2 text-lg font-black tabular-nums"
                    placeholder="Rp 0"
                    currency
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-slate-700">Tanggal kas</span>
                  <input
                    type="date"
                    value={form.tanggal}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, tanggal: event.target.value }))
                    }
                    className="brand-input brand-input-lg mt-2"
                    required
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {quickAmountOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleQuickAmount(option.value)}
                    className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-800 transition hover:-translate-y-0.5 hover:border-[var(--brand-gold)] hover:bg-white hover:shadow-sm"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="brand-form-section">
              <div className="mb-4">
                <p className="text-sm font-black text-slate-950">3. Keterangan operasional</p>
                <p className="mt-1 text-sm text-slate-500">
                  Tulis konteks singkat agar audit harian mudah dipahami saat closing.
                </p>
              </div>

              <textarea
                value={form.keterangan}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, keterangan: event.target.value }))
                }
                className="brand-textarea"
                placeholder="Contoh: beli galon, biaya parkir, uang makan, bayar supplier"
              />
            </section>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.3fr_0.7fr]">
              <button
                type="submit"
                disabled={submitting}
                className="brand-button-success min-h-[56px] text-base font-black shadow-[0_14px_30px_rgba(21,128,61,0.22)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Menyimpan...
                  </>
                ) : (
                  <>{isEditing ? "Update Entri" : "Simpan Entri"}</>
                )}
              </button>
              <button type="button" onClick={resetForm} className="brand-button-secondary">
                  Kosongkan
              </button>
            </div>
          </form>

          <div className="brand-subtle-block mt-6 p-5 text-sm text-slate-600">
            <p className="font-semibold text-slate-950">Ritme kerja kas</p>
            <p className="mt-2 leading-6">
              Simpan setiap biaya kecil saat terjadi. Nominal, tanggal, dan keterangan yang rapi
              membuat saldo akhir lebih mudah dipercaya saat tutup shift.
            </p>
          </div>
        </Panel>

        <Panel variant="strong" className="p-6">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="brand-kicker">Riwayat kas</p>
              <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
                Riwayat operasional
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {historyRows.length} entri tampil pada filter ini.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={filterDate ? "brand-badge-info" : "brand-badge-neutral"}>
                {activeFilterLabel}
              </span>
              {filterDate ? (
                <button
                  type="button"
                  onClick={() => setFilterDate("")}
                  className="brand-button-secondary min-h-[40px] px-3 py-2 text-xs"
                >
                  Reset filter
                </button>
              ) : null}
            </div>
          </div>

          {historyRows.length === 0 ? (
            <div className="brand-empty-state px-6 py-12">
              <p className="text-base font-semibold text-slate-950">
                Belum ada catatan operasional hari ini.
              </p>
              <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
                Mulai dari pengeluaran kecil atau tambahan saldo. Timeline akan membantu closing
                kas terasa lebih natural.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {emptyStateExamples.map((example) => (
                  <span key={example} className="brand-badge-neutral">
                    {example}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="brand-scrollbar max-h-[760px] space-y-6 overflow-y-auto pr-1">
              {timelineGroups.map((group) => (
                <div key={group.date}>
                  <div className="sticky top-0 z-10 mb-3 flex items-center gap-3 bg-white/95 py-2 backdrop-blur">
                    <span className="h-px flex-1 bg-slate-200" />
                    <span className="brand-badge-neutral">{group.label}</span>
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>

                  <div className="space-y-3">
                    {group.rows.map((entry) => {
                      const income = isIncomeType(entry.jenis);
                      const amountClass = income ? "text-emerald-700" : "text-rose-700";
                      const iconClass = income
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                        : "bg-rose-50 text-rose-700 ring-rose-100";
                      const createdLabel = entry.created_at
                        ? formatDateTime(entry.created_at, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : formatTimelineDate(entry.tanggal);

                      return (
                        <article
                          key={entry.id}
                          className="group rounded-lg border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-amber-200 hover:bg-amber-50/30 hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)]"
                        >
                          <div className="grid gap-4 md:grid-cols-[72px_minmax(0,1fr)_auto] md:items-start">
                            <div className="font-mono text-sm font-black tabular-nums text-slate-500">
                              {entry.created_at
                                ? formatDateTime(entry.created_at, { timeStyle: "short" })
                                : "--:--"}
                            </div>

                            <div className="flex min-w-0 gap-3">
                              <span
                                className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-black ring-4 ${iconClass}`}
                              >
                                {income ? "+" : "-"}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-black text-slate-950">
                                    {income ? "Pemasukan" : "Pengeluaran"}
                                  </p>
                                  <span className={income ? "brand-badge-success" : "brand-badge-danger"}>
                                    {cashCategoryLabelMap[entry.kategori] || entry.kategori}
                                  </span>
                                </div>
                                <p className="mt-2 break-words text-sm leading-6 text-slate-600">
                                  {entry.keterangan || "Tanpa keterangan operasional"}
                                </p>
                                <p className="mt-2 text-xs font-semibold text-slate-400">
                                  Dicatat {createdLabel}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-col gap-3 md:items-end">
                              <p className={`text-lg font-black tabular-nums ${amountClass}`}>
                                {income ? "+" : "-"} {formatRupiah(entry.nominal)}
                              </p>
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleEdit(entry)}
                                  className="brand-button-secondary min-h-[40px] px-3 py-2 text-xs"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(entry.id)}
                                  className="brand-button-secondary min-h-[40px] px-3 py-2 text-xs"
                                >
                                  Hapus
                                </button>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

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
    </div>
  );
}
