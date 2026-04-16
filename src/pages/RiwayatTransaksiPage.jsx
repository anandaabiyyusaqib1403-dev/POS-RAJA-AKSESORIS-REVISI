import { useEffect, useMemo, useState } from "react";
import MetricCard from "../components/app/MetricCard";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { useData } from "../contexts/DataContext";
import { showNotification } from "../contexts/NotificationContext";
import {
  cashCategoryLabelMap,
  serviceTypeLabelMap,
  walletPlatformLabelMap,
  walletTransactionTypeLabelMap,
} from "../data/businessOptions";
import {
  formatDateInput,
  formatDateTime,
  formatRupiah,
  parseDateInput,
} from "../utils/format";
import { formatCashierName } from "../utils/cashier";
import { generateReceiptHTML } from "../utils/print";
import { exportExcel } from "../utils/transactionExport";

const PERIOD_OPTIONS = [
  { key: "today", label: "Hari Ini" },
  { key: "7", label: "7 Hari" },
  { key: "30", label: "30 Hari" },
  { key: "all", label: "Semua" },
];

const SOURCE_OPTIONS = [
  { value: "semua", label: "Semua channel" },
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

const paymentMethodLabelMap = {
  cash: "Cash",
  tunai: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
  dana: "DANA",
  bank_mas: "Bank Mas",
  wahana: "Wahana",
  pasar_kuota: "PASAR KUOTA",
  shopee: "Shopee",
  bca: "BCA",
};

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

function getPresetRange(period) {
  if (period === "all") {
    return { startDate: "", endDate: "" };
  }

  const endDate = new Date();
  const startDate = new Date(endDate);

  if (period === "today") {
    return {
      startDate: formatDateInput(startDate),
      endDate: formatDateInput(endDate),
    };
  }

  startDate.setDate(endDate.getDate() - (Number(period) - 1));
  return {
    startDate: formatDateInput(startDate),
    endDate: formatDateInput(endDate),
  };
}

function toDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const rawValue = String(value);
  if (rawValue.includes("T")) {
    return new Date(rawValue);
  }

  const parsedDate = parseDateInput(rawValue);
  return parsedDate ? new Date(parsedDate.getTime() + 12 * 60 * 60 * 1000) : null;
}

function isInDateRange(value, startDate, endDate) {
  const dateValue = toDateTime(value);
  if (!dateValue) return true;
  if (startDate && dateValue < startDate) return false;
  if (endDate && dateValue > endDate) return false;
  return true;
}

function buildSearchText(values) {
  return values
    .flat()
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(" ");
}

function formatPaymentMethod(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return paymentMethodLabelMap[normalized] || normalized || "-";
}

function formatSignedCurrency(value) {
  if (!value) return formatRupiah(0);
  return value > 0 ? `+${formatRupiah(value)}` : `-${formatRupiah(Math.abs(value))}`;
}

function getOptionLabel(options, value) {
  const option = options.find((entry) => entry.value === value || entry.key === value);
  return option?.label || value;
}

function formatReportRangeLabel(startDate, endDate) {
  if (!startDate && !endDate) {
    return "Semua periode";
  }

  const singleDate = startDate || endDate;
  if (!startDate || !endDate) {
    return formatDateTime(singleDate, { dateStyle: "medium" });
  }

  const startLabel = formatDateTime(startDate, { dateStyle: "medium" });
  const endLabel = formatDateTime(endDate, { dateStyle: "medium" });
  return startLabel === endLabel ? startLabel : `${startLabel} s/d ${endLabel}`;
}

function getWalletFlow(transactionType) {
  if (transactionType === "masuk") return "masuk";
  if (transactionType === "keluar") return "keluar";
  return "internal";
}

function handlePrintTransaction(transaction) {
  const printWindow = window.open("", "_blank", "width=420,height=760");

  if (!printWindow) {
    showNotification("error", "Popup print diblokir browser. Izinkan popup lalu coba lagi.");
    return;
  }

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };

  printWindow.document.open();
  printWindow.document.write(generateReceiptHTML(transaction));
  printWindow.document.close();
}

function buildHistoryRows({
  accessoryTransactions,
  digitalTransactions,
  logisticsTransactions,
  walletTransactions,
  cashEntries,
  products,
}) {
  const productCostMap = new Map(
    products.map((product) => [product.id, Number(product.harga_beli || 0)])
  );

  const accessoryRows = accessoryTransactions.map((transaction) => {
    const items = Array.isArray(transaction.items) ? transaction.items : [];
    const itemCount = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const cost = items.reduce(
      (sum, item) =>
        sum + (productCostMap.get(item.produk_id) || 0) * Number(item.qty || 0),
      0
    );
    const amount = Number(transaction.total_bayar || 0);
    const profit = amount - cost;
    const itemNames = items.map((item) => item.nama_produk).filter(Boolean);

    return {
      id: `aks-${transaction.id}`,
      source: "aksesoris",
      flow: "masuk",
      occurredAt: transaction.created_at,
      dateFilterValue: transaction.created_at,
      reference: transaction.no_transaksi || `TRX-${transaction.id}`,
      summary: itemNames[0] || "Penjualan aksesoris",
      caption: `${itemCount} item - ${formatPaymentMethod(transaction.metode_bayar)}`,
      amount,
      secondaryAmount: cost,
      secondaryLabel: "Modal estimasi",
      incomeValue: amount,
      expenseValue: 0,
      internalValue: 0,
      profitImpact: profit,
      paymentMethod: String(transaction.metode_bayar || "").toLowerCase(),
      note: transaction.catatan || "",
      raw: transaction,
      searchableText: buildSearchText([
        transaction.no_transaksi,
        transaction.catatan,
        transaction.metode_bayar,
        transaction.kasir_id,
        itemNames,
      ]),
    };
  });

  const digitalRows = digitalTransactions.map((transaction) => {
    const amount = Number(transaction.harga_jual || 0);
    const modal = Number(transaction.modal || 0);
    const profit =
      typeof transaction.keuntungan === "number" ? transaction.keuntungan : amount - modal;

    return {
      id: `dig-${transaction.id}`,
      source: "digital",
      flow: "masuk",
      occurredAt: transaction.created_at,
      dateFilterValue: transaction.created_at,
      reference: transaction.no_transaksi || `LYN-${transaction.id}`,
      summary: serviceTypeLabelMap[transaction.jenis] || transaction.jenis || "Layanan digital",
      caption: [transaction.provider, transaction.nomor_tujuan].filter(Boolean).join(" - ") || "-",
      amount,
      secondaryAmount: modal,
      secondaryLabel: "Modal",
      incomeValue: amount,
      expenseValue: 0,
      internalValue: 0,
      profitImpact: profit,
      paymentMethod: "",
      note: transaction.catatan || "",
      raw: transaction,
      searchableText: buildSearchText([
        transaction.no_transaksi,
        serviceTypeLabelMap[transaction.jenis] || transaction.jenis,
        transaction.provider,
        transaction.nomor_tujuan,
        transaction.nama_tujuan,
        transaction.platform_sumber,
        transaction.catatan,
      ]),
    };
  });

  const logisticsRows = logisticsTransactions.map((transaction) => {
    const amount = Number(transaction.price || transaction.harga_jual || 0);
    const modal = Number(transaction.modal || 0);
    const profit =
      typeof transaction.keuntungan === "number" ? transaction.keuntungan : amount - modal;
    const courier = transaction.courier || transaction.ekspedisi || "Transaksi logistik";
    const receiver = transaction.receiver || transaction.receiver_name || "";
    const paymentMethod =
      transaction.paymentMethod || transaction.payment_method || transaction.platform_sumber;

    return {
      id: `log-${transaction.id}`,
      source: "logistik",
      flow: "masuk",
      occurredAt: transaction.created_at,
      dateFilterValue: transaction.created_at,
      reference: transaction.no_transaksi || `LOG-${transaction.id}`,
      summary: courier,
      caption: receiver ? `${receiver} - ${transaction.destination || "-"}` : transaction.destination || "-",
      amount,
      secondaryAmount: Number(transaction.weight || 0),
      secondaryLabel: "Berat kg",
      incomeValue: amount,
      expenseValue: 0,
      internalValue: 0,
      profitImpact: profit,
      paymentMethod: paymentMethod || "",
      note: transaction.catatan || "",
      raw: transaction,
      searchableText: buildSearchText([
        transaction.no_transaksi,
        courier,
        receiver,
        transaction.destination,
        transaction.packageType || transaction.package_type,
        paymentMethod,
        transaction.no_resi,
        transaction.catatan,
      ]),
    };
  });

  const walletRows = walletTransactions.map((transaction) => {
    const amount = Number(transaction.nominal || 0);
    const fee = Number(transaction.biaya_admin || 0);
    const platformLabel = walletPlatformLabelMap[transaction.platform] || transaction.platform;
    const targetLabel = transaction.platform_tujuan
      ? walletPlatformLabelMap[transaction.platform_tujuan] || transaction.platform_tujuan
      : null;

    return {
      id: `wal-${transaction.id}`,
      source: "saldo",
      flow: getWalletFlow(transaction.jenis),
      occurredAt: transaction.created_at,
      dateFilterValue: transaction.created_at,
      reference: `DOMPET-${String(transaction.id).slice(0, 8).toUpperCase()}`,
      summary:
        walletTransactionTypeLabelMap[transaction.jenis] || transaction.jenis || "Mutasi saldo",
      caption: targetLabel ? `${platformLabel} -> ${targetLabel}` : platformLabel,
      amount,
      secondaryAmount: fee,
      secondaryLabel: "Biaya admin",
      incomeValue: 0,
      expenseValue: fee,
      internalValue: amount,
      profitImpact: -fee,
      paymentMethod: "",
      note: transaction.keterangan || "",
      raw: transaction,
      searchableText: buildSearchText([
        walletTransactionTypeLabelMap[transaction.jenis] || transaction.jenis,
        platformLabel,
        targetLabel,
        transaction.keterangan,
      ]),
    };
  });

  const cashRows = cashEntries.map((entry) => {
    const amount = Number(entry.nominal || 0);
    const categoryLabel = cashCategoryLabelMap[entry.kategori] || entry.kategori || "Kas";

    return {
      id: `kas-${entry.id}`,
      source: "operasional",
      flow: entry.jenis === "pemasukan" ? "masuk" : "keluar",
      occurredAt: entry.created_at || entry.tanggal,
      dateFilterValue: entry.tanggal || entry.created_at,
      reference: `KAS-${entry.tanggal || String(entry.id).slice(0, 8)}`,
      summary: categoryLabel,
      caption: entry.keterangan || entry.jenis || "-",
      amount,
      secondaryAmount: amount,
      secondaryLabel:
        entry.jenis === "pemasukan" ? "Masuk ke kas" : "Keluar dari kas",
      incomeValue: entry.jenis === "pemasukan" ? amount : 0,
      expenseValue: entry.jenis === "pengeluaran" ? amount : 0,
      internalValue: 0,
      profitImpact: entry.jenis === "pengeluaran" ? -amount : 0,
      paymentMethod: "",
      note: entry.keterangan || "",
      raw: entry,
      searchableText: buildSearchText([
        categoryLabel,
        entry.jenis,
        entry.keterangan,
        entry.tanggal,
      ]),
    };
  });

  return [
    ...accessoryRows,
    ...digitalRows,
    ...logisticsRows,
    ...walletRows,
    ...cashRows,
  ].sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt));
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
    <div className={`rounded-[24px] border px-4 py-4 ${accentClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-xl font-black tracking-tight text-slate-950">{value}</p>
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function renderSelectedTransactionDetail(row) {
  if (!row) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
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

        <div className="mt-5 rounded-[28px] border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Item transaksi
              </p>
              <p className="mt-2 text-lg font-bold text-slate-950">{totalQty} item terjual</p>
            </div>
            <button
              type="button"
              onClick={() => handlePrintTransaction(row.raw)}
              className="brand-button-primary"
            >
              Cetak Struk
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                Detail item transaksi ini belum tersedia.
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
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
        <DetailItem
          label="Jenis layanan"
          value={serviceTypeLabelMap[row.raw.jenis] || row.raw.jenis || "-"}
        />
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
  const {
    loading,
    products,
    accessoryTransactions,
    digitalTransactions,
    walletTransactions,
    logisticsTransactions,
    cashEntries,
  } = useData();
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState("semua");
  const [flowFilter, setFlowFilter] = useState("semua");
  const [paymentFilter, setPaymentFilter] = useState("semua");
  const [period, setPeriod] = useState("30");
  const [dateRange, setDateRange] = useState(() => getPresetRange("30"));
  const [selectedId, setSelectedId] = useState(null);

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

  const reportRangeLabel = useMemo(
    () => formatReportRangeLabel(normalizedRange.startDate, normalizedRange.endDate),
    [normalizedRange.endDate, normalizedRange.startDate]
  );

  const allRows = useMemo(
    () =>
      buildHistoryRows({
        accessoryTransactions,
        digitalTransactions,
        logisticsTransactions,
        walletTransactions,
        cashEntries,
        products,
      }),
    [
      accessoryTransactions,
      cashEntries,
      digitalTransactions,
      logisticsTransactions,
      products,
      walletTransactions,
    ]
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

  const summary = useMemo(
    () =>
      filteredRows.reduce(
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
    [filteredRows]
  );

  const handleExportTransactions = () => {
    if (!filteredRows.length) {
      showNotification("warning", "Tidak ada transaksi yang bisa diekspor untuk filter ini.");
      return;
    }

    try {
      const fileName = exportExcel(
        filteredRows.map((row) => ({
          date: formatDateTime(row.occurredAt, { dateStyle: "medium" }),
          time: formatDateTime(row.occurredAt, { timeStyle: "short" }),
          channel: sourceAppearance[row.source]?.label || row.source,
          flow: flowAppearance[row.flow]?.label || row.flow,
          reference: row.reference,
          summary: row.summary,
          detail: row.caption,
          paymentMethod: row.paymentMethod ? formatPaymentMethod(row.paymentMethod) : "-",
          amount: row.amount,
          secondaryLabel: row.secondaryLabel,
          secondaryAmount: row.secondaryAmount,
          profitImpact: row.profitImpact,
          note: row.note || "-",
        })),
        {
          title: "Laporan Transaksi POS Raja Aksesoris",
          sheetName: "Riwayat Transaksi",
          reportRange: reportRangeLabel,
          filterSummary: [
            `Pencarian: ${searchTerm.trim() || "Semua"}`,
            `Channel: ${getOptionLabel(SOURCE_OPTIONS, sourceFilter)}`,
            `Arus: ${getOptionLabel(FLOW_OPTIONS, flowFilter)}`,
            `Metode bayar: ${getOptionLabel(paymentOptions, paymentFilter)}`,
          ].join(" | "),
          fileName: `Laporan_Transaksi_POS_${formatDateInput(new Date())}.xlsx`,
        }
      );

      showNotification(
        "success",
        `${filteredRows.length} transaksi berhasil diekspor ke file ${fileName}.`
      );
    } catch (error) {
      showNotification("error", error.message || "Gagal mengekspor transaksi ke Excel.");
    }
  };

  const selectedRow = useMemo(
    () => filteredRows.find((row) => row.id === selectedId) || null,
    [filteredRows, selectedId]
  );

  useEffect(() => {
    if (!filteredRows.length) {
      setSelectedId(null);
      return;
    }

    if (!filteredRows.some((row) => row.id === selectedId)) {
      setSelectedId(filteredRows[0].id);
    }
  }, [filteredRows, selectedId]);

  if (loading) {
    return <div className="brand-panel px-6 py-10 text-slate-700">Memuat riwayat transaksi...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Semua Aktivitas"
        title="Riwayat transaksi"
        description="Semua penjualan, layanan, logistik, mutasi saldo, dan kas operasional saya satukan di sini supaya pengecekan harian jauh lebih cepat."
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

          <div className="brand-scrollbar overflow-x-auto">
            <table className="brand-table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Channel</th>
                  <th>Ringkasan</th>
                  <th className="text-right">Nominal</th>
                  <th className="text-right">Dampak laba</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-14 text-center text-slate-500">
                      Tidak ada transaksi yang cocok dengan filter aktif.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
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
                        <td>
                          <div className="flex justify-end">
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
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
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
                <div className="mt-5 rounded-[28px] border border-slate-200 bg-white px-4 py-4">
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
    </div>
  );
}
