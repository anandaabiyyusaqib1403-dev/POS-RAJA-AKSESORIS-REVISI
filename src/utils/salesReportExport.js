import {
  serviceTypeLabelMap,
  walletAliasMap,
  walletPlatformLabelMap,
} from "../data/businessOptions";
import { productServiceCategoryIds, serviceCategories } from "../data/serviceProducts";
import { formatCashierName } from "./cashier";
import { formatDateInput, formatDateTime } from "./format";
import { loadExcelTools } from "./loadExcelTools";

const REPORT_TITLE = "LAPORAN PENJUALAN RAJA AKSESORIS";
const GOLD = "FFD4AF37";
const GOLD_SOFT = "FFFFF8E1";
const HEADER_TEXT = "FF0F172A";
const TEXT_MUTED = "FF64748B";
const BORDER_COLOR = "FFD1D5DB";
const CURRENCY_FORMAT = '"Rp" #,##0';
const NUMBER_FORMAT = "#,##0";
const DATE_FORMAT = "dd mmm yyyy hh:mm";
const PERCENT_FORMAT = "0.00%";

const TYPE_LABELS = {
  produk: "Produk",
  layanan: "Layanan",
  jasa: "Jasa",
};

const serviceCategoryLabelMap = serviceCategories.reduce((acc, category) => {
  acc[category.value] = category.label;
  return acc;
}, {});

const productServiceCategorySet = new Set(productServiceCategoryIds);
const bankPaymentIds = new Set([
  "bank",
  "transfer",
  "transfer_bank",
  "bca",
  "bank_mas",
  "mandiri",
  "bri",
  "bni",
  "bsi",
  "cimb_niaga",
  "permata",
]);
const ewalletPaymentIds = new Set([
  "ewallet",
  "e_wallet",
  "transfer_ewallet",
  "dana",
  "gopay",
  "go_pay",
  "shopee",
  "shopeepay",
  "ovo",
  "linkaja",
  "pasar_kuota",
  "wahana",
]);

const summaryColumns = [
  { key: "metric", header: "Metric", type: "text", width: 28, align: "left" },
  { key: "value", header: "Value", type: "mixed", width: 22, align: "right" },
];

const aggregateColumns = [
  { key: "label", header: "Nama", type: "text", width: 26, align: "left" },
  { key: "total_transactions", header: "Total Transaksi", type: "number", width: 18, align: "right" },
  { key: "total_revenue", header: "Total Omzet", type: "currency", width: 18, align: "right" },
  { key: "total_cost", header: "Total Modal", type: "currency", width: 18, align: "right" },
  { key: "total_profit", header: "Total Profit", type: "currency", width: 18, align: "right" },
  { key: "margin", header: "Margin", type: "percentage", width: 14, align: "right" },
];

const providerColumns = [
  { key: "category", header: "Category", type: "text", width: 22, align: "left" },
  { key: "provider", header: "Provider", type: "text", width: 22, align: "left" },
  { key: "total_transactions", header: "Total Transaksi", type: "number", width: 18, align: "right" },
  { key: "total_revenue", header: "Total Omzet", type: "currency", width: 18, align: "right" },
  { key: "total_cost", header: "Total Modal", type: "currency", width: 18, align: "right" },
  { key: "total_profit", header: "Total Profit", type: "currency", width: 18, align: "right" },
];

const paymentColumns = [
  { key: "payment_customer", header: "Metode Bayar", type: "text", width: 24, align: "left" },
  { key: "total_transactions", header: "Total Transaksi", type: "number", width: 18, align: "right" },
  { key: "total_revenue", header: "Total Omzet", type: "currency", width: 18, align: "right" },
];

const topProductColumns = [
  { key: "rank", header: "Rank", type: "number", width: 10, align: "center" },
  { key: "product_name", header: "Product Name", type: "text", width: 36, align: "left" },
  { key: "qty", header: "Qty Sold", type: "number", width: 14, align: "right" },
  { key: "revenue", header: "Revenue", type: "currency", width: 18, align: "right" },
  { key: "profit", header: "Profit", type: "currency", width: 18, align: "right" },
];

const detailColumns = [
  { key: "transaction_id", header: "Transaction ID", type: "text", width: 36, align: "left" },
  { key: "no_transaksi", header: "No Transaksi", type: "text", width: 24, align: "left" },
  { key: "date", header: "Tanggal", type: "date", width: 22, align: "left" },
  { key: "cashier", header: "Kasir", type: "text", width: 20, align: "left" },
  { key: "type_label", header: "Tipe", type: "text", width: 14, align: "left" },
  { key: "category", header: "Kategori", type: "text", width: 22, align: "left" },
  { key: "provider", header: "Provider", type: "text", width: 20, align: "left" },
  { key: "product_name", header: "Nama Produk / Layanan", type: "text", width: 36, align: "left" },
  { key: "qty", header: "Qty", type: "number", width: 10, align: "right" },
  { key: "selling_price", header: "Harga Jual", type: "currency", width: 18, align: "right" },
  { key: "cost", header: "Modal", type: "currency", width: 18, align: "right" },
  { key: "profit", header: "Profit", type: "currency", width: 18, align: "right" },
  { key: "payment_customer", header: "Metode Bayar Customer", type: "text", width: 26, align: "left" },
  { key: "target_number", header: "Nomor Tujuan", type: "text", width: 24, align: "left" },
];

function normalizeText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeNullableText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeKey(value, fallback = "") {
  const raw = String(value ?? "").trim().toLowerCase();
  const normalized = raw.replace(/[-\s]+/g, "_");
  return walletAliasMap[normalized] || walletAliasMap[raw] || normalized || fallback;
}

function titleize(value, fallback = "-") {
  const text = normalizeText(value, fallback).replace(/_/g, " ");
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCategoryLabel(value) {
  const key = normalizeKey(value, "");
  return serviceTypeLabelMap[key] || serviceCategoryLabelMap[key] || titleize(value);
}

function formatPaymentLabel(value) {
  const key = normalizeKey(value, "");

  if (!key) return "-";
  if (key === "split") return "Split Payment";
  if (key === "transfer_bank") return "Transfer Bank";
  if (key === "transfer_ewallet") return "E-Wallet";
  return walletPlatformLabelMap[key] || titleize(key);
}

function getPaymentGroup(value) {
  const key = normalizeKey(value, "");

  if (!key) return "Tidak Dicatat";
  if (key === "cash" || key === "tunai") return "Cash";
  if (key === "qris") return "QRIS";
  if (bankPaymentIds.has(key)) return "Transfer Bank";
  if (ewalletPaymentIds.has(key)) return "E-Wallet";
  if (key === "split") return "Split Payment";
  return formatPaymentLabel(key);
}

function formatCurrencyText(value) {
  return `Rp ${normalizeNumber(value).toLocaleString("id-ID")}`;
}

function parseDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function isDateInReportRange(value, startDate, endDate) {
  const date = parseDate(value);
  if (!date) return true;

  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    if (date < start) return false;
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    if (date > end) return false;
  }

  return true;
}

function compareRows(left, right) {
  const rightTime = right.date?.getTime?.() || 0;
  const leftTime = left.date?.getTime?.() || 0;
  if (rightTime !== leftTime) return rightTime - leftTime;
  return String(right.no_transaksi).localeCompare(String(left.no_transaksi), "id-ID");
}

function buildStaffNameMap(staffUsers = []) {
  return new Map(
    (Array.isArray(staffUsers) ? staffUsers : [])
      .filter((staff) => staff?.id)
      .map((staff) => [staff.id, normalizeText(staff.nama || staff.name, "")])
  );
}

function getCashierName(transaction, staffNameMap) {
  const cashierId = transaction.kasir_id || transaction.cashier_id || transaction.cashier;
  return (
    normalizeNullableText(transaction.cashier_name || transaction.kasir_name) ||
    staffNameMap.get(cashierId) ||
    formatCashierName(cashierId)
  );
}

function getTransactionNumber(transaction, prefix) {
  return normalizeText(
    transaction.no_transaksi || transaction.noTransaksi || transaction.reference,
    `${prefix}-${String(transaction.id || "").slice(0, 8).toUpperCase()}`
  );
}

function getAccessoryPayments(transaction) {
  if (Array.isArray(transaction.payments) && transaction.payments.length) {
    return transaction.payments
      .map((payment) => ({
        method: normalizeKey(payment.method || payment.metode || payment.payment_method || "cash", "cash"),
        amount: normalizeNumber(payment.amount ?? payment.nominal),
      }))
      .filter((payment) => payment.amount > 0);
  }

  return [
    {
      method: normalizeKey(transaction.metode_bayar || transaction.payment_method || "cash", "cash"),
      amount: normalizeNumber(transaction.total_bayar || transaction.total),
    },
  ].filter((payment) => payment.amount > 0);
}

function formatPaymentDetail(payments) {
  const validPayments = payments.filter((payment) => payment.amount > 0);

  if (!validPayments.length) return "-";
  if (validPayments.length === 1) return formatPaymentLabel(validPayments[0].method);

  return validPayments
    .map((payment) => `${formatPaymentLabel(payment.method)} ${formatCurrencyText(payment.amount)}`)
    .join(", ");
}

function addPaymentSummaryRow(paymentRows, transactionKey, method, amount) {
  const paymentAmount = normalizeNumber(amount);
  if (paymentAmount <= 0) return;

  paymentRows.push({
    transaction_key: transactionKey,
    payment_customer: getPaymentGroup(method),
    total_revenue: paymentAmount,
  });
}

function getProductMap(products = []) {
  return new Map((Array.isArray(products) ? products : []).map((product) => [product.id, product]));
}

function getLineCost(item, product, qty) {
  const explicitTotal = normalizeNumber(item.cost_total ?? item.total_cost, NaN);
  if (Number.isFinite(explicitTotal)) return explicitTotal;

  const cost = normalizeNumber(item.cost ?? item.modal, NaN);
  if (Number.isFinite(cost) && cost > 0) return cost;

  const unitCost = normalizeNumber(
    item.harga_beli ?? item.cost_per_unit ?? item.modal_satuan ?? product?.harga_beli,
    0
  );
  return unitCost * qty;
}

function buildAccessoryRows(transactions, products, staffNameMap, paymentRows) {
  const productMap = getProductMap(products);
  const rows = [];

  (Array.isArray(transactions) ? transactions : [])
    .filter((transaction) => isDateInReportRange(transaction.created_at, transaction.startDate, transaction.endDate))
    .forEach((transaction) => {
      const transactionKey = `produk:${transaction.id || transaction.no_transaksi}`;
      const noTransaksi = getTransactionNumber(transaction, "TRX");
      const payments = getAccessoryPayments(transaction);
      const paymentCustomer = formatPaymentDetail(payments);
      const date = parseDate(transaction.created_at) || new Date();

      payments.forEach((payment) =>
        addPaymentSummaryRow(paymentRows, transactionKey, payment.method, payment.amount)
      );

      (Array.isArray(transaction.items) ? transaction.items : []).forEach((item, index) => {
        const product = productMap.get(item.produk_id || item.product_id);
        const qty = normalizeNumber(item.qty || 0);
        const sellingPrice = normalizeNumber(
          item.selling_price ?? item.subtotal ?? normalizeNumber(item.harga_satuan) * qty
        );
        const cost = getLineCost(item, product, qty);
        const profit = normalizeNumber(item.profit, sellingPrice - cost);

        rows.push({
          id: `${transactionKey}:${item.id || index}`,
          transaction_key: transactionKey,
          transaction_id: transaction.id || noTransaksi,
          no_transaksi: noTransaksi,
          date,
          cashier: getCashierName(transaction, staffNameMap),
          type: "produk",
          type_label: TYPE_LABELS.produk,
          category: normalizeText(item.category || item.kategori || product?.kategori, "Aksesoris"),
          provider: normalizeNullableText(item.provider || product?.provider),
          product_name: normalizeText(item.nama_produk || item.product_name || product?.nama, "Produk"),
          qty,
          selling_price: sellingPrice,
          cost,
          profit,
          payment_customer: paymentCustomer,
          payment_group: payments.length === 1 ? getPaymentGroup(payments[0].method) : "Split Payment",
          target_number: "",
        });
      });
    });

  return rows;
}

function getDigitalType(category) {
  return productServiceCategorySet.has(normalizeKey(category)) ? "layanan" : "jasa";
}

function getDigitalPaymentMethod(transaction) {
  const details =
    transaction.transaction_details && typeof transaction.transaction_details === "object"
      ? transaction.transaction_details
      : {};

  return (
    details.payment_customer_label ||
    details.payment_label ||
    transaction.payment_customer_label ||
    transaction.payment_method ||
    transaction.payment_customer ||
    "cash"
  );
}

function getDigitalPaymentGroup(transaction) {
  return transaction.payment_customer || transaction.payment_method || "cash";
}

function getDigitalItems(transaction) {
  if (Array.isArray(transaction.transaction_items) && transaction.transaction_items.length) {
    return transaction.transaction_items;
  }

  return [
    {
      id: transaction.id,
      product_id: transaction.product_id || transaction.service_product_id,
      product_name_snapshot: transaction.product_name || transaction.catatan,
      product_name: transaction.product_name || transaction.catatan,
      category: transaction.category || transaction.jenis,
      provider: transaction.provider || transaction.transfer_platform || transaction.platform,
      service_type: transaction.service_type,
      qty: 1,
      selling_price: transaction.selling_price ?? transaction.harga_jual ?? transaction.total,
      subtotal: transaction.selling_price ?? transaction.harga_jual ?? transaction.total,
      cost: transaction.cost ?? transaction.modal,
      cost_total: transaction.cost ?? transaction.modal,
      profit: transaction.profit ?? transaction.keuntungan,
      target_number: transaction.target_number || transaction.nomor_tujuan,
      customer_name: transaction.customer_name || transaction.nama_tujuan,
    },
  ];
}

function buildDigitalRows(transactions, staffNameMap, paymentRows) {
  const rows = [];

  (Array.isArray(transactions) ? transactions : []).forEach((transaction) => {
    const transactionKey = `digital:${transaction.id || transaction.no_transaksi}`;
    const noTransaksi = getTransactionNumber(transaction, "LYN");
    const date = parseDate(transaction.created_at) || new Date();
    const rawPayment = getDigitalPaymentGroup(transaction);
    const paymentCustomer = formatPaymentLabel(getDigitalPaymentMethod(transaction));
    const sourceAmount = normalizeNumber(
      transaction.selling_price ?? transaction.harga_jual ?? transaction.total ?? transaction.nominal
    );

    addPaymentSummaryRow(paymentRows, transactionKey, rawPayment, sourceAmount);

    getDigitalItems(transaction).forEach((item, index) => {
      const qty = Math.max(1, normalizeNumber(item.qty || 1));
      const rawCategory = item.category || transaction.category || transaction.jenis;
      const type = getDigitalType(rawCategory);
      const sellingPrice = normalizeNumber(
        item.subtotal ?? normalizeNumber(item.selling_price ?? item.price) * qty
      );
      const cost = normalizeNumber(
        item.cost_total ?? normalizeNumber(item.cost ?? item.modal) * qty
      );
      const profit = normalizeNumber(item.profit, sellingPrice - cost);

      rows.push({
        id: `${transactionKey}:${item.id || index}`,
        transaction_key: transactionKey,
        transaction_id: transaction.id || noTransaksi,
        no_transaksi: noTransaksi,
        date,
        cashier: getCashierName(transaction, staffNameMap),
        type,
        type_label: TYPE_LABELS[type],
        category: formatCategoryLabel(rawCategory),
        provider: normalizeNullableText(
          item.provider || transaction.provider || transaction.transfer_platform || transaction.platform
        ),
        product_name: normalizeText(
          item.product_name_snapshot || item.product_name || transaction.product_name || transaction.catatan,
          type === "layanan" ? "Layanan Digital" : "Jasa"
        ),
        qty,
        selling_price: sellingPrice,
        cost,
        profit,
        payment_customer: paymentCustomer,
        payment_group: getPaymentGroup(rawPayment),
        target_number: normalizeText(
          item.target_number || transaction.target_number || transaction.nomor_tujuan,
          ""
        ),
      });
    });
  });

  return rows;
}

function buildLogisticsRows(transactions, staffNameMap, paymentRows) {
  const rows = [];

  (Array.isArray(transactions) ? transactions : []).forEach((transaction) => {
    const transactionKey = `jasa:${transaction.id || transaction.no_transaksi}`;
    const noTransaksi = getTransactionNumber(transaction, "LOG");
    const courier = normalizeText(transaction.courier || transaction.ekspedisi, "Logistik");
    const packageType = normalizeText(transaction.packageType || transaction.package_type, "Paket");
    const paymentMethod = transaction.paymentMethod || transaction.payment_method || "cash";
    const sellingPrice = normalizeNumber(transaction.price ?? transaction.harga_jual);
    const cost = normalizeNumber(transaction.cost ?? transaction.modal);
    const profit = normalizeNumber(transaction.profit ?? transaction.keuntungan, sellingPrice - cost);

    addPaymentSummaryRow(paymentRows, transactionKey, paymentMethod, sellingPrice);

    rows.push({
      id: transactionKey,
      transaction_key: transactionKey,
      transaction_id: transaction.id || noTransaksi,
      no_transaksi: noTransaksi,
      date: parseDate(transaction.created_at) || new Date(),
      cashier: getCashierName(transaction, staffNameMap),
      type: "jasa",
      type_label: TYPE_LABELS.jasa,
      category: "Logistik",
      provider: courier,
      product_name: ["Pengiriman", courier, packageType].filter(Boolean).join(" - "),
      qty: 1,
      selling_price: sellingPrice,
      cost,
      profit,
      payment_customer: formatPaymentLabel(paymentMethod),
      payment_group: getPaymentGroup(paymentMethod),
      target_number: normalizeText(transaction.no_resi || transaction.destination, ""),
    });
  });

  return rows;
}

function createEmptyTotals() {
  return {
    transactionKeys: new Set(),
    total_transactions: 0,
    total_revenue: 0,
    total_cost: 0,
    total_profit: 0,
    margin: 0,
  };
}

function finalizeTotals(totals) {
  const totalTransactions = totals.transactionKeys?.size ?? totals.total_transactions;
  return {
    ...totals,
    transactionKeys: undefined,
    total_transactions: totalTransactions,
    margin: totals.total_revenue > 0 ? totals.total_profit / totals.total_revenue : 0,
  };
}

function groupDetailRows(rows, getKey, createBase) {
  const grouped = new Map();

  rows.forEach((row) => {
    const key = getKey(row);
    if (!key) return;

    const current = grouped.get(key) || {
      ...createEmptyTotals(),
      ...createBase(row, key),
    };

    current.transactionKeys.add(row.transaction_key);
    current.total_revenue += row.selling_price;
    current.total_cost += row.cost;
    current.total_profit += row.profit;
    grouped.set(key, current);
  });

  return [...grouped.values()]
    .map(finalizeTotals)
    .sort((left, right) => right.total_profit - left.total_profit || right.total_revenue - left.total_revenue);
}

function buildPaymentSummary(paymentRows) {
  const grouped = new Map();

  paymentRows.forEach((row) => {
    const key = row.payment_customer || "Tidak Dicatat";
    const current =
      grouped.get(key) || {
        payment_customer: key,
        transactionKeys: new Set(),
        total_transactions: 0,
        total_revenue: 0,
      };

    current.transactionKeys.add(row.transaction_key);
    current.total_revenue += row.total_revenue;
    grouped.set(key, current);
  });

  return [...grouped.values()]
    .map((row) => ({
      payment_customer: row.payment_customer,
      total_transactions: row.transactionKeys.size,
      total_revenue: row.total_revenue,
    }))
    .sort((left, right) => right.total_revenue - left.total_revenue);
}

function buildTopProducts(rows, limit = 10) {
  const grouped = new Map();

  rows.forEach((row) => {
    const key = [row.type, row.category, row.provider || "", row.product_name].join("::");
    const current =
      grouped.get(key) || {
        product_name: row.product_name,
        category: row.category,
        type: row.type,
        qty: 0,
        revenue: 0,
        profit: 0,
      };

    current.qty += row.qty;
    current.revenue += row.selling_price;
    current.profit += row.profit;
    grouped.set(key, current);
  });

  return [...grouped.values()]
    .sort((left, right) => right.qty - left.qty || right.revenue - left.revenue)
    .slice(0, limit)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function buildCashierSummary(rows) {
  return groupDetailRows(
    rows,
    (row) => row.cashier,
    (row) => ({ label: row.cashier, cashier: row.cashier })
  );
}

function buildProviderSummary(rows) {
  return groupDetailRows(
    rows.filter((row) => row.type === "layanan" && row.provider),
    (row) => `${row.category}::${row.provider}`,
    (row) => ({
      label: `${row.category} - ${row.provider}`,
      category: row.category,
      provider: row.provider,
    })
  );
}

function buildGlobalSummary(rows) {
  const totals = rows.reduce((acc, row) => {
    acc.transactionKeys.add(row.transaction_key);
    acc.total_revenue += row.selling_price;
    acc.total_cost += row.cost;
    acc.total_profit += row.profit;
    acc.total_qty += row.qty;
    return acc;
  }, {
    transactionKeys: new Set(),
    total_revenue: 0,
    total_cost: 0,
    total_profit: 0,
    total_qty: 0,
  });

  return {
    total_transactions: totals.transactionKeys.size,
    total_revenue: totals.total_revenue,
    total_cost: totals.total_cost,
    total_profit: totals.total_profit,
    total_qty: totals.total_qty,
    margin: totals.total_revenue > 0 ? totals.total_profit / totals.total_revenue : 0,
  };
}

export function buildGlobalSalesReportData({
  products = [],
  staffUsers = [],
  accessoryTransactions = [],
  digitalTransactions = [],
  logisticsTransactions = [],
  startDate = null,
  endDate = null,
  topLimit = 10,
} = {}) {
  const staffNameMap = buildStaffNameMap(staffUsers);
  const paymentRows = [];
  const scopedAccessoryTransactions = (Array.isArray(accessoryTransactions) ? accessoryTransactions : [])
    .filter((transaction) => isDateInReportRange(transaction.created_at, startDate, endDate));
  const scopedDigitalTransactions = (Array.isArray(digitalTransactions) ? digitalTransactions : [])
    .filter((transaction) => isDateInReportRange(transaction.created_at, startDate, endDate));
  const scopedLogisticsTransactions = (Array.isArray(logisticsTransactions) ? logisticsTransactions : [])
    .filter((transaction) => isDateInReportRange(transaction.created_at, startDate, endDate));

  const detailRows = [
    ...buildAccessoryRows(scopedAccessoryTransactions, products, staffNameMap, paymentRows),
    ...buildDigitalRows(scopedDigitalTransactions, staffNameMap, paymentRows),
    ...buildLogisticsRows(scopedLogisticsTransactions, staffNameMap, paymentRows),
  ].sort(compareRows);

  const globalSummary = buildGlobalSummary(detailRows);
  const typeSummary = groupDetailRows(
    detailRows,
    (row) => row.type,
    (row) => ({ label: row.type_label, type: row.type })
  ).sort((left, right) => {
    const order = ["produk", "layanan", "jasa"];
    return order.indexOf(left.type) - order.indexOf(right.type);
  });
  const categorySummary = groupDetailRows(
    detailRows,
    (row) => row.category,
    (row) => ({ label: row.category, category: row.category })
  );
  const providerSummary = buildProviderSummary(detailRows);
  const paymentSummary = buildPaymentSummary(paymentRows);
  const topProducts = buildTopProducts(detailRows, topLimit);
  const cashierSummary = buildCashierSummary(detailRows);

  return {
    globalSummary,
    typeSummary,
    categorySummary,
    providerSummary,
    paymentSummary,
    topProducts,
    cashierSummary,
    detailRows,
  };
}

function createBorder(color = BORDER_COLOR) {
  return {
    top: { style: "thin", color: { argb: color } },
    right: { style: "thin", color: { argb: color } },
    bottom: { style: "thin", color: { argb: color } },
    left: { style: "thin", color: { argb: color } },
  };
}

function setWorkbookProperties(workbook, exportedAt) {
  workbook.creator = "Raja Aksesoris POS";
  workbook.company = "Raja Aksesoris";
  workbook.created = exportedAt;
  workbook.modified = exportedAt;
  workbook.title = REPORT_TITLE;
  workbook.subject = "Laporan penjualan";
}

function addSheetTitle(sheet, title, columnCount, periodLabel, exportedAtLabel) {
  sheet.mergeCells(1, 1, 1, columnCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: HEADER_TEXT } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 30;

  sheet.mergeCells(2, 1, 2, columnCount);
  const periodCell = sheet.getCell(2, 1);
  periodCell.value = `Periode: ${periodLabel}`;
  periodCell.font = { color: { argb: TEXT_MUTED } };
  periodCell.alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells(3, 1, 3, columnCount);
  const exportedCell = sheet.getCell(3, 1);
  exportedCell.value = `Diekspor: ${exportedAtLabel}`;
  exportedCell.font = { color: { argb: TEXT_MUTED } };
  exportedCell.alignment = { horizontal: "center", vertical: "middle" };
}

function styleHeaderCell(cell) {
  cell.font = { bold: true, color: { argb: HEADER_TEXT } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = createBorder();
}

function styleBodyCell(cell, column) {
  cell.alignment = {
    horizontal:
      column.align || (["number", "currency", "percentage"].includes(column.type) ? "right" : "left"),
    vertical: "middle",
    wrapText: column.type === "text",
  };
  cell.border = createBorder();

  if (column.type === "currency") cell.numFmt = CURRENCY_FORMAT;
  if (column.type === "number") cell.numFmt = NUMBER_FORMAT;
  if (column.type === "percentage") cell.numFmt = PERCENT_FORMAT;
  if (column.type === "date") cell.numFmt = DATE_FORMAT;
}

function getDisplayText(value, column) {
  if (value === null || value === undefined || value === "") return "";
  if (column.type === "currency" || column.type === "number") {
    return normalizeNumber(value).toLocaleString("id-ID");
  }
  if (column.type === "percentage") {
    return `${(normalizeNumber(value) * 100).toFixed(2)}%`;
  }
  if (column.type === "date") {
    return value instanceof Date
      ? formatDateTime(value, { dateStyle: "medium", timeStyle: "short" })
      : String(value);
  }
  return String(value);
}

function autoFitColumns(sheet, columns, rows) {
  columns.forEach((column, index) => {
    const contentWidth = rows.reduce(
      (width, row) => Math.max(width, getDisplayText(row[column.key], column).length + 2),
      column.header.length + 2
    );

    sheet.getColumn(index + 1).width = Math.min(56, Math.max(column.width, contentWidth));
  });
}

function writeTable(sheet, { title, columns, rows, startRow }) {
  let headerRowNumber = startRow;

  if (title) {
    sheet.mergeCells(startRow, 1, startRow, columns.length);
    const titleCell = sheet.getCell(startRow, 1);
    titleCell.value = title;
    titleCell.font = { bold: true, color: { argb: HEADER_TEXT } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD_SOFT } };
    titleCell.alignment = { horizontal: "left", vertical: "middle" };
    titleCell.border = createBorder();
    sheet.getRow(startRow).height = 24;
    headerRowNumber += 1;
  }

  const headerRow = sheet.getRow(headerRowNumber);
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    styleHeaderCell(cell);
  });
  headerRow.height = 26;

  rows.forEach((row, rowIndex) => {
    const sheetRow = sheet.getRow(headerRowNumber + rowIndex + 1);
    columns.forEach((column, columnIndex) => {
      const cell = sheetRow.getCell(columnIndex + 1);
      cell.value = row[column.key] ?? "";
      styleBodyCell(cell, column);
    });
    sheetRow.height = 23;
  });

  if (rows.length) {
    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber + rows.length, column: columns.length },
    };
  }

  autoFitColumns(sheet, columns, rows);
}

function buildWorksheet(workbook, name, title, columns, rows, periodLabel, exportedAtLabel) {
  const sheet = workbook.addWorksheet(name);
  sheet.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
  addSheetTitle(sheet, title, columns.length, periodLabel, exportedAtLabel);
  writeTable(sheet, {
    columns,
    rows,
    startRow: 5,
  });
  return sheet;
}

function buildSummarySheet(workbook, reportData, periodLabel, exportedAtLabel) {
  const rows = [
    { metric: "Total Transaksi", value: reportData.globalSummary.total_transactions, valueType: "number" },
    { metric: "Total Omzet", value: reportData.globalSummary.total_revenue, valueType: "currency" },
    { metric: "Total Modal", value: reportData.globalSummary.total_cost, valueType: "currency" },
    { metric: "Total Profit", value: reportData.globalSummary.total_profit, valueType: "currency" },
    { metric: "Total Qty", value: reportData.globalSummary.total_qty, valueType: "number" },
    { metric: "Margin Profit", value: reportData.globalSummary.margin, valueType: "percentage" },
  ];
  const sheet = workbook.addWorksheet("SUMMARY");

  sheet.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
  addSheetTitle(sheet, "SUMMARY", summaryColumns.length, periodLabel, exportedAtLabel);
  writeTable(sheet, {
    title: "Ringkasan Global",
    columns: summaryColumns,
    rows,
    startRow: 5,
  });

  rows.forEach((row, index) => {
    const cell = sheet.getRow(index + 7).getCell(2);
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    if (row.valueType === "currency") cell.numFmt = CURRENCY_FORMAT;
    if (row.valueType === "number") cell.numFmt = NUMBER_FORMAT;
    if (row.valueType === "percentage") cell.numFmt = PERCENT_FORMAT;
  });

  return sheet;
}

function normalizeAggregateRows(rows) {
  return rows.map((row) => ({
    ...row,
    label: row.label || row.category || row.cashier || "-",
  }));
}

function normalizeDetailRows(rows) {
  return rows.map((row) => ({
    ...row,
    provider: row.provider || "",
    target_number: row.target_number || "",
  }));
}

export async function buildSalesReportWorkbook(options = {}) {
  const { ExcelJS } = await loadExcelTools();
  const exportedAt = options.exportedAt ? new Date(options.exportedAt) : new Date();
  const periodLabel = normalizeText(options.periodLabel, "Semua periode");
  const exportedAtLabel = formatDateTime(exportedAt, {
    dateStyle: "full",
    timeStyle: "short",
  });
  const reportData =
    options.reportData ||
    buildGlobalSalesReportData({
      products: options.products,
      staffUsers: options.staffUsers,
      accessoryTransactions: options.accessoryTransactions,
      digitalTransactions: options.digitalTransactions,
      logisticsTransactions: options.logisticsTransactions,
      startDate: options.startDate,
      endDate: options.endDate,
      topLimit: options.topLimit,
    });
  const workbook = new ExcelJS.Workbook();
  const fileName =
    String(
      options.fileName || `Laporan_Penjualan_Raja_Aksesoris_${formatDateInput(exportedAt)}.xlsx`
    ).replace(/\.xlsx$/i, "") + ".xlsx";

  setWorkbookProperties(workbook, exportedAt);
  buildSummarySheet(workbook, reportData, periodLabel, exportedAtLabel);
  buildWorksheet(
    workbook,
    "TYPE SUMMARY",
    "TYPE SUMMARY",
    aggregateColumns,
    normalizeAggregateRows(reportData.typeSummary),
    periodLabel,
    exportedAtLabel
  );
  buildWorksheet(
    workbook,
    "CATEGORY",
    "CATEGORY SUMMARY",
    aggregateColumns,
    normalizeAggregateRows(reportData.categorySummary),
    periodLabel,
    exportedAtLabel
  );
  buildWorksheet(
    workbook,
    "PROVIDER",
    "PROVIDER BREAKDOWN",
    providerColumns,
    reportData.providerSummary,
    periodLabel,
    exportedAtLabel
  );
  buildWorksheet(
    workbook,
    "PAYMENT",
    "PAYMENT METHOD SUMMARY",
    paymentColumns,
    reportData.paymentSummary,
    periodLabel,
    exportedAtLabel
  );
  buildWorksheet(
    workbook,
    "TOP PRODUCT",
    "TOP SELLING PRODUCTS",
    topProductColumns,
    reportData.topProducts,
    periodLabel,
    exportedAtLabel
  );
  buildWorksheet(
    workbook,
    "DETAIL",
    "DETAIL TRANSACTION",
    detailColumns,
    normalizeDetailRows(reportData.detailRows),
    periodLabel,
    exportedAtLabel
  );

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    buffer,
    fileName,
    reportData,
  };
}

export async function exportSalesReport(options = {}) {
  const { saveAs } = await loadExcelTools();
  const { buffer, fileName } = await buildSalesReportWorkbook(options);

  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName
  );

  return fileName;
}
