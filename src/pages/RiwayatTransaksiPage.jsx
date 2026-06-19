import { useEffect, useMemo, useState } from "react";
import MetricCard from "../components/app/MetricCard";
import PaginationBar from "../components/PaginationBar";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import PinConfirmationModal from "../components/PinConfirmationModal";
import { useAuth } from "../contexts/useAuth";
import { showNotification } from "../contexts/NotificationContext";
import {
  cashCategoryLabelMap,
  walletPlatformLabelMap,
  walletTransactionTypeLabelMap,
} from "../data/businessOptions";
import {
  formatDateInput,
  formatDateTime,
  formatRupiah,
  parseDateInput,
} from "../utils/format";
import {
  isPinActionCancelledError,
  usePinConfirmation,
} from "../hooks/usePinConfirmation";
import { useProducts } from "../hooks/useProducts";
import { useShift } from "../hooks/useShift";
import { useTransactions } from "../hooks/useTransactions";
import { useWallet } from "../hooks/useWallet";
import { usePagedTransactionHistoryRows } from "../hooks/usePagedTransactionHistoryRows";
import { formatCashierName } from "../utils/cashier";
import { printTransactionReceipt } from "../utils/print";
import {
  buildDeletedHistoryRows,
  buildHistoryRows,
  formatPaymentMethod,
  formatReportRangeLabel,
  formatSignedCurrency,
  getDaysLeft,
  getPresetRange,
  isInDateRange,
} from "../features/history/services/transactionHistory";

const PERIOD_OPTIONS = [
  { key: "today", label: "Hari Ini" },
  { key: "7", label: "7 Hari" },
  { key: "30", label: "30 Hari" },
  { key: "all", label: "Semua" },
];

const SOURCE_OPTIONS = [
  { value: "semua", label: "Semua kanal" },
  { value: "aksesoris", label: "Kasir Aksesoris" },
  { value: "digital", label: "Layanan Digital" },
  { value: "logistik", label: "Logistik" },
  { value: "saldo", label: "Saldo Internal" },
  { value: "operasional", label: "Kas Operasional" },
];

const FLOW_OPTIONS = [
  { value: "semua", label: "Semua arus" },
  { value: "masuk", label: "Masuk" },
  { value: "keluar", label: "Keluar" },
  { value: "internal", label: "Internal" },
];

const HISTORY_PAGE_SIZE = 25;
const DELETED_PAGE_SIZE = 10;

const PAYMENT_METHODS = [
  "cash",
  "qris",
  "dana",
  "bank_mas",
  "wahana",
  "pasar_kuota",
  "shopee",
  "bca",
];

const sourceAppearance = {
  aksesoris: {
    label: "Aksesoris",
    badgeClass: "bg-[var(--brand-gold)]/12 text-[var(--brand-gold)]",
  },
  digital: {
    label: "Digital",
    badgeClass: "bg-sky-100 text-sky-700",
  },
  logistik: {
    label: "Logistik",
    badgeClass: "bg-emerald-100 text-emerald-700",
  },
  saldo: {
    label: "Saldo",
    badgeClass: "bg-slate-100 text-slate-700",
  },
  operasional: {
    label: "Operasional",
    badgeClass: "bg-rose-100 text-rose-700",
  },
};

const flowAppearance = {
  masuk: {
    label: "Masuk",
    badgeClass: "bg-emerald-100 text-emerald-700",
  },
  keluar: {
    label: "Keluar",
    badgeClass: "bg-rose-100 text-rose-700",
  },
  internal: {
    label: "Internal",
    badgeClass: "bg-slate-100 text-slate-600",
  },
};

function handlePrintTransaction(transaction) {
  const printWindow = window.open("", "_blank", "width=420,height=760");

  if (!printWindow) {
    showNotification(
      "warning",
      "Jendela cetak diblokir browser. Izinkan popup, lalu tekan Cetak Struk lagi."
    );
    return;
  }

  const didPrint = printTransactionReceipt(transaction, printWindow);
  if (!didPrint) {
    showNotification("error", "Struk gagal disiapkan. Coba cetak ulang dari riwayat transaksi.");
    return;
  }

  showNotification("success", "Jendela cetak struk sudah dibuka.");
}

function SourceBadge({ source }) {
  const appearance = sourceAppearance[source] || sourceAppearance.operasional;

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${appearance.badgeClass}`}>
      {appearance.label}
    </span>
  );
}

function FlowBadge({ flow }) {
  const appearance = flowAppearance[flow] || flowAppearance.internal;

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${appearance.badgeClass}`}>
      {appearance.label}
    </span>
  );
}

function DetailMetric({ label, value, accent = "default" }) {
  const accentClass =
    accent === "success"
      ? "border-emerald-200 bg-emerald-50"
      : accent === "danger"
        ? "border-rose-200 bg-rose-50"
        : "border-slate-200 bg-slate-50";

  return (
    <div className={`rounded-lg border px-4 py-4 ${accentClass}`}>
      <p className="text-xs font-semibold text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-xl font-black tracking-tight text-slate-950">{value}</p>
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function renderSelectedTransactionDetail(row) {
  if (!row) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
        Pilih salah satu transaksi di tabel untuk melihat detail lengkapnya di sini.
      </div>
    );
  }

  if (row.source === "aksesoris") {
    const items = Array.isArray(row.raw.items) ? row.raw.items : [];
    const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);

    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailItem label="Metode bayar" value={formatPaymentMethod(row.raw.metode_bayar)} />
          <DetailItem label="Kasir" value={formatCashierName(row.raw.kasir_id)} />
          <DetailItem label="Uang diterima" value={formatRupiah(row.raw.uang_diterima)} />
          <DetailItem label="Kembalian" value={formatRupiah(row.raw.kembalian)} />
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Item transaksi
              </p>
              <p className="mt-2 text-lg font-bold text-slate-950">{totalQty} item terjual</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => handlePrintTransaction(row.raw)}
                className="brand-button-primary"
              >
                Cetak Struk
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                Detail item transaksi ini belum tersedia.
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-950">{item.nama_produk}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.qty} x {formatRupiah(item.harga_satuan)}
                      </p>
                    </div>
                    <p className="font-bold text-slate-950">{formatRupiah(item.subtotal)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </>
    );
  }

  if (row.source === "digital") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailItem label="Jenis layanan" value={row.raw.jenis || "-"} />
        <DetailItem label="Provider" value={row.raw.provider || "-"} />
        <DetailItem label="Nomor tujuan" value={row.raw.nomor_tujuan || "-"} />
        <DetailItem label="Nama tujuan" value={row.raw.nama_tujuan || "-"} />
        <DetailItem
          label="Sumber saldo"
          value={
            row.raw.platform_sumber
              ? walletPlatformLabelMap[row.raw.platform_sumber] || row.raw.platform_sumber
              : "-"
          }
        />
        <DetailItem label="Nominal dasar" value={formatRupiah(row.raw.nominal)} />
      </div>
    );
  }

  if (row.source === "logistik") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailItem label="Kurir" value={row.raw.courier || row.raw.ekspedisi || "-"} />
        <DetailItem label="Penerima" value={row.raw.receiver || row.raw.receiver_name || "-"} />
        <DetailItem label="Tujuan" value={row.raw.destination || "-"} />
        <DetailItem label="Jenis paket" value={row.raw.packageType || row.raw.package_type || "-"} />
        <DetailItem label="Berat" value={`${Number(row.raw.weight || 0)} kg`} />
        <DetailItem label="Ongkir" value={formatRupiah(row.raw.price || row.raw.harga_jual)} />
        <DetailItem
          label="Metode"
          value={
            walletPlatformLabelMap[
              row.raw.paymentMethod || row.raw.payment_method || row.raw.platform_sumber
            ] ||
            row.raw.paymentMethod ||
            row.raw.payment_method ||
            row.raw.platform_sumber ||
            "-"
          }
        />
        <DetailItem label="Pengirim" value={row.raw.sender || row.raw.sender_name || "-"} />
      </div>
    );
  }

  if (row.source === "saldo") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailItem
          label="Jenis mutasi"
          value={walletTransactionTypeLabelMap[row.raw.jenis] || row.raw.jenis || "-"}
        />
        <DetailItem
          label="Platform asal"
          value={walletPlatformLabelMap[row.raw.platform] || row.raw.platform || "-"}
        />
        <DetailItem
          label="Platform tujuan"
          value={
            row.raw.platform_tujuan
              ? walletPlatformLabelMap[row.raw.platform_tujuan] || row.raw.platform_tujuan
              : "-"
          }
        />
        <DetailItem label="Biaya admin" value={formatRupiah(row.raw.biaya_admin)} />
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <DetailItem label="Jenis arus kas" value={row.raw.jenis || "-"} />
      <DetailItem
        label="Kategori"
        value={cashCategoryLabelMap[row.raw.kategori] || row.raw.kategori || "-"}
      />
      <DetailItem label="Tanggal kas" value={row.raw.tanggal || "-"} />
      <DetailItem label="Nominal" value={formatRupiah(row.raw.nominal)} />
    </div>
  );
}

export default function RiwayatTransaksiPage() {
  const { user } = useAuth();
  const {
    accessoryTransactions,
    digitalTransactions,
    deletedTransactions,
    logisticsTransactions,
    cashEntries,
    deleteTransactionHistory,
    restoreTransactionHistory,
    permanentlyDeleteTransactionHistory,
    purgeExpiredDeletedTransactions,
  } = useTransactions();
  const { products } = useProducts();
  const { staffUsers } = useShift();
  const { walletTransactions } = useWallet();
  const {
    isPinModalOpen,
    closePinModal,
    executeSensitiveAction,
    executeConfirmedAction,
    actionDescription,
  } = usePinConfirmation();
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState("semua");
  const [flowFilter, setFlowFilter] = useState("semua");
  const [paymentFilter, setPaymentFilter] = useState("semua");
  const [period, setPeriod] = useState("30");
  const [dateRange, setDateRange] = useState(() => getPresetRange("30"));
  const [selectedId, setSelectedId] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [processingCleanup, setProcessingCleanup] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [deletedPage, setDeletedPage] = useState(1);
  const canManageTransactionHistory = user?.role === "pemilik";

  const userNameById = useMemo(
    () => new Map((staffUsers || []).map((staff) => [staff.id, staff.nama])),
    [staffUsers]
  );

  const paymentOptions = useMemo(() => {
    const values = new Set(
      accessoryTransactions
        .map((transaction) => String(transaction.metode_bayar || "").toLowerCase())
        .filter(Boolean)
    );

    PAYMENT_METHODS.forEach((method) => values.add(method));

    return [
      { value: "semua", label: "Semua metode" },
      ...[...values].map((value) => ({
        value,
        label: formatPaymentMethod(value),
      })),
    ];
  }, [accessoryTransactions]);

  const startDate = useMemo(() => {
    if (period === "all") return null;
    return parseDateInput(dateRange.startDate);
  }, [dateRange.startDate, period]);

  const endDate = useMemo(() => {
    if (period === "all") return null;
    return parseDateInput(dateRange.endDate);
  }, [dateRange.endDate, period]);

  const normalizedRange = useMemo(() => {
    if (!startDate && !endDate) {
      return { startDate: null, endDate: null };
    }

    if (startDate && endDate && startDate > endDate) {
      return {
        startDate: endDate,
        endDate: new Date(startDate.getTime() + 86399999),
      };
    }

    return {
      startDate,
      endDate: endDate ? new Date(endDate.getTime() + 86399999) : null,
    };
  }, [endDate, startDate]);
  const historyQueryRange = useMemo(
    () => ({
      startDate: normalizedRange.startDate ? formatDateInput(normalizedRange.startDate) : "",
      endDate: normalizedRange.endDate ? formatDateInput(normalizedRange.endDate) : "",
    }),
    [normalizedRange.endDate, normalizedRange.startDate]
  );
  const rawHistoryRows = useMemo(
    () => ({
      accessoryTransactions,
      digitalTransactions,
      logisticsTransactions,
      walletTransactions,
      cashEntries,
    }),
    [
      accessoryTransactions,
      cashEntries,
      digitalTransactions,
      logisticsTransactions,
      walletTransactions,
    ]
  );
  const serverHistoryPage = usePagedTransactionHistoryRows({
    search: searchTerm,
    sourceFilter,
    flowFilter,
    paymentFilter,
    dateRange: historyQueryRange,
    rawRows: rawHistoryRows,
    pageSize: HISTORY_PAGE_SIZE,
  });
  const usingServerHistory = !serverHistoryPage.error;

  const reportRangeLabel = useMemo(
    () => formatReportRangeLabel(normalizedRange.startDate, normalizedRange.endDate),
    [normalizedRange.endDate, normalizedRange.startDate]
  );

  const allRows = useMemo(
    () => {
      if (usingServerHistory) return [];

      return buildHistoryRows({
        accessoryTransactions,
        digitalTransactions,
        logisticsTransactions,
        walletTransactions,
        cashEntries,
        products,
      });
    },
    [
      accessoryTransactions,
      cashEntries,
      digitalTransactions,
      logisticsTransactions,
      products,
      usingServerHistory,
      walletTransactions,
    ]
  );

  const deletedRows = useMemo(
    () => buildDeletedHistoryRows(deletedTransactions || [], products),
    [deletedTransactions, products]
  );

  const deletedStats = useMemo(
    () => ({
      total: deletedRows.length,
      expiringSoon: deletedRows.filter((row) => getDaysLeft(row.deletedAt) <= 7).length,
      expired: deletedRows.filter((row) => getDaysLeft(row.deletedAt) === 0).length,
    }),
    [deletedRows]
  );

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return allRows.filter((row) => {
      const matchesSearch = keyword ? row.searchableText.includes(keyword) : true;
      const matchesSource = sourceFilter === "semua" ? true : row.source === sourceFilter;
      const matchesFlow = flowFilter === "semua" ? true : row.flow === flowFilter;
      const matchesPayment =
        paymentFilter === "semua" ? true : row.paymentMethod === paymentFilter;
      const matchesDate = isInDateRange(
        row.dateFilterValue,
        normalizedRange.startDate,
        normalizedRange.endDate
      );

      return matchesSearch && matchesSource && matchesFlow && matchesPayment && matchesDate;
    });
  }, [
    allRows,
    flowFilter,
    normalizedRange.endDate,
    normalizedRange.startDate,
    paymentFilter,
    searchTerm,
    sourceFilter,
  ]);
  const historyPageCount = Math.max(1, Math.ceil(filteredRows.length / HISTORY_PAGE_SIZE));
  const paginatedRows = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return filteredRows.slice(start, start + HISTORY_PAGE_SIZE);
  }, [filteredRows, historyPage]);
  const displayedRows = usingServerHistory ? serverHistoryPage.rows : paginatedRows;
  const displayedHistoryPage = usingServerHistory ? serverHistoryPage.page : historyPage;
  const displayedHistoryPageCount = usingServerHistory
    ? serverHistoryPage.pageCount
    : historyPageCount;
  const displayedHistoryFrom = usingServerHistory
    ? serverHistoryPage.from
    : filteredRows.length
      ? (historyPage - 1) * HISTORY_PAGE_SIZE + 1
      : 0;
  const displayedHistoryTo = usingServerHistory
    ? serverHistoryPage.to
    : Math.min(historyPage * HISTORY_PAGE_SIZE, filteredRows.length);
  const displayedHistoryCount = usingServerHistory
    ? serverHistoryPage.count
    : filteredRows.length;
  const setDisplayedHistoryPage = usingServerHistory ? serverHistoryPage.setPage : setHistoryPage;
  const deletedPageCount = Math.max(1, Math.ceil(deletedRows.length / DELETED_PAGE_SIZE));
  const paginatedDeletedRows = useMemo(() => {
    const start = (deletedPage - 1) * DELETED_PAGE_SIZE;
    return deletedRows.slice(start, start + DELETED_PAGE_SIZE);
  }, [deletedPage, deletedRows]);

  useEffect(() => {
    setHistoryPage(1);
  }, [
    dateRange.endDate,
    dateRange.startDate,
    flowFilter,
    paymentFilter,
    period,
    searchTerm,
    sourceFilter,
  ]);

  useEffect(() => {
    if (historyPage > historyPageCount) {
      setHistoryPage(historyPageCount);
    }
  }, [historyPage, historyPageCount]);

  useEffect(() => {
    if (deletedPage > deletedPageCount) {
      setDeletedPage(deletedPageCount);
    }
  }, [deletedPage, deletedPageCount]);

  const summaryRows = usingServerHistory ? displayedRows : filteredRows;
  const summary = useMemo(
    () =>
      summaryRows.reduce(
        (acc, row) => {
          acc.total += 1;
          acc.income += row.incomeValue;
          acc.expense += row.expenseValue;
          acc.internal += row.internalValue;
          acc.profit += row.profitImpact;
          acc.bySource[row.source] = (acc.bySource[row.source] || 0) + 1;
          return acc;
        },
        {
          total: 0,
          income: 0,
          expense: 0,
          internal: 0,
          profit: 0,
          bySource: {},
        }
      ),
    [summaryRows]
  );

  const handleExportTransactions = async () => {
    const exportRows = usingServerHistory ? displayedRows : filteredRows;

    if (!exportRows.length) {
      showNotification("warning", "Tidak ada transaksi yang bisa diekspor untuk filter ini.");
      return;
    }

    try {
      const { exportExcel } = await import("../utils/transactionExport");
      const fileName = await exportExcel(
          exportRows.map((row) => ({
          noTransaksi: row.reference,
          date: formatDateTime(row.occurredAt, { dateStyle: "medium" }),
          cashier: row.raw?.kasir_id || row.raw?.cashier || row.raw?.kasir_id,
          summary: row.summary,
          product: row.summary,
          qty: row.raw?.items?.length
            ? row.raw.items.reduce((sum, item) => sum + Number(item.qty || 0), 0)
            : 1,
          price:
            row.raw?.items?.length === 1
              ? row.raw.items[0].harga_satuan
              : row.amount,
          payments: row.raw?.payments || [],
          paymentMethod: row.paymentMethod ? formatPaymentMethod(row.paymentMethod) : "-",
          amount: row.amount,
        })),
        {
          reportRange: reportRangeLabel,
          fileName: `Laporan_Transaksi_POS_${formatDateInput(new Date())}.xlsx`,
        }
      );

      showNotification(
        "success",
        `${exportRows.length} transaksi berhasil diekspor ke file ${fileName}.`
      );
    } catch (error) {
      showNotification("error", error.message || "Gagal mengekspor transaksi ke Excel.");
    }
  };

  const getDeletedBy = (row) => {
    if (!row?.deletedBy) return "-";
    return userNameById.get(row.deletedBy) || formatCashierName(row.deletedBy);
  };

  const confirmTransactionAction = async () => {
    if (!pendingAction) return;

    const { type, row } = pendingAction;
    const transactionLabel = row.reference || row.summary || "Transaksi";

    try {
      await executeSensitiveAction(
        async () => {
          if (type === "delete") {
            await deleteTransactionHistory({
              source: row.source,
              id: row.raw.id,
              reason: `Void dari halaman riwayat: ${transactionLabel}`,
            });
            if (selectedId === row.id) {
              setSelectedId(null);
            }
          } else if (type === "restore") {
            await restoreTransactionHistory({ source: row.source, id: row.raw.id });
          } else {
            await permanentlyDeleteTransactionHistory({ source: row.source, id: row.raw.id });
          }
        },
        type === "delete"
          ? "TRANSACTION.DELETE"
          : type === "restore"
            ? "TRANSACTION.RESTORE"
            : "TRANSACTION.PERMANENT_DELETE"
      );

      showNotification(
        "success",
        type === "delete"
          ? `${transactionLabel} berhasil di-void. Reversal stok/wallet dicatat otomatis.`
          : type === "restore"
            ? `${transactionLabel} berhasil direstore ke riwayat aktif.`
            : `${transactionLabel} dihapus permanen.`
      );
      setPendingAction(null);
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Aksi riwayat transaksi gagal.");
    }
  };

  const runDeletedTransactionCleanup = async () => {
    setProcessingCleanup(true);
    try {
      const deletedCount = await executeSensitiveAction(
        async () => await purgeExpiredDeletedTransactions(),
        "TRANSACTION.PERMANENT_DELETE"
      );
      showNotification(
        "success",
        deletedCount
          ? `${deletedCount} transaksi lama dibersihkan.`
          : "Hard delete transaksi production dimatikan. Transaksi void tetap menjadi arsip audit."
      );
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Gagal membersihkan riwayat terhapus.");
    } finally {
      setProcessingCleanup(false);
    }
  };

  const selectedRow = useMemo(
    () =>
      displayedRows.find((row) => row.id === selectedId) ||
      filteredRows.find((row) => row.id === selectedId) ||
      null,
    [displayedRows, filteredRows, selectedId]
  );

  useEffect(() => {
    if (!displayedRows.length) {
      setSelectedId(null);
      return;
    }

    if (![...displayedRows, ...filteredRows].some((row) => row.id === selectedId)) {
      setSelectedId(displayedRows[0].id);
    }
  }, [displayedRows, filteredRows, selectedId]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Semua Aktivitas"
        title="Riwayat transaksi"
        description="Penjualan, layanan, logistik, mutasi saldo, dan kas operasional dalam satu daftar pengecekan."
        icon="history"
        actions={
          <>
            <button
              type="button"
              onClick={handleExportTransactions}
              disabled={!filteredRows.length}
              className="brand-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export Excel
            </button>
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setPeriod(option.key);
                  setDateRange(getPresetRange(option.key));
                }}
                className={period === option.key ? "brand-button-primary" : "brand-button-secondary"}
              >
                {option.label}
              </button>
            ))}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          label="Aktivitas tampil"
          value={String(summary.total)}
          helper="Semua transaksi yang lolos filter aktif."
        />
        <MetricCard
          label="Pemasukan tercatat"
          value={formatRupiah(summary.income)}
          helper="Penjualan, layanan, logistik, dan kas masuk."
          accent="success"
        />
        <MetricCard
          label="Pengeluaran & biaya"
          value={formatRupiah(summary.expense)}
          helper="Kas keluar plus biaya admin saldo."
          accent="danger"
        />
        <MetricCard
          label="Laba dampak"
          value={formatRupiah(summary.profit)}
          helper="Estimasi setelah modal dan biaya tercatat."
        />
      </div>

      <Panel className="p-6">
        <div className="grid gap-4 xl:grid-cols-[1.4fr_220px_220px_220px]">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Cari no transaksi, produk, provider, resi, catatan, atau tujuan..."
            className="brand-input"
          />
          <select
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
            className="brand-select"
          >
            {SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-white">
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={flowFilter}
            onChange={(event) => setFlowFilter(event.target.value)}
            className="brand-select"
          >
            {FLOW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-white">
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={paymentFilter}
            onChange={(event) => setPaymentFilter(event.target.value)}
            className="brand-select"
          >
            {paymentOptions.map((option) => (
              <option key={option.value} value={option.value} className="bg-white">
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[220px_220px_1fr_auto]">
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(event) => {
              setPeriod("custom");
              setDateRange((prev) => ({ ...prev, startDate: event.target.value }));
            }}
            className="brand-input"
          />
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(event) => {
              setPeriod("custom");
              setDateRange((prev) => ({ ...prev, endDate: event.target.value }));
            }}
            className="brand-input"
          />

          <div className="flex flex-wrap gap-2">
            {Object.entries(sourceAppearance).map(([key, appearance]) => (
              <span
                key={key}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600"
              >
                {appearance.label}: {summary.bySource[key] || 0}
              </span>
            ))}
            <span className="rounded-full border border-[var(--brand-gold)]/18 bg-[var(--brand-gold)]/10 px-3 py-2 text-xs font-semibold text-slate-700">
              Mutasi internal: {formatRupiah(summary.internal)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setSearchTerm("");
              setSourceFilter("semua");
              setFlowFilter("semua");
              setPaymentFilter("semua");
              setPeriod("30");
              setDateRange(getPresetRange("30"));
            }}
            className="brand-button-secondary"
          >
            Reset Filter
          </button>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.22fr)_390px]">
        <Panel className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-5">
            <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
              Daftar transaksi
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Klik salah satu baris untuk membuka detail di panel kanan.
            </p>
          </div>

          <div className="space-y-3 p-4 md:hidden">
            {displayedRows.length === 0 ? (
              <div className="brand-empty-state py-8 text-sm text-slate-500">
                Tidak ada transaksi yang cocok dengan filter aktif.
              </div>
            ) : (
              displayedRows.map((row) => (
                <article
                  key={`mobile-${row.id}`}
                  className={`rounded-lg border p-4 ${
                    selectedId === row.id
                      ? "border-[var(--brand-gold)] bg-[var(--brand-surface-tint)]"
                      : "border-[var(--border-muted)] bg-[var(--surface)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <SourceBadge source={row.source} />
                      <FlowBadge flow={row.flow} />
                    </div>
                    <p className="text-right text-sm font-bold text-slate-950">
                      {formatRupiah(row.amount)}
                    </p>
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-950">{row.reference}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{row.summary}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    {formatDateTime(row.occurredAt, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className="brand-button-secondary flex-1"
                    >
                      Detail
                    </button>
                    {canManageTransactionHistory ? (
                      <button
                        type="button"
                        onClick={() => setPendingAction({ type: "delete", row })}
                        className="brand-button-danger flex-1"
                      >
                        Void
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="brand-scrollbar hidden overflow-x-auto md:block">
            <table className="brand-table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Kanal</th>
                  <th>Ringkasan</th>
                  <th className="text-right">Nominal</th>
                  <th className="text-right">Dampak laba</th>
                  <th className="brand-table-action-cell text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-14 text-center text-slate-500">
                      Tidak ada transaksi yang cocok dengan filter aktif.
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((row) => {
                    const isActive = selectedId === row.id;

                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedId(row.id)}
                        className={`cursor-pointer transition ${
                          isActive ? "bg-[var(--brand-gold)]/10" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="text-slate-600">
                          <p className="font-semibold text-slate-950">
                            {formatDateTime(row.occurredAt, {
                              dateStyle: "medium",
                            })}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDateTime(row.occurredAt, {
                              timeStyle: "short",
                            })}
                          </p>
                        </td>
                        <td>
                          <div className="flex flex-col gap-2">
                            <SourceBadge source={row.source} />
                            <FlowBadge flow={row.flow} />
                          </div>
                        </td>
                        <td>
                          <p className="font-semibold text-slate-950">{row.reference}</p>
                          <p className="mt-1 text-sm text-slate-700">{row.summary}</p>
                          <p className="mt-1 text-xs text-slate-500">{row.caption}</p>
                        </td>
                        <td className="text-right font-semibold text-slate-950">
                          {formatRupiah(row.amount)}
                        </td>
                        <td
                          className={`text-right font-semibold ${
                            row.profitImpact < 0
                              ? "text-rose-600"
                              : row.profitImpact > 0
                                ? "text-emerald-700"
                                : "text-slate-500"
                          }`}
                        >
                          {formatSignedCurrency(row.profitImpact)}
                        </td>
                        <td className="brand-table-action-cell">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedId(row.id);
                              }}
                              className="brand-button-secondary px-3 py-2"
                            >
                              {isActive ? "Dipilih" : "Detail"}
                            </button>
                            {canManageTransactionHistory ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setPendingAction({ type: "delete", row });
                                }}
                                className="brand-button-danger min-h-[40px] px-3 py-2"
                              >
                                Void
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={displayedHistoryPage}
            pageCount={displayedHistoryPageCount}
            from={displayedHistoryFrom}
            to={displayedHistoryTo}
            count={displayedHistoryCount}
            onPageChange={setDisplayedHistoryPage}
          />
        </Panel>

        <Panel variant="strong" className="p-6 xl:sticky xl:top-6 xl:self-start">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand-gold)]">
                Detail transaksi
              </p>
              <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
                {selectedRow ? selectedRow.reference : "Belum ada pilihan"}
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {selectedRow
                  ? formatDateTime(selectedRow.occurredAt, {
                      dateStyle: "full",
                      timeStyle: "short",
                    })
                  : "Pilih transaksi dari tabel untuk melihat detail lengkap."}
              </p>
            </div>

            {selectedRow ? <SourceBadge source={selectedRow.source} /> : null}
          </div>

          {selectedRow ? (
            <>
              <div className="mt-5 flex flex-wrap gap-2">
                <FlowBadge flow={selectedRow.flow} />
                {selectedRow.source === "aksesoris" ? (
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {formatPaymentMethod(selectedRow.raw.metode_bayar)}
                  </span>
                ) : null}
              </div>

              <div className="mt-5">
                <p className="text-xl font-black tracking-tight text-slate-950">
                  {selectedRow.summary}
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-600">{selectedRow.caption}</p>
              </div>

              <div className="mt-5 grid gap-3">
                <DetailMetric label="Nominal" value={formatRupiah(selectedRow.amount)} />
                <DetailMetric
                  label={selectedRow.secondaryLabel}
                  value={formatRupiah(selectedRow.secondaryAmount)}
                />
                <DetailMetric
                  label="Dampak laba"
                  value={formatSignedCurrency(selectedRow.profitImpact)}
                  accent={
                    selectedRow.profitImpact < 0
                      ? "danger"
                      : selectedRow.profitImpact > 0
                        ? "success"
                        : "default"
                  }
                />
              </div>

              <div className="mt-5 border-t border-slate-200 pt-5">
                {renderSelectedTransactionDetail(selectedRow)}
              </div>

              {selectedRow.note ? (
                <div className="mt-5 rounded-lg border border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Catatan
                  </p>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{selectedRow.note}</p>
                </div>
              ) : null}
            </>
          ) : (
            renderSelectedTransactionDetail(selectedRow)
          )}
        </Panel>
      </div>

      {canManageTransactionHistory ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Transaksi void"
              value={String(deletedStats.total)}
              helper="Arsip audit transaksi yang dibatalkan."
            />
            <MetricCard
              label="Perlu review"
              value={String(deletedStats.expiringSoon)}
              helper="Void terbaru yang perlu dicek owner."
              accent="gold"
            />
            <MetricCard
              label="Audit terkunci"
              value={String(deletedStats.expired)}
              helper="Hard delete production tidak tersedia."
              accent="danger"
            />
          </div>

          <Panel className="overflow-hidden p-0">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand-gold)]">
                  Void ledger transaksi
                </p>
                <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
                  Transaksi void
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Transaksi yang dibatalkan tetap tersimpan sebagai audit trail dan reversal operasional.
                </p>
              </div>
              <button
                type="button"
                onClick={runDeletedTransactionCleanup}
                disabled={processingCleanup}
                className="brand-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processingCleanup ? "Mengecek..." : "Cek hard-delete"}
              </button>
            </div>

            <div className="brand-scrollbar overflow-x-auto">
              <table className="brand-table">
                <thead>
                  <tr>
                    <th>Tanggal void</th>
                    <th>Kanal</th>
                    <th>Transaksi</th>
                    <th className="text-right">Nominal</th>
                    <th>Diproses oleh</th>
                    <th>Status audit</th>
                    <th className="text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedRows.length ? (
                    paginatedDeletedRows.map((row) => {
                      const daysLeft = getDaysLeft(row.deletedAt);

                      return (
                        <tr key={row.id}>
                          <td className="text-slate-600">
                            {row.deletedAt
                              ? formatDateTime(row.deletedAt, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })
                              : "-"}
                          </td>
                          <td>
                            <div className="flex flex-col gap-2">
                              <SourceBadge source={row.source} />
                              <FlowBadge flow={row.flow} />
                            </div>
                          </td>
                          <td>
                            <p className="font-semibold text-slate-950">{row.reference}</p>
                            <p className="mt-1 text-sm text-slate-700">{row.summary}</p>
                            <p className="mt-1 text-xs text-slate-500">{row.caption}</p>
                          </td>
                          <td className="text-right font-semibold text-slate-950">
                            {formatRupiah(row.amount)}
                          </td>
                          <td className="text-slate-600">{getDeletedBy(row)}</td>
                          <td>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                daysLeft <= 7
                                  ? "bg-[var(--brand-gold)]/18 text-[var(--brand-gold)]"
                                  : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              Void terkunci
                            </span>
                          </td>
                          <td>
                            <div className="flex flex-wrap justify-end gap-2">
                              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
                                Reversal audit
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="7" className="px-6 py-14 text-center text-slate-500">
                        Belum ada transaksi void. Riwayat aktif masih utuh.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={deletedPage}
              pageCount={deletedPageCount}
              from={deletedRows.length ? (deletedPage - 1) * DELETED_PAGE_SIZE + 1 : 0}
              to={Math.min(deletedPage * DELETED_PAGE_SIZE, deletedRows.length)}
              count={deletedRows.length}
              onPageChange={setDeletedPage}
            />
          </Panel>
        </>
      ) : null}

      {pendingAction ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <div className="brand-panel brand-modal-sm brand-modal-destructive p-6 shadow-2xl" role="dialog" aria-modal="true">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
              Konfirmasi transaksi
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
              {pendingAction.type === "delete"
                ? "Void transaksi?"
                : pendingAction.type === "restore"
                  ? "Restore transaksi?"
                  : "Hapus permanen?"}
            </h2>
            <div className="mt-4 rounded-lg border border-[var(--border-muted)] bg-[var(--surface-secondary)] px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Target</p>
              <p className="mt-1 break-words text-sm font-bold text-slate-950">
                {pendingAction.row.reference || pendingAction.row.raw?.id}
              </p>
            </div>
            <div className="brand-modal-consequence mt-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em]">Konsekuensi</p>
              <p className="mt-1">
                {pendingAction.type === "delete"
                  ? "Transaksi dibatalkan dengan reversal stok/wallet, sementara audit tetap immutable."
                  : pendingAction.type === "restore"
                    ? "Transaksi kembali muncul di riwayat aktif."
                    : "Transaksi dihapus permanen dan tidak dapat direstore."}
              </p>
            </div>
            <p className="mt-3 text-sm font-semibold text-[var(--warning)]">
              Verifikasi PIN pemilik diwajibkan sebelum perubahan disimpan.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="brand-button-secondary"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmTransactionAction}
                className={
                  pendingAction.type === "restore"
                    ? "brand-button-success"
                    : "brand-button-danger"
                }
              >
                {pendingAction.type === "delete"
                  ? "Void"
                  : pendingAction.type === "restore"
                    ? "Restore"
                    : "Hapus permanen"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PinConfirmationModal
        isOpen={isPinModalOpen}
        onClose={closePinModal}
        onConfirm={async () => {
          try {
            await executeConfirmedAction();
          } catch (error) {
            if (isPinActionCancelledError(error)) return;
            showNotification("error", error.message || "Verifikasi PIN gagal.");
          }
        }}
        title="Konfirmasi PIN"
        message={`Masukkan PIN untuk lanjut: ${actionDescription}`}
      />
    </div>
  );
}

