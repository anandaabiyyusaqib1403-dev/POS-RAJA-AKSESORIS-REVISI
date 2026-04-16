import { useMemo, useState } from "react";
import MetricCard from "../components/app/MetricCard";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { useData } from "../contexts/DataContext";
import {
  cashCategoryLabelMap,
  serviceTypeLabelMap,
  walletPlatformLabelMap,
} from "../data/businessOptions";
import { formatCashierName } from "../utils/cashier";
import { exportFinancialReport } from "../utils/exportFinancialReport";
import {
  formatDateInput,
  formatDateTime,
  formatRupiah,
  parseDateInput,
} from "../utils/format";

const DEBT_STORAGE_KEY = "raja-debts-records-v1";

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

function normalizeNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function parseReportDate(value) {
  if (!value) return new Date();
  const text = String(value);
  return new Date(text.includes("T") ? text : `${text}T12:00:00`);
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function isWithinRange(value, range) {
  const date = parseReportDate(value);
  if (range.startDate && date < startOfDay(range.startDate)) return false;
  if (range.endDate && date > endOfDay(range.endDate)) return false;
  return true;
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
  const serviceLabel =
    serviceTypeLabelMap[transaction.jenis] || transaction.jenis || "Layanan digital";

  return [
    serviceLabel,
    transaction.provider,
    formatCompactAmount(transaction.nominal),
    transaction.nomor_tujuan,
  ]
    .filter(Boolean)
    .join(" - ");
}

function loadDebtRecords() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(DEBT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getDebtRemainingAmount(record) {
  return Math.max(
    0,
    normalizeNumber(record.totalAmount) - normalizeNumber(record.paidAmount)
  );
}

function buildDebtSummary(records) {
  return records.reduce(
    (acc, record) => {
      const remaining = getDebtRemainingAmount(record);
      if (record.direction === "hutang") {
        acc.totalHutang += remaining;
      } else {
        acc.totalPiutang += remaining;
      }
      return acc;
    },
    { totalHutang: 0, totalPiutang: 0 }
  );
}

function createFinancialTransaction({
  sortAt,
  noTransaksi,
  tanggal,
  kasir = "Sriyati",
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

function buildFinancialTransactions({ summary, products, stockLogs, range, debtRecords }) {
  const productMap = new Map(products.map((product) => [product.id, product]));
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

  const stockRows = stockLogs
    .filter((log) => log.tipe === "masuk" && normalizeNumber(log.jumlah) > 0)
    .filter((log) => isWithinRange(log.created_at, range))
    .map((log) => {
      const product = productMap.get(log.produk_id);
      const qty = Math.abs(normalizeNumber(log.jumlah));
      const amount = qty * normalizeNumber(product?.harga_beli);

      return createFinancialTransaction({
        sortAt: log.created_at,
        noTransaksi: log.referensi || `STOK-${String(log.id || "").slice(0, 8).toUpperCase()}`,
        tanggal: formatReportDateTime(log.created_at),
        kasir: "Sriyati",
        jenis: "Modal Barang",
        keterangan: [
          `Pembelian stok ${product?.nama || "Produk"}`,
          `${qty} ${product?.satuan || "pcs"}`,
          log.catatan,
        ]
          .filter(Boolean)
          .join(" - "),
        nominalKeluar: amount,
        metode: "-",
      });
    })
    .filter((row) => row.nominalKeluar > 0);

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
      kasir: formatCashierName(entry.kasir_id || "Sriyati"),
      jenis: isIncome ? "Pemasukan" : isRestock ? "Modal Barang" : "Operasional",
      keterangan: [categoryLabel, entry.keterangan].filter(Boolean).join(" - "),
      nominalMasuk: isIncome ? entry.nominal : 0,
      nominalKeluar: isIncome ? 0 : entry.nominal,
      metode: "Cash",
    });
  });

  const debtPaymentRows = debtRecords.flatMap((record) =>
    (Array.isArray(record.payments) ? record.payments : [])
      .filter((payment) => isWithinRange(payment.createdAt, range))
      .map((payment) => {
        const isReceivable = record.direction !== "hutang";
        return createFinancialTransaction({
          sortAt: payment.createdAt,
          noTransaksi: record.reference || `HP-${String(record.id || "").slice(0, 8).toUpperCase()}`,
          tanggal: formatReportDateTime(payment.createdAt),
          kasir: "Sriyati",
          jenis: isReceivable ? "Piutang" : "Hutang",
          keterangan: [
            isReceivable ? "Pembayaran piutang" : "Pembayaran hutang",
            record.partyName,
            payment.note,
          ]
            .filter(Boolean)
            .join(" - "),
          nominalMasuk: isReceivable ? payment.amount : 0,
          nominalKeluar: isReceivable ? 0 : payment.amount,
          metode: "Cash",
        });
      })
  );

  return [...salesRows, ...digitalRows, ...logisticsRows, ...stockRows, ...cashRows, ...debtPaymentRows]
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

function buildReportSummary(transactions, debtRecords, saldoAwal) {
  const debtSummary = buildDebtSummary(debtRecords);

  return {
    saldoAwal,
    totalPenjualan: transactions
      .filter((row) => row.jenis === "Penjualan")
      .reduce((sum, row) => sum + row.nominalMasuk, 0),
    totalModalBarang: transactions
      .filter((row) => row.jenis === "Modal Barang")
      .reduce((sum, row) => sum + row.nominalKeluar, 0),
    totalBiayaOperasional: transactions
      .filter((row) => row.jenis === "Operasional")
      .reduce((sum, row) => sum + row.nominalKeluar, 0),
    totalHutangPiutang: debtSummary.totalPiutang + debtSummary.totalHutang,
  };
}

export default function FinanceReportPage() {
  const { getDashboardSummary, products, stockLogs } = useData();
  const [period, setPeriod] = useState("today");
  const [customRange, setCustomRange] = useState({
    startDate: formatDateInput(new Date()),
    endDate: formatDateInput(new Date()),
  });

  const range = useMemo(() => getRange(period, customRange), [customRange, period]);
  const summary = useMemo(() => getDashboardSummary(range), [getDashboardSummary, range]);

  const exportReport = async () => {
    const exportedAt = new Date();
    const periodLabel = formatRangeLabel(range);
    const debtRecords = loadDebtRecords();
    const transactions = buildFinancialTransactions({
      summary,
      products,
      stockLogs,
      range,
      debtRecords,
    });
    const cashFlow = buildCashFlowRows(transactions);
    const saldoAwal = summary.cashDailySummary[0]?.saldo_awal || 0;

    const reportData = {
      exportedAt,
      periodLabel,
      fileName: `Laporan_Keuangan_Raja_Aksesoris_${formatDateInput(exportedAt)}.xlsx`,
      summary: buildReportSummary(transactions, debtRecords, saldoAwal),
      cashFlow,
      transactions,
    };

    await exportFinancialReport(reportData);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Laporan keuangan"
        description="Ringkasan omzet, modal, profit, dan pengeluaran toko dalam satu tampilan yang siap dipakai owner."
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
        <MetricCard label="Total omzet" value={formatRupiah(summary.omzet)} />
        <MetricCard
          label="Total modal"
          value={formatRupiah(summary.omzet - summary.keuntunganKotor)}
        />
        <MetricCard label="Profit kotor" value={formatRupiah(summary.keuntunganKotor)} accent="success" />
        <MetricCard label="Profit bersih" value={formatRupiah(summary.labaBersih)} accent="gold" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Breakdown channel
          </h3>
          <div className="mt-5 space-y-3">
            {summary.breakdown.map((item) => (
              <div
                key={item.key}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.transaksi} transaksi</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-950">{formatRupiah(item.omzet)}</p>
                    <p className="mt-1 text-xs text-[var(--brand-gold)]">
                      Profit {formatRupiah(item.keuntungan)}
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
            <table className="brand-table">
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
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--brand-gold)]">
          Ringkasan periode
        </p>
        <p className="mt-3 text-sm leading-7 text-slate-700">
          Data ditarik dari transaksi aksesoris, layanan digital, logistik, dan kas operasional.
          Laporan ini cocok untuk rekap harian owner sebelum setor tunai atau tutup buku.
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Digenerate {formatDateTime(new Date(), { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </Panel>
    </div>
  );
}
