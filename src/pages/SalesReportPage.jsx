import { useMemo, useState } from "react";
import MetricCard from "../components/app/MetricCard";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { showNotification } from "../contexts/NotificationContext";
import { useData } from "../contexts/DataContext";
import { exportSalesReport } from "../utils/salesReportExport";
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
  if (period === "30") {
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 29);
    return { startDate, endDate: today };
  }

  return {
    startDate: parseDateInput(customRange.startDate),
    endDate: parseDateInput(customRange.endDate),
  };
}

function formatRangeLabel(range) {
  if (!range.startDate && !range.endDate) {
    return "Semua periode";
  }

  const startLabel = range.startDate
    ? formatDateTime(range.startDate, { dateStyle: "medium" })
    : "-";
  const endLabel = range.endDate ? formatDateTime(range.endDate, { dateStyle: "medium" }) : "-";

  return startLabel === endLabel ? startLabel : `${startLabel} s/d ${endLabel}`;
}

export default function SalesReportPage() {
  const { getDashboardSummary, products } = useData();
  const [period, setPeriod] = useState("today");
  const [customRange, setCustomRange] = useState({
    startDate: formatDateInput(new Date()),
    endDate: formatDateInput(new Date()),
  });

  const range = useMemo(() => getRange(period, customRange), [customRange, period]);
  const summary = useMemo(() => getDashboardSummary(range), [getDashboardSummary, range]);

  const exportSales = () => {
    const exportedAt = new Date();
    const periodLabel = formatRangeLabel(range);
    const totalSalesTransactions =
      summary.accessoryTransactions.length +
      summary.digitalTransactions.length +
      summary.logisticsTransactions.length;

    if (!totalSalesTransactions) {
      showNotification("warning", "Belum ada penjualan aksesoris, layanan, atau logistik pada periode ini.");
      return;
    }

    try {
      const fileName = exportSalesReport({
        products,
        accessoryTransactions: summary.accessoryTransactions,
        digitalTransactions: summary.digitalTransactions,
        logisticsTransactions: summary.logisticsTransactions,
        periodLabel,
        exportedAt,
        fileName: `laporan-penjualan-raja-aksesoris-${formatDateInput(exportedAt)}.xlsx`,
      });

      showNotification("success", `Laporan penjualan berhasil diekspor ke file ${fileName}.`);
    } catch (error) {
      showNotification("error", error.message || "Gagal mengekspor laporan penjualan.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Laporan penjualan"
        description="Lihat channel penjualan terbaik, produk terlaris, dan performa transaksi untuk periode yang dipilih."
        icon="trend"
        actions={
          <>
            {["today", "7", "30", "custom"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPeriod(item)}
                className={item === period ? "brand-button-primary" : "brand-button-secondary"}
              >
                {item === "today"
                  ? "Hari Ini"
                  : item === "7"
                    ? "7 Hari"
                    : item === "30"
                      ? "30 Hari"
                      : "Custom"}
              </button>
            ))}
            <button type="button" onClick={exportSales} className="brand-button-success">
              Export Excel
            </button>
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

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard label="Omzet penjualan" value={formatRupiah(summary.omzet)} />
        <MetricCard label="Jumlah transaksi" value={String(summary.totalTransaksi)} />
        <MetricCard label="Produk terjual" value={`${summary.produkTerjual} pcs`} />
        <MetricCard label="Profit kotor" value={formatRupiah(summary.keuntunganKotor)} accent="success" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Breakdown penjualan
          </h3>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {summary.breakdown.map((item) => (
              <div
                key={item.key}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
                  {item.label}
                </p>
                <p className="mt-3 text-2xl font-bold text-slate-950">{formatRupiah(item.omzet)}</p>
                <p className="mt-2 text-sm text-slate-600">{item.transaksi} transaksi</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-[var(--brand-gold)]"
                    style={{ width: `${Math.max(item.kontribusi, 4)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">{item.kontribusi}% kontribusi omzet</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Top produk
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            Produk aksesoris dengan jumlah penjualan tertinggi pada periode aktif.
          </p>

          <div className="mt-5 space-y-3">
            {summary.topProducts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                Belum ada produk terjual pada periode ini.
              </div>
            ) : (
              summary.topProducts.map((item, index) => (
                <div
                  key={item.nama}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-gold)]/14 font-bold text-[var(--brand-gold)]">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-950">{item.nama}</p>
                      <p className="text-sm text-slate-500">Produk terlaris</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-slate-600">{item.qty} pcs</span>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <Panel variant="strong" className="p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--brand-gold)]">
          Insight
        </p>
        <p className="mt-3 text-sm leading-7 text-slate-700">
          Gunakan laporan ini untuk melihat channel mana yang paling kuat, produk mana yang cepat
          berputar, dan kategori mana yang perlu diisi ulang lebih cepat.
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Digenerate {formatDateTime(new Date(), { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </Panel>
    </div>
  );
}
