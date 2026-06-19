import { useMemo, useState } from "react";
import FeatureLoadPanel from "../components/FeatureLoadPanel";
import PaginationBar from "../components/PaginationBar";
import MetricCard from "../components/app/MetricCard";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { showNotification } from "../contexts/NotificationContext";
import { useFirstPaintReady } from "../hooks/useFirstPaintReady";
import { useOwnerSalesReport } from "../hooks/useOwnerSalesReport";
import { useProducts } from "../hooks/useProducts";
import { useShift } from "../hooks/useShift";
import { useTransactions } from "../hooks/useTransactions";
import {
  buildGlobalSalesReportData,
  exportSalesReport,
} from "../utils/salesReportExport";
import {
  formatDateInput,
  formatDateTime,
  formatRupiah,
} from "../utils/format";
import {
  createEmptySalesReport,
  formatPercent,
  formatRangeLabel,
  getMaxValue,
  getProfitTone,
  getSalesReportRange,
} from "../features/reports/calculators/salesReport";

const periodOptions = [
  { key: "today", label: "Hari Ini" },
  { key: "7", label: "7 Hari" },
  { key: "30", label: "30 Hari" },
  { key: "custom", label: "Custom" },
  { key: "all", label: "Semua" },
];

function SummaryTable({ rows, labelHeader = "Nama", emptyText }) {
  return (
    <div className="brand-scrollbar overflow-x-auto">
      <table className="brand-table">
        <thead>
          <tr>
            <th>{labelHeader}</th>
            <th className="text-right">Transaksi</th>
            <th className="text-right">Omzet</th>
            <th className="text-right">Modal</th>
            <th className="text-right">Laba</th>
            <th className="text-right">Margin</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan="6" className="px-6 py-10 text-center text-slate-500">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.label}>
                <td className="font-semibold text-slate-950">{row.label}</td>
                <td className="text-right text-slate-600">{row.total_transactions}</td>
                <td className="text-right text-slate-600">{formatRupiah(row.total_revenue)}</td>
                <td className="text-right text-slate-600">{formatRupiah(row.total_cost)}</td>
                <td className={`text-right font-semibold ${getProfitTone(row.total_profit)}`}>
                  {formatRupiah(row.total_profit)}
                </td>
                <td className="text-right text-slate-600">{formatPercent(row.margin)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ProviderBreakdown({ rows }) {
  const maxRevenue = getMaxValue(rows, "total_revenue");

  return (
    <div className="brand-scrollbar overflow-x-auto">
      <table className="brand-table">
        <thead>
          <tr>
            <th>Kategori</th>
            <th>Provider</th>
            <th className="text-right">Total Transaksi</th>
            <th className="text-right">Total Omzet</th>
            <th className="text-right">Total Modal</th>
            <th className="text-right">Total laba</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan="6" className="px-6 py-10 text-center text-slate-500">
                Belum ada layanan provider pada periode ini.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.category}-${row.provider}`}>
                <td className="font-semibold text-slate-950">{row.category}</td>
                <td>
                  <p className="font-semibold text-slate-950">{row.provider}</p>
                  <div className="mt-2 h-2 min-w-[140px] overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[var(--brand-gold)]"
                      style={{ width: `${Math.max(5, (row.total_revenue / maxRevenue) * 100)}%` }}
                    />
                  </div>
                </td>
                <td className="text-right text-slate-600">{row.total_transactions}</td>
                <td className="text-right text-slate-600">{formatRupiah(row.total_revenue)}</td>
                <td className="text-right text-slate-600">{formatRupiah(row.total_cost)}</td>
                <td className={`text-right font-semibold ${getProfitTone(row.total_profit)}`}>
                  {formatRupiah(row.total_profit)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function PaymentSummary({ rows }) {
  const maxRevenue = getMaxValue(rows, "total_revenue");

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          Belum ada pembayaran pelanggan pada periode ini.
        </div>
      ) : (
        rows.map((row) => (
          <div key={row.payment_customer} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-950">{row.payment_customer}</p>
                <p className="mt-1 text-sm text-slate-500">{row.total_transactions} transaksi</p>
              </div>
              <p className="font-bold text-slate-950">{formatRupiah(row.total_revenue)}</p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-[var(--brand-gold)]"
                style={{ width: `${Math.max(5, (row.total_revenue / maxRevenue) * 100)}%` }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function TopProducts({ rows }) {
  return (
    <div className="brand-scrollbar overflow-x-auto">
      <table className="brand-table">
        <thead>
          <tr>
            <th>Urutan</th>
            <th>Produk</th>
            <th className="text-right">Qty terjual</th>
            <th className="text-right">Omzet</th>
            <th className="text-right">Laba</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan="5" className="px-6 py-10 text-center text-slate-500">
                Belum ada produk atau layanan terjual pada periode ini.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.rank}-${row.product_name}`}>
                <td>
                  <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-[var(--brand-gold)]/14 px-2 text-xs font-bold text-[var(--brand-gold)]">
                    {row.rank}
                  </span>
                </td>
                <td>
                  <p className="font-semibold text-slate-950">{row.product_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{row.category}</p>
                </td>
                <td className="text-right text-slate-600">{row.qty}</td>
                <td className="text-right text-slate-600">{formatRupiah(row.revenue)}</td>
                <td className={`text-right font-semibold ${getProfitTone(row.profit)}`}>
                  {formatRupiah(row.profit)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CashierPerformance({ rows }) {
  return (
    <div className="brand-scrollbar overflow-x-auto">
      <table className="brand-table">
        <thead>
          <tr>
            <th>Kasir</th>
            <th className="text-right">Total Transaksi</th>
            <th className="text-right">Total Omzet</th>
            <th className="text-right">Total laba</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan="4" className="px-6 py-10 text-center text-slate-500">
                Belum ada performa kasir pada periode ini.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.cashier || row.label}>
                <td className="font-semibold text-slate-950">{row.cashier || row.label}</td>
                <td className="text-right text-slate-600">{row.total_transactions}</td>
                <td className="text-right text-slate-600">{formatRupiah(row.total_revenue)}</td>
                <td className={`text-right font-semibold ${getProfitTone(row.total_profit)}`}>
                  {formatRupiah(row.total_profit)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function DetailTable({ rows }) {
  return (
    <div className="brand-scrollbar max-h-[720px] overflow-auto">
      <table className="brand-table">
        <thead className="sticky top-0 bg-white">
          <tr>
            <th>No Transaksi</th>
            <th>Tanggal</th>
            <th>Kasir</th>
            <th>Tipe</th>
            <th>Kategori</th>
            <th>Provider</th>
            <th>Nama Produk / Layanan</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Harga Jual</th>
            <th className="text-right">Modal</th>
            <th className="text-right">Laba</th>
            <th>Metode Bayar Customer</th>
            <th>Nomor Tujuan</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan="13" className="px-6 py-14 text-center text-slate-500">
                Tidak ada transaksi yang cocok dengan filter aktif.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="font-semibold text-slate-950">{row.no_transaksi}</td>
                <td className="text-slate-600">
                  {formatDateTime(row.date, { dateStyle: "medium", timeStyle: "short" })}
                </td>
                <td className="text-slate-600">{row.cashier}</td>
                <td>
                  <span className="rounded-full bg-[var(--brand-gold)]/12 px-3 py-1 text-xs font-semibold text-[var(--brand-gold)]">
                    {row.type_label}
                  </span>
                </td>
                <td className="text-slate-600">{row.category}</td>
                <td className="text-slate-600">{row.provider || "-"}</td>
                <td className="min-w-[220px] font-semibold text-slate-950">{row.product_name}</td>
                <td className="text-right text-slate-600">{row.qty}</td>
                <td className="text-right text-slate-600">{formatRupiah(row.selling_price)}</td>
                <td className="text-right text-slate-600">{formatRupiah(row.cost)}</td>
                <td className={`text-right font-semibold ${getProfitTone(row.profit)}`}>
                  {formatRupiah(row.profit)}
                </td>
                <td className="text-slate-600">{row.payment_customer}</td>
                <td className="text-slate-600">{row.target_number || "-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function SalesReportPage() {
  const {
    coreError,
    coreLoading,
    accessoryTransactions,
    digitalTransactions,
    logisticsTransactions,
    refreshTransactions,
  } = useTransactions();
  const { products, allProducts } = useProducts();
  const { staffUsers } = useShift();
  const [period, setPeriod] = useState("today");
  const [customRange, setCustomRange] = useState({
    startDate: formatDateInput(new Date()),
    endDate: formatDateInput(new Date()),
  });
  const [detailSearch, setDetailSearch] = useState("");
  const [detailType, setDetailType] = useState("semua");
  const firstPaintReady = useFirstPaintReady();

  const range = useMemo(() => getSalesReportRange(period, customRange), [customRange, period]);
  const periodLabel = useMemo(() => formatRangeLabel(range), [range]);
  const serverReport = useOwnerSalesReport({
    range,
    search: detailSearch,
    type: detailType,
    pageSize: 25,
  });
  const useServerReport = serverReport.available;
  const reportProducts = allProducts?.length ? allProducts : products;
  const fallbackReport = useMemo(
    () => {
      if (useServerReport) return null;
      if (!firstPaintReady) return createEmptySalesReport();

      return buildGlobalSalesReportData({
        products: reportProducts,
        staffUsers,
        accessoryTransactions,
        digitalTransactions,
        logisticsTransactions,
        startDate: range.startDate,
        endDate: range.endDate,
        topLimit: 10,
      });
    },
    [
      accessoryTransactions,
      digitalTransactions,
      firstPaintReady,
      logisticsTransactions,
      range.endDate,
      range.startDate,
      reportProducts,
      staffUsers,
      useServerReport,
    ]
  );
  const fallbackDetailRows = useMemo(() => {
    if (!fallbackReport) return [];

    const keyword = detailSearch.trim().toLowerCase();

    return fallbackReport.detailRows.filter((row) => {
      const matchesType = detailType === "semua" ? true : row.type === detailType;
      const matchesSearch = keyword
        ? [
            row.no_transaksi,
            row.cashier,
            row.type_label,
            row.category,
            row.provider,
            row.product_name,
            row.payment_customer,
            row.target_number,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(keyword)
        : true;

      return matchesType && matchesSearch;
    });
  }, [detailSearch, detailType, fallbackReport]);
  const report = useServerReport ? serverReport.report : fallbackReport;
  const detailRows = useServerReport ? serverReport.report.detailRows : fallbackDetailRows;
  const detailTotal = useServerReport ? serverReport.detailPage.count : fallbackReport?.detailRows.length || 0;
  const detailFrom = useServerReport ? serverReport.detailPage.from : detailRows.length ? 1 : 0;
  const detailTo = useServerReport ? serverReport.detailPage.to : detailRows.length;
  const bestCategory = report.categorySummary[0];
  const bestProvider = report.providerSummary[0];
  const lowMarginRows = report.categorySummary
    .filter((row) => Number(row.total_revenue || 0) > 0 && Number(row.margin || 0) < 0.1)
    .slice(0, 3);
  const lossProviders = report.providerSummary
    .filter((row) => Number(row.total_profit || 0) < 0)
    .slice(0, 3);
  const cashierLeader = report.cashierSummary[0];

  const exportSales = async () => {
    if (!report.detailRows.length) {
      showNotification("warning", "Belum ada transaksi penjualan pada periode ini.");
      return;
    }

    try {
      const exportedAt = new Date();
      const fileName = await exportSalesReport({
        reportData: report,
        periodLabel,
        exportedAt,
        fileName: `Laporan_Penjualan_Raja_Aksesoris_${formatDateInput(exportedAt)}.xlsx`,
      });

      showNotification("success", `Laporan Penjualan berhasil diekspor ke file ${fileName}.`);
    } catch (error) {
      showNotification("error", error.message || "Gagal mengekspor Laporan Penjualan.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Laporan"
        title="Laporan Penjualan"
        description="Rekap penjualan produk, layanan digital, transfer, e-wallet, dan jasa."
        icon="trend"
        actions={
          <>
            {periodOptions.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setPeriod(item.key)}
                className={item.key === period ? "brand-button-primary" : "brand-button-secondary"}
              >
                {item.label}
              </button>
            ))}
            <button type="button" onClick={exportSales} className="brand-button-success">
              Export Excel
            </button>
          </>
        }
      />

      <FeatureLoadPanel
        error={coreError || serverReport.error}
        loading={coreLoading || serverReport.loading}
        loadingText="Sinkronisasi laporan penjualan..."
        onRetry={serverReport.error ? serverReport.refresh : refreshTransactions}
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
        <MetricCard
          label="Total Transaksi"
          value={String(report.globalSummary.total_transactions)}
          helper={periodLabel}
        />
        <MetricCard
          label="Total Omzet"
          value={formatRupiah(report.globalSummary.total_revenue)}
          helper="Pemasukan dari harga jual transaksi."
        />
        <MetricCard
          label="Total Modal"
          value={formatRupiah(report.globalSummary.total_cost)}
          helper="Pengeluaran dari modal transaksi."
        />
        <MetricCard
          label="Total laba"
          value={formatRupiah(report.globalSummary.total_profit)}
          helper={`Margin ${formatPercent(report.globalSummary.margin)}`}
          accent="success"
        />
      </div>

      <Panel variant="strong" className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="brand-kicker">Catatan pemilik</p>
            <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
              Angka yang perlu dicek
            </h3>
          </div>
          <span className={lowMarginRows.length || lossProviders.length ? "brand-badge-danger" : "brand-badge-success"}>
            {lowMarginRows.length + lossProviders.length || "Tidak ada"} perlu dicek
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="brand-control-alert brand-control-alert-info">
            <p className="text-xs font-bold text-slate-500">
              Kasir terkuat
            </p>
            <p className="mt-2 text-lg font-black text-slate-950">
              {cashierLeader?.label || "-"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {cashierLeader ? `${cashierLeader.total_transactions} transaksi` : "Belum ada data"}
            </p>
          </div>
          <div className={`brand-control-alert ${lowMarginRows.length ? "brand-control-alert-warning" : "brand-control-alert-info"}`}>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              Margin rendah
            </p>
            <p className="mt-2 text-lg font-black text-slate-950">
              {lowMarginRows[0]?.label || "Aman"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {lowMarginRows.length
                ? `${lowMarginRows.length} kategori margin di bawah 10%.`
                : "Tidak ada kategori margin rendah."}
            </p>
          </div>
          <div className={`brand-control-alert ${lossProviders.length ? "brand-control-alert-danger" : "brand-control-alert-info"}`}>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              Provider rugi
            </p>
            <p className="mt-2 text-lg font-black text-slate-950">
              {lossProviders[0]?.provider || "Tidak ada"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {lossProviders.length
                ? "Cek harga jual dan modal provider ini."
                : "Semua provider laba positif."}
            </p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Ringkasan jenis penjualan
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            Produk, layanan, dan jasa dihitung dari data transaksi penjualan.
          </p>
          <div className="mt-5">
          <SummaryTable rows={report.typeSummary} labelHeader="Jenis" emptyText="Belum ada transaksi untuk periode ini." />
          </div>
        </Panel>

        <Panel className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Sorotan pemilik toko
          </h3>
          <div className="mt-5 grid gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Kategori paling cuan
              </p>
              <p className="mt-3 text-xl font-bold text-slate-950">
                {bestCategory?.label || "-"}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {bestCategory ? formatRupiah(bestCategory.total_profit) : formatRupiah(0)} laba
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Provider layanan terbaik
              </p>
              <p className="mt-3 text-xl font-bold text-slate-950">
                {bestProvider ? `${bestProvider.category} - ${bestProvider.provider}` : "-"}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {bestProvider ? formatRupiah(bestProvider.total_revenue) : formatRupiah(0)} omzet
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Qty terjual
              </p>
              <p className="mt-3 text-xl font-bold text-slate-950">
                {report.globalSummary.total_qty} item
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Akumulasi produk, layanan, dan jasa pada periode aktif.
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel className="p-6">
        <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
          Ringkasan kategori
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Casing, charger, pulsa, kuota, voucher, token, transfer, e-wallet, dan kategori lain.
        </p>
        <div className="mt-5">
          <SummaryTable
            rows={report.categorySummary}
            labelHeader="Kategori"
            emptyText="Belum ada transaksi untuk kategori ini."
          />
        </div>
      </Panel>

      <Panel className="p-6">
        <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
          Rincian provider
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Khusus layanan seperti pulsa, kuota, voucher game, dan token listrik.
        </p>
        <div className="mt-5">
          <ProviderBreakdown rows={report.providerSummary} />
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Produk paling laku
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            Ranking 10 besar berdasarkan qty terjual.
          </p>
          <div className="mt-5">
            <TopProducts rows={report.topProducts} />
          </div>
        </Panel>

        <Panel className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Ringkasan metode bayar
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            Tunai, QRIS, transfer bank, dan e-wallet dari metode bayar pelanggan.
          </p>
          <div className="mt-5">
            <PaymentSummary rows={report.paymentSummary} />
          </div>
        </Panel>
      </div>

      <Panel className="p-6">
        <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
          Performa kasir
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Total transaksi, omzet, dan laba per kasir.
        </p>
        <div className="mt-5">
          <CashierPerformance rows={report.cashierSummary} />
        </div>
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                Detail transaksi
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {useServerReport
                  ? `${detailFrom}-${detailTo} dari ${detailTotal} baris detail periode aktif.`
                  : `${detailRows.length} baris detail dari ${report.detailRows.length} baris transaksi periode aktif.`}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,280px)_180px]">
              <input
                value={detailSearch}
                onChange={(event) => setDetailSearch(event.target.value)}
                placeholder="Cari transaksi, produk, provider..."
                className="brand-input"
              />
              <select
                value={detailType}
                onChange={(event) => setDetailType(event.target.value)}
                className="brand-select"
              >
                <option value="semua" className="bg-white">Semua tipe</option>
                <option value="produk" className="bg-white">Produk</option>
                <option value="layanan" className="bg-white">Layanan</option>
                <option value="jasa" className="bg-white">Jasa</option>
              </select>
            </div>
          </div>
        </div>
        <DetailTable rows={detailRows} />
        {useServerReport ? (
          <PaginationBar
            page={serverReport.detailPage.page}
            pageCount={serverReport.detailPage.pageCount}
            from={serverReport.detailPage.from}
            to={serverReport.detailPage.to}
            count={serverReport.detailPage.count}
            onPageChange={serverReport.detailPage.setPage}
          />
        ) : null}
      </Panel>
    </div>
  );
}

