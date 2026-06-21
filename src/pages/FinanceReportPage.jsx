import { useMemo, useState } from "react";
import FeatureLoadPanel from "../components/FeatureLoadPanel";
import MetricCard from "../components/app/MetricCard";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { useReports } from "../hooks/useReports";
import { useDailySalesSummary } from "../hooks/useDailySalesSummary";
import { useFirstPaintReady } from "../hooks/useFirstPaintReady";
import {
  cashCategoryLabelMap,
  walletPlatformLabelMap,
} from "../data/businessOptions";
import { formatCashierName } from "../utils/cashier";
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

  return `${startLabel} - ${endLabel}`;
}

function normalizeNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function parseReportDate(value) {
  if (!value) return new Date();
  const text = String(value);
  return new Date(text.includes("T") ? text : `${text}T12:00:00`);
}

function formatReportDateTime(value) {
  return formatDateTime(parseReportDate(value), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatPaymentMethod(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const labelMap = {
    cash: "Cash",
    tunai: "Cash",
    qris: "QRIS",
    transfer: "Transfer",
    dana: "DANA",
    gopay: "GoPay",
    shopeepay: "ShopeePay",
    ovo: "OVO",
    linkaja: "LinkAja",
    bca: "BCA",
    mandiri: "Mandiri",
    bri: "BRI",
    bni: "BNI",
  };

  return walletPlatformLabelMap[normalized] || labelMap[normalized] || normalized || "-";
}

function formatCompactAmount(value) {
  const amount = Number(value || 0);
  return amount > 0 ? amount.toLocaleString("id-ID") : "";
}

function buildDigitalProductName(transaction) {
  const serviceLabel = transaction.jenis || "Layanan digital";

  return [
    serviceLabel,
    transaction.provider,
    formatCompactAmount(transaction.nominal),
    transaction.nomor_tujuan,
  ]
    .filter(Boolean)
    .join(" - ");
}

function createFinancialTransaction({
  sortAt,
  noTransaksi,
  tanggal,
  kasir = "Kasir tidak tercatat",
  jenis,
  keterangan,
  nominalMasuk = 0,
  nominalKeluar = 0,
  metode = "-",
}) {
  return {
    sortAt,
    noTransaksi,
    tanggal,
    kasir,
    jenis,
    keterangan,
    nominalMasuk: normalizeNumber(nominalMasuk),
    nominalKeluar: normalizeNumber(nominalKeluar),
    metode,
  };
}

function buildFinancialTransactions({ summary }) {
  const salesRows = summary.accessoryTransactions.map((transaction) => {
    const items = Array.isArray(transaction.items) ? transaction.items : [];
    const itemCount = items.reduce((sum, item) => sum + normalizeNumber(item.qty), 0);
    const itemPreview = items
      .map((item) => item.nama_produk)
      .filter(Boolean)
      .slice(0, 3)
      .join(", ");

    return createFinancialTransaction({
      sortAt: transaction.created_at,
      noTransaksi: transaction.no_transaksi || `TRX-${transaction.id}`,
      tanggal: formatDateTime(transaction.created_at, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      kasir: formatCashierName(transaction.kasir_id),
      jenis: "Penjualan",
      keterangan: [
        `Penjualan aksesoris (${itemCount || 0} item)`,
        itemPreview ? itemPreview : "",
      ]
        .filter(Boolean)
        .join(" - "),
      nominalMasuk: transaction.total_bayar,
      metode: formatPaymentMethod(transaction.metode_bayar),
    });
  });

  const digitalRows = summary.digitalTransactions.map((transaction) =>
    createFinancialTransaction({
    sortAt: transaction.created_at,
    noTransaksi: transaction.no_transaksi || `LYN-${transaction.id}`,
    tanggal: formatDateTime(transaction.created_at, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    kasir: formatCashierName(transaction.kasir_id),
      jenis: "Penjualan",
      keterangan: buildDigitalProductName(transaction),
      nominalMasuk: transaction.harga_jual,
    metode: transaction.platform_sumber
      ? walletPlatformLabelMap[transaction.platform_sumber] || transaction.platform_sumber
      : "-",
    })
  );

  const logisticsRows = summary.logisticsTransactions.map((transaction) =>
    createFinancialTransaction({
    sortAt: transaction.created_at,
    noTransaksi: transaction.no_transaksi || `LOG-${transaction.id}`,
    tanggal: formatDateTime(transaction.created_at, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    kasir: formatCashierName(transaction.kasir_id),
      jenis: "Penjualan",
      keterangan: [
        "Logistik",
        transaction.courier || transaction.ekspedisi,
        transaction.receiver || transaction.receiver_name,
        transaction.destination,
        transaction.packageType || transaction.package_type,
        transaction.weight ? `${transaction.weight} kg` : "",
      ]
        .filter(Boolean)
        .join(" - "),
      nominalMasuk: transaction.price || transaction.harga_jual,
    metode:
      walletPlatformLabelMap[
        transaction.paymentMethod || transaction.payment_method || transaction.platform_sumber
      ] ||
      transaction.paymentMethod ||
      transaction.payment_method ||
      transaction.platform_sumber ||
      "-",
    })
  );

  const cashRows = summary.cashEntries.map((entry) => {
    const isIncome = entry.jenis === "pemasukan";
    const categoryLabel = cashCategoryLabelMap[entry.kategori] || entry.kategori || "Kas";
    const isRestock = entry.kategori === "restock";

    return createFinancialTransaction({
      sortAt: entry.created_at || entry.tanggal,
      noTransaksi: `KAS-${entry.tanggal || formatDateInput(new Date())}-${String(entry.id || "")
        .slice(0, 6)
        .toUpperCase()}`,
      tanggal: formatReportDateTime(entry.created_at || entry.tanggal),
      kasir: formatCashierName(entry.kasir_id),
      jenis: isIncome ? "Pemasukan" : isRestock ? "Modal Barang" : "Operasional",
      keterangan: [categoryLabel, entry.keterangan].filter(Boolean).join(" - "),
      nominalMasuk: isIncome ? entry.nominal : 0,
      nominalKeluar: isIncome ? 0 : entry.nominal,
      metode: "Cash",
    });
  });

  const supplierReturnRows = (summary.supplierReturns || []).map((row) =>
    createFinancialTransaction({
      sortAt: row.created_at,
      noTransaksi: row.no_retur,
      tanggal: formatReportDateTime(row.created_at),
      kasir: formatCashierName(row.created_by),
      jenis: "Retur Supplier",
      keterangan: [
        row.supplier_name,
        `${row.total_quantity || 0} pcs keluar stok`,
        row.status,
      ]
        .filter(Boolean)
        .join(" - "),
      nominalKeluar: row.total_estimated_value,
      metode: row.settlement_method || row.status || "-",
    })
  );

  const customerReturnRows = (summary.customerReturns || []).map((row) =>
    createFinancialTransaction({
      sortAt: row.created_at,
      noTransaksi: row.no_retur,
      tanggal: formatReportDateTime(row.created_at),
      kasir: formatCashierName(row.created_by),
      jenis: "Garansi Konsumen",
      keterangan: [
        row.transaction_no,
        row.customer_name,
        `${row.total_quantity || 0} pcs`,
        row.refund_method === "warranty_exchange"
          ? "Tukar barang"
          : row.refund_method === "warranty_rejected"
            ? "Ditolak"
            : "Refund",
      ]
        .filter(Boolean)
        .join(" - "),
      nominalKeluar: row.total_refund_amount,
      metode: row.refund_method || "-",
    })
  );

  return [
    ...salesRows,
    ...digitalRows,
    ...logisticsRows,
    ...cashRows,
    ...supplierReturnRows,
    ...customerReturnRows,
  ]
    .sort((left, right) => new Date(left.sortAt) - new Date(right.sortAt))
    .map((transaction) => ({
      ...transaction,
      sortAt: transaction.sortAt,
    }));
}

function buildCashFlowRows(transactions) {
  return transactions
    .map((transaction) => {
      const isIncome = transaction.nominalMasuk > 0;
      return {
        sortAt: transaction.sortAt,
        tanggal: transaction.tanggal,
        tipe: isIncome ? "Masuk" : "Keluar",
        kategori: transaction.jenis,
        keterangan: transaction.keterangan,
        nominal: isIncome ? transaction.nominalMasuk : transaction.nominalKeluar,
      };
    })
    .filter((row) => row.nominal > 0);
}

function buildExpenseBreakdown(transactions) {
  return transactions.reduce(
    (acc, row) => {
      if (row.nominalKeluar <= 0) return acc;
      if (row.jenis === "Modal Barang") {
        acc["Modal Barang"] += row.nominalKeluar;
      } else if (row.jenis === "Operasional") {
        acc.Operasional += row.nominalKeluar;
      } else {
        acc["Lain-lain"] += row.nominalKeluar;
      }
      return acc;
    },
    { "Modal Barang": 0, Operasional: 0, "Lain-lain": 0 }
  );
}

function buildReportSummary(transactions, saldoAwal, dashboardSummary) {
  const totalPenjualan = transactions
    .filter((row) => row.jenis === "Penjualan")
    .reduce((sum, row) => sum + row.nominalMasuk, 0);
  const totalOperasional = transactions
    .filter((row) => row.jenis === "Operasional")
    .reduce((sum, row) => sum + row.nominalKeluar, 0);
  const totalReturSupplier = transactions
    .filter((row) => row.jenis === "Retur Supplier")
    .reduce((sum, row) => sum + row.nominalKeluar, 0);
  const totalReturKonsumen = transactions
    .filter((row) => row.jenis === "Garansi Konsumen")
    .reduce((sum, row) => sum + row.nominalKeluar, 0);
  const jumlahTransaksi = transactions.filter((row) => row.jenis === "Penjualan").length;

  return {
    saldoAwal,
    totalPenjualan,
    totalModalBarang: Math.max(0, normalizeNumber(totalPenjualan) - normalizeNumber(dashboardSummary.keuntunganKotor)),
    totalBiayaOperasional: totalOperasional,
    totalReturSupplier,
    totalReturKonsumen,
    returnSummary: dashboardSummary.returnSummary,
    jumlahTransaksi,
    expenseBreakdown: buildExpenseBreakdown(transactions),
    totalHutangPiutang: 0,
  };
}

function createEmptyFinancialSummary() {
  return {
    omzet: 0,
    keuntunganKotor: 0,
    labaBersih: 0,
    breakdown: [],
    cashDailySummary: [],
    accessoryTransactions: [],
    digitalTransactions: [],
    logisticsTransactions: [],
    cashEntries: [],
    supplierReturns: [],
    customerReturns: [],
    returnSummary: {
      supplier: { estimatedValue: 0, quantity: 0 },
      customer: { refundAmount: 0, quantity: 0 },
    },
  };
}

export default function FinanceReportPage() {
  const {
    coreError,
    coreLoading,
    getDashboardSummary,
    refreshTransactions,
    walletBalances,
  } = useReports();
  const [period, setPeriod] = useState("today");
  const [customRange, setCustomRange] = useState({
    startDate: formatDateInput(new Date()),
    endDate: formatDateInput(new Date()),
  });
  const firstPaintReady = useFirstPaintReady();

  const range = useMemo(() => getRange(period, customRange), [customRange, period]);
  const summary = useMemo(
    () => (firstPaintReady ? getDashboardSummary(range) : createEmptyFinancialSummary()),
    [firstPaintReady, getDashboardSummary, range]
  );
  const dailySalesSummary = useDailySalesSummary(range);
  const reportMetrics = useMemo(() => {
    if (!dailySalesSummary.available) {
      return {
        omzet: summary.omzet,
        modal: summary.omzet - summary.keuntunganKotor,
        keuntunganKotor: summary.keuntunganKotor,
        labaBersih: summary.labaBersih,
        source: "client",
      };
    }

    const expenseImpact = Number(summary.keuntunganKotor || 0) - Number(summary.labaBersih || 0);
    return {
      omzet: dailySalesSummary.totals.revenue,
      modal: dailySalesSummary.totals.cost,
      keuntunganKotor: dailySalesSummary.totals.profit,
      labaBersih: dailySalesSummary.totals.profit - expenseImpact,
      source: "summary_view",
    };
  }, [dailySalesSummary.available, dailySalesSummary.totals, summary]);

  const exportReport = async () => {
    const exportedAt = new Date();
    const periodLabel = formatRangeLabel(range);
    const transactions = buildFinancialTransactions({
      summary,
    });
    const cashFlow = buildCashFlowRows(transactions);
    const saldoAwal = summary.cashDailySummary[0]?.saldo_awal || 0;

    const reportData = {
      exportedAt,
      periodLabel,
      fileName: `Laporan_Keuangan_Raja_Aksesoris_${formatDateInput(exportedAt)}.xlsx`,
      summary: buildReportSummary(transactions, saldoAwal, summary),
      walletBalances,
      cashFlow,
      transactions,
    };

    const { exportFinancialReport } = await import("../utils/exportFinancialReport");
    await exportFinancialReport(reportData);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Keuangan"
        title="Laporan keuangan"
        description="Omzet, modal, laba, dan pengeluaran toko untuk pengecekan pemilik."
        icon="chart"
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
            <button type="button" onClick={exportReport} className="brand-button-success">
              Export Excel
            </button>
          </>
        }
      />

      <FeatureLoadPanel
        error={coreError || dailySalesSummary.error}
        loading={coreLoading || dailySalesSummary.loading}
        loadingText="Sinkronisasi laporan keuangan..."
        onRetry={refreshTransactions}
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
        <MetricCard label="Total omzet" value={formatRupiah(reportMetrics.omzet)} />
        <MetricCard
          label="Total modal"
          value={formatRupiah(reportMetrics.modal)}
        />
        <MetricCard label="Laba kotor" value={formatRupiah(reportMetrics.keuntunganKotor)} accent="success" />
        <MetricCard label="Laba bersih" value={formatRupiah(reportMetrics.labaBersih)} accent="gold" />
      </div>

      <Panel className="px-5 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-slate-700">
            Sumber angka laporan:{" "}
            <span className="text-slate-950">
              {reportMetrics.source === "summary_view"
                ? "ringkasan harian"
                : "perhitungan langsung"}
            </span>
          </p>
          {dailySalesSummary.loading ? <span className="brand-badge-neutral">Memuat ringkasan</span> : null}
        </div>
        {dailySalesSummary.error ? (
          <p className="mt-2 text-sm text-amber-700">
            Ringkasan harian belum tersedia; laporan tetap dihitung dari transaksi yang ada.
          </p>
        ) : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          label="Retur supplier"
          value={formatRupiah(summary.returnSummary?.supplier?.estimatedValue || 0)}
        />
        <MetricCard
          label="Qty retur supplier"
          value={`${summary.returnSummary?.supplier?.quantity || 0} pcs`}
          accent="gold"
        />
        <MetricCard
          label="Refund garansi"
          value={formatRupiah(summary.returnSummary?.customer?.refundAmount || 0)}
        />
        <MetricCard
          label="Qty garansi konsumen"
          value={`${summary.returnSummary?.customer?.quantity || 0} pcs`}
          accent="success"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Rincian kanal
          </h3>
          <div className="mt-5 space-y-3">
            {summary.breakdown.map((item) => (
              <div
                key={item.key}
                className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.transaksi} transaksi</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-950">{formatRupiah(item.omzet)}</p>
                    <p className="mt-1 text-xs text-[var(--brand-gold-strong)]">
                      Laba {formatRupiah(item.keuntungan)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                Rekap kas harian
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {summary.cashDailySummary.length} hari tercatat pada periode aktif.
              </p>
            </div>
          </div>

          <div className="brand-scrollbar overflow-x-auto">
            <table className="brand-table brand-table-sticky-first">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th className="text-right">Saldo Awal</th>
                  <th className="text-right">Pemasukan</th>
                  <th className="text-right">Pengeluaran</th>
                  <th className="text-right">Sisa Saldo</th>
                </tr>
              </thead>
              <tbody>
                {summary.cashDailySummary.map((item) => (
                  <tr key={item.tanggal}>
                    <td className="font-semibold text-slate-950">{item.tanggal}</td>
                    <td className="text-right text-slate-600">{formatRupiah(item.saldo_awal)}</td>
                    <td className="text-right text-slate-600">
                      {formatRupiah(item.total_pemasukan)}
                    </td>
                    <td className="text-right text-slate-600">
                      {formatRupiah(item.total_pengeluaran)}
                    </td>
                    <td className="text-right font-semibold text-slate-950">
                      {formatRupiah(item.sisa_saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel variant="strong" className="p-6">
        <p className="text-sm font-semibold text-[var(--brand-gold-strong)]">
          Ringkasan periode
        </p>
        <p className="mt-3 text-sm leading-7 text-slate-700">
          Data ditarik dari transaksi aksesoris, layanan digital, logistik, dan kas operasional.
          Laporan ini cocok untuk rekap harian pemilik toko sebelum setor tunai atau tutup buku.
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Dibuat {formatDateTime(new Date(), { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </Panel>
    </div>
  );
}

