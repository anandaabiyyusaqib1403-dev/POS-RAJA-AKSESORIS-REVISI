import { useMemo, useState } from "react";
import FeatureLoadPanel from "../components/FeatureLoadPanel";
import MetricCard from "../components/app/MetricCard";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { useReports } from "../hooks/useReports";
import { formatDateInput, formatRupiah, parseDateInput } from "../utils/format";

const denominations = [100000, 50000, 20000, 10000, 5000, 2000, 1000];

function createInitialCounts() {
  return denominations.reduce((acc, value) => {
    acc[value] = "";
    return acc;
  }, {});
}

export default function CalculatorPage() {
  const {
    coreError,
    coreLoading,
    getDashboardSummary,
    refreshTransactions,
  } = useReports();
  const [date, setDate] = useState(formatDateInput(new Date()));
  const [counts, setCounts] = useState(createInitialCounts());

  const summary = useMemo(() => {
    const selectedDate = parseDateInput(date);
    return getDashboardSummary({ startDate: selectedDate, endDate: selectedDate });
  }, [date, getDashboardSummary]);

  const systemCash = summary.cashDailySummary[0]?.sisa_saldo || 0;
  const cashTotal = useMemo(
    () =>
      denominations.reduce(
        (sum, denomination) => sum + denomination * Number(counts[denomination] || 0),
        0
      ),
    [counts]
  );
  const difference = cashTotal - systemCash;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Hitung kas"
        title="Kalkulator laci kas"
        description="Hitung uang fisik per pecahan, lalu cocokkan dengan catatan kas hari itu."
        icon="calculator"
      />

      <FeatureLoadPanel
        error={coreError}
        loading={coreLoading}
        loadingText="Sinkronisasi data kas..."
        onRetry={refreshTransactions}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <MetricCard label="Total uang fisik" value={formatRupiah(cashTotal)} />
        <MetricCard label="Kas tercatat" value={formatRupiah(systemCash)} accent="gold" />
        <MetricCard
          label="Selisih"
          value={formatRupiah(difference)}
          accent={difference === 0 ? "success" : difference > 0 ? "gold" : "danger"}
          helper={
            difference === 0
              ? "Sudah cocok dengan catatan"
              : difference > 0
                ? "Uang fisik lebih besar dari catatan"
                : "Uang fisik lebih kecil dari catatan"
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel className="p-6">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--brand-gold)]">
                Input Pecahan
              </p>
              <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
                Hitung uang fisik
              </h3>
            </div>

            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="brand-input max-w-[220px]"
            />
          </div>

          <div className="grid gap-3">
            {denominations.map((value) => (
              <div
                key={value}
                className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-[1fr_140px_1fr]"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-950">{formatRupiah(value)}</p>
                  <p className="mt-1 text-xs text-slate-500">Pecahan uang</p>
                </div>
                <input
                  type="number"
                  min="0"
                  value={counts[value]}
                  onChange={(event) =>
                    setCounts((prev) => ({ ...prev, [value]: event.target.value }))
                  }
                  className="brand-input text-center"
                  placeholder="0"
                />
                <div className="text-left md:text-right">
                  <p className="text-sm font-semibold text-slate-950">
                    {formatRupiah(value * Number(counts[value] || 0))}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Subtotal pecahan</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel variant="strong" className="p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--brand-gold)]">
            Rekonsiliasi
          </p>
          <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
            Cek kas harian
          </h3>

          <div className="mt-6 space-y-4">
            {[
              { label: "Total uang fisik", value: formatRupiah(cashTotal) },
              { label: "Kas tercatat", value: formatRupiah(systemCash) },
              {
                label: "Selisih",
                value: formatRupiah(difference),
                tone:
                  difference === 0
                    ? "text-[var(--brand-gold)]"
                    : difference > 0
                      ? "text-[var(--brand-gold)]"
                      : "text-slate-600",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <span className="text-sm text-slate-600">{item.label}</span>
                <span className={`text-lg font-bold text-slate-950 ${item.tone || ""}`}>{item.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-[var(--brand-gold)]/16 bg-[var(--brand-gold)]/8 px-4 py-4 text-sm leading-7 text-slate-700">
            Kalau ada selisih, cek lagi pengeluaran operasional, setoran tunai, atau transaksi
            yang belum dicatat pada tanggal tersebut.
          </div>
        </Panel>
      </div>
    </div>
  );
}

