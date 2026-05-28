import { useMemo, useState } from "react";
import LoadingState from "../components/LoadingState";
import MetricCard from "../components/app/MetricCard";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { DataTable } from "../components/ui/Table";
import { useProducts } from "../hooks/useProducts";
import { useTransactions } from "../hooks/useTransactions";
import OperationalInsightList from "../features/analytics/components/OperationalInsightList";
import {
  buildBusinessAnalytics,
  getLastSoldLabel,
  getBusinessAnalyticsRows,
} from "../features/analytics/services/businessAnalytics";
import { formatRupiah } from "../utils/format";

export default function BusinessAnalyticsPage() {
  const { loading, products } = useProducts();
  const { accessoryTransactions } = useTransactions();
  const [customView, setCustomView] = useState("profit");
  const analytics = useMemo(
    () => buildBusinessAnalytics(products, accessoryTransactions),
    [accessoryTransactions, products]
  );
  const customRows = useMemo(
    () => getBusinessAnalyticsRows(analytics, customView),
    [analytics, customView]
  );

  const profitColumns = useMemo(
    () => [
      {
        key: "produk",
        header: "Produk",
        cell: (row) => (
          <>
            <p className="font-semibold text-slate-950">{row.nama}</p>
            <p className="text-xs text-slate-500">{row.kategori}</p>
          </>
        ),
      },
      { key: "qty", header: "Qty", cell: (row) => row.qty },
      { key: "omzet", header: "Omzet", cell: (row) => formatRupiah(row.omzet) },
      {
        key: "profit",
        header: "Profit",
        className: "font-semibold text-slate-950",
        cell: (row) => formatRupiah(row.profit),
      },
      { key: "margin", header: "Margin %", cell: (row) => `${row.marginPercent.toFixed(1)}%` },
    ],
    []
  );

  const slowMovingColumns = useMemo(
    () => [
      {
        key: "nama",
        header: "Produk",
        className: "font-semibold text-slate-950",
      },
      { key: "stok", header: "Stok" },
      {
        key: "nilaiStok",
        header: "Nilai Stok",
        cell: (row) => formatRupiah(row.stok * row.modalSatuan),
      },
      {
        key: "terakhirLaku",
        header: "Terakhir Laku",
        cell: (row) => getLastSoldLabel(row.lastSoldAt),
      },
    ],
    []
  );

  const abcColumns = useMemo(
    () => [
      {
        key: "abcClass",
        header: "Kelas",
        cell: (row) => (
          <span className="rounded-full bg-[var(--brand-gold)]/14 px-3 py-1 text-xs font-bold text-[var(--brand-gold-strong)]">
            {row.abcClass}
          </span>
        ),
      },
      {
        key: "nama",
        header: "Produk",
        className: "font-semibold text-slate-950",
      },
      { key: "omzet", header: "Omzet", cell: (row) => formatRupiah(row.omzet) },
      { key: "cumulative", header: "Kumulatif", cell: (row) => `${row.cumulative.toFixed(1)}%` },
    ],
    []
  );

  const customColumns = useMemo(
    () => [
      {
        key: "nama",
        header: "Produk",
        className: "font-semibold text-slate-950",
      },
      { key: "kategori", header: "Kategori" },
      { key: "qty", header: "Qty" },
      { key: "omzet", header: "Omzet", cell: (row) => formatRupiah(row.omzet) },
      { key: "profit", header: "Profit", cell: (row) => formatRupiah(row.profit) },
      { key: "margin", header: "Margin", cell: (row) => `${row.marginPercent.toFixed(1)}%` },
    ],
    []
  );

  if (loading) {
    return <LoadingState text="Memuat analitik bisnis..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Analitik Bisnis"
        description="Pantau profit per produk, stok lambat, ABC inventory, dan performa supplier dari data transaksi."
        icon="chart"
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard label="Total profit produk" value={formatRupiah(analytics.summary.totalProfit)} />
        <MetricCard label="Margin rata-rata" value={`${analytics.summary.avgMargin.toFixed(1)}%`} />
        <MetricCard label="Slow moving" value={String(analytics.summary.slowMoving)} />
        <MetricCard label="Produk kelas A" value={String(analytics.summary.classA)} />
      </div>

      <OperationalInsightList insights={analytics.insights} />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Profit per product
          </h3>
          <DataTable
            columns={profitColumns}
            rows={analytics.profitRows}
            stickyFirst
            wrapperClassName="mt-5"
            emptyMessage="Belum ada transaksi produk."
          />
        </Panel>

        <Panel className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Supplier performance
          </h3>
          <div className="mt-5 space-y-3">
            {analytics.supplierRows.map((row) => (
              <div key={row.supplier} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{row.supplier}</p>
                    <p className="mt-1 text-sm text-slate-500">{row.produk} produk</p>
                  </div>
                  <span className="font-bold text-[var(--brand-gold-strong)]">
                    {row.marginPercent.toFixed(1)}%
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  Profit {formatRupiah(row.profit)} dari omzet {formatRupiah(row.omzet)}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Slow moving stock
          </h3>
          <p className="mt-2 text-sm text-slate-600">Produk stok aktif yang tidak laku lebih dari 60 hari.</p>
          <DataTable
            columns={slowMovingColumns}
            rows={analytics.slowMovingRows}
            stickyFirst
            wrapperClassName="mt-5"
            emptyMessage="Tidak ada slow moving stock pada periode ini."
          />
        </Panel>

        <Panel className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            ABC analysis
          </h3>
          <p className="mt-2 text-sm text-slate-600">Klasifikasi kontribusi omzet: A prioritas, B normal, C rendah.</p>
          <DataTable
            columns={abcColumns}
            rows={analytics.abcRows.slice(0, 12)}
            stickyFirst
            wrapperClassName="mt-5"
            emptyMessage="Belum cukup data omzet untuk ABC analysis."
          />
        </Panel>
      </div>

      <Panel className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
              Custom report
            </h3>
            <p className="mt-2 text-sm text-slate-600">Pilih tampilan cepat sesuai kebutuhan pemilik toko.</p>
          </div>
          <select
            value={customView}
            onChange={(event) => setCustomView(event.target.value)}
            className="brand-select max-w-[260px]"
          >
            <option value="profit">Produk paling profit</option>
            <option value="slow">Slow moving stock</option>
            <option value="abc">ABC inventory</option>
          </select>
        </div>
        <DataTable columns={customColumns} rows={customRows} stickyFirst wrapperClassName="mt-5" />
      </Panel>

      <Panel className="p-6">
        <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
          Modul berikutnya
        </h3>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            "Supplier & Purchase Order",
            "Diskon / Promo",
            "CRM & Loyalty Points",
            "Tax / PPN / PPh",
          ].map((item) => (
            <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-950">{item}</p>
              <p className="mt-2 text-sm text-slate-600">
                Butuh tabel dan alur data khusus agar aman dipakai operasional.
              </p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
