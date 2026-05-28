import {
  cashCategoryLabelMap,
  walletPlatformLabelMap,
  walletTransactionTypeLabelMap,
} from "../../../data/businessOptions";
import { formatDateInput, formatDateTime, formatRupiah, parseDateInput } from "../../../utils/format";

export const RECYCLE_DAYS = 30;

const paymentMethodLabelMap = {
  cash: "Cash",
  tunai: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
  dana: "DANA",
  bank_mas: "Bank Mas",
  wahana: "Wahana",
  pasar_kuota: "PASAR KUOTA",
  shopee: "Shopee Pay",
  bca: "BCA",
};

export function getPresetRange(period) {
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

export function toDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const rawValue = String(value);
  if (rawValue.includes("T")) {
    return new Date(rawValue);
  }

  const parsedDate = parseDateInput(rawValue);
  return parsedDate ? new Date(parsedDate.getTime() + 12 * 60 * 60 * 1000) : null;
}

export function isInDateRange(value, startDate, endDate) {
  const dateValue = toDateTime(value);
  if (!dateValue) return true;
  if (startDate && dateValue < startDate) return false;
  if (endDate && dateValue > endDate) return false;
  return true;
}

export function buildSearchText(values) {
  return values
    .flat()
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(" ");
}

export function formatPaymentMethod(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "split") return "Split Payment";
  return walletPlatformLabelMap[normalized] || paymentMethodLabelMap[normalized] || normalized || "-";
}

export function formatSignedCurrency(value) {
  if (!value) return formatRupiah(0);
  return value > 0 ? `+${formatRupiah(value)}` : `-${formatRupiah(Math.abs(value))}`;
}

export function formatReportRangeLabel(startDate, endDate) {
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

export function getWalletFlow(transactionType) {
  if (transactionType === "masuk") return "masuk";
  if (transactionType === "keluar") return "keluar";
  return "internal";
}

export function getDaysLeft(deletedAt) {
  if (!deletedAt) return RECYCLE_DAYS;

  const deletedTime = new Date(deletedAt).getTime();
  if (!Number.isFinite(deletedTime)) return RECYCLE_DAYS;

  const expiresAt = deletedTime + RECYCLE_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function buildHistoryRows({
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
      summary: transaction.jenis || "Layanan digital",
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
        transaction.jenis,
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

export function buildDeletedHistoryRows(deletedTransactions, products) {
  const grouped = {
    accessoryTransactions: [],
    digitalTransactions: [],
    logisticsTransactions: [],
    walletTransactions: [],
    cashEntries: [],
  };
  const metaMap = new Map();

  deletedTransactions.forEach((entry) => {
    if (!entry?.raw?.id || !entry.source) return;

    const key = `${entry.source}:${entry.raw.id}`;
    metaMap.set(key, entry);

    if (entry.source === "aksesoris") {
      grouped.accessoryTransactions.push(entry.raw);
    } else if (entry.source === "digital") {
      grouped.digitalTransactions.push(entry.raw);
    } else if (entry.source === "logistik") {
      grouped.logisticsTransactions.push(entry.raw);
    } else if (entry.source === "saldo") {
      grouped.walletTransactions.push(entry.raw);
    } else if (entry.source === "operasional") {
      grouped.cashEntries.push(entry.raw);
    }
  });

  return buildHistoryRows({
    ...grouped,
    products,
  })
    .map((row) => {
      const meta = metaMap.get(`${row.source}:${row.raw.id}`);
      return {
        ...row,
        deletedAt: meta?.deleted_at || row.raw.deleted_at || null,
        deletedBy: meta?.deleted_by || row.raw.deleted_by || null,
      };
    })
    .sort((left, right) => new Date(right.deletedAt || 0) - new Date(left.deletedAt || 0));
}
