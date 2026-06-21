import { useMemo, useState } from "react";
import LoadingState from "../components/LoadingState";
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

const customViewOptions = [
  { value: "profit", label: "Laba tertinggi" },
  { value: "slow", label: "Stok lambat" },
  { value: "abc", label: "Persediaan ABC" },
];

function PageIntro({ productCount, transactionCount }) {
  return (
    <header className="border-b border-slate-200 pb-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-950 sm:text-[36px]">
            Analisis Bisnis
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Baca produk yang menghasilkan laba, stok yang mulai tertahan, dan pemasok yang perlu
            dicek sebelum belanja ulang.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:min-w-[360px]">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <dt className="text-xs font-bold text-slate-500">
              Produk
            </dt>
            <dd className="mt-1 text-xl font-black tabular-nums text-slate-950">
              {productCount}
            </dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <dt className="text-xs font-bold text-slate-500">
              Transaksi
            </dt>
            <dd className="mt-1 text-xl font-black tabular-nums text-slate-950">
              {transactionCount}
            </dd>
          </div>
        </dl>
      </div>
    </header>
  );
}

function SectionHeader({ title, description, action }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-950">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function SummaryStrip({ items }) {
  return (
    <Panel className="overflow-hidden p-0">
      <dl className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="min-h-[116px] bg-white px-5 py-4">
            <dt className="text-xs font-semibold text-slate-500">{item.label}</dt>
            <dd className="mt-3 text-2xl font-black tracking-tight text-slate-950">
              {item.value}
            </dd>
            <p className="mt-2 text-xs leading-5 text-slate-500">{item.helper}</p>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function SupplierPerformanceList({ rows }) {
  if (!rows.length) {
    return (
      <div className="brand-empty-state mt-4">
        <p className="text-sm font-semibold text-slate-600">Belum ada data pemasok.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 divide-y divide-slate-200">
      {rows.map((row, index) => (
        <article key={row.supplier} className="py-4 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-black text-slate-600">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">{row.supplier}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{row.produk} produk terdaftar</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-black tabular-nums text-slate-950">
                {row.marginPercent.toFixed(1)}%
              </p>
              <p className="text-xs font-semibold text-slate-500">margin</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Laba {formatRupiah(row.profit)} dari omzet {formatRupiah(row.omzet)}
          </p>
        </article>
      ))}
    </div>
  );
}

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
  const customViewLabel =
    customViewOptions.find((option) => option.value === customView)?.label || "Laba tertinggi";

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
        header: "Laba",
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
      { key: "profit", header: "Laba", cell: (row) => formatRupiah(row.profit) },
      { key: "margin", header: "Margin", cell: (row) => `${row.marginPercent.toFixed(1)}%` },
    ],
    []
  );

  if (loading) {
    return <LoadingState text="Memuat analisis bisnis..." />;
  }

  const summaryItems = [
    {
      label: "Total laba produk",
      value: formatRupiah(analytics.summary.totalProfit),
      helper: "Akumulasi laba dari transaksi aksesori.",
    },
    {
      label: "Margin rata-rata",
      value: `${analytics.summary.avgMargin.toFixed(1)}%`,
      helper: "Pembanding cepat sebelum mengubah harga jual.",
    },
    {
      label: "Stok lambat",
      value: String(analytics.summary.slowMoving),
      helper: "Produk aktif yang perlu dicek pergerakannya.",
    },
    {
      label: "Produk kelas A",
      value: String(analytics.summary.classA),
      helper: "Kontributor omzet utama yang harus dijaga stoknya.",
    },
  ];

  return (
    <div className="space-y-5">
      <PageIntro
        productCount={analytics.productRows.length}
        transactionCount={accessoryTransactions.length}
      />

      <SummaryStrip items={summaryItems} />

      <OperationalInsightList insights={analytics.insights} />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel className="p-5">
          <SectionHeader
            title="Produk penyumbang laba"
            description="Mulai dari produk yang paling banyak menutup modal toko."
          />
          <DataTable
            columns={profitColumns}
            rows={analytics.profitRows}
            stickyFirst
            wrapperClassName="mt-5"
            emptyMessage="Belum ada transaksi produk."
          />
        </Panel>

        <Panel className="p-5">
          <SectionHeader
            title="Pemasok"
            description="Lihat pemasok yang paling efisien dari sisi margin dan omzet."
          />
          <SupplierPerformanceList rows={analytics.supplierRows} />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel className="p-5">
          <SectionHeader
            title="Stok lambat"
            description="Produk yang masih ada stoknya tetapi tidak terjual lebih dari 60 hari."
          />
          <DataTable
            columns={slowMovingColumns}
            rows={analytics.slowMovingRows}
            stickyFirst
            wrapperClassName="mt-5"
            emptyMessage="Tidak ada slow moving stock pada periode ini."
          />
        </Panel>

        <Panel className="p-5">
          <SectionHeader
            title="Persediaan ABC"
            description="Klasifikasi kontribusi omzet: A prioritas, B normal, C rendah."
          />
          <DataTable
            columns={abcColumns}
            rows={analytics.abcRows.slice(0, 12)}
            stickyFirst
            wrapperClassName="mt-5"
            emptyMessage="Belum cukup data omzet untuk analisis ABC."
          />
        </Panel>
      </div>

      <Panel className="p-5">
        <SectionHeader
          title={`Tampilan cepat: ${customViewLabel}`}
          description="Ganti sudut baca tanpa pindah halaman."
          action={
            <div className="brand-segmented">
              {customViewOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCustomView(option.value)}
                  className={
                    customView === option.value
                      ? "brand-segmented-button brand-segmented-button-active"
                      : "brand-segmented-button"
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          }
        />
        <DataTable columns={customColumns} rows={customRows} stickyFirst wrapperClassName="mt-5" />
      </Panel>
    </div>
  );
}
