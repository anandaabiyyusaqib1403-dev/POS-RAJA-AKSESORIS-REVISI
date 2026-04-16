import { formatCashierName } from "./cashier";
import { formatDateInput, formatDateTime, formatRupiah } from "./format";
import { exportWorkbook } from "./excelExport";

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function normalizeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

export function exportExcel(transactions, options = {}) {
  const exportedAt = options.exportedAt ? new Date(options.exportedAt) : new Date();
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const title = options.title || "LAPORAN RAJA AKSESORIS";
  const sheetName = options.sheetName || "Laporan";
  const reportRange = options.reportRange || "Semua periode";
  const filterSummary = options.filterSummary || "Semua transaksi";
  const fileName =
    options.fileName || `Laporan_Raja_Aksesoris_${formatDateInput(exportedAt)}.xlsx`;

  const totalOmzet = safeTransactions.reduce((sum, transaction) => {
    const value = Number(transaction.total || transaction.amount || 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  const totalLaba = safeTransactions.reduce((sum, transaction) => {
    const profit = Number(transaction.profit || transaction.laba || transaction.profitImpact || 0);
    return sum + (Number.isFinite(profit) ? profit : 0);
  }, 0);

  const reportColumns = [
    { key: "no", header: "No Transaksi", type: "number", minWidth: 10, maxWidth: 14, align: "center" },
    { key: "date", header: "Tanggal", type: "text", minWidth: 16, maxWidth: 20, align: "center" },
    { key: "cashier", header: "Kasir", type: "text", minWidth: 16, maxWidth: 20 },
    { key: "product", header: "Produk", type: "text", minWidth: 24, maxWidth: 32 },
    { key: "qty", header: "Qty", type: "number", minWidth: 10, maxWidth: 12, align: "center" },
    { key: "price", header: "Harga", type: "currency", minWidth: 16, maxWidth: 18, align: "right" },
    { key: "total", header: "Total", type: "currency", minWidth: 18, maxWidth: 20, align: "right" },
    { key: "method", header: "Metode", type: "text", minWidth: 14, maxWidth: 18 },
  ];

  const rows = safeTransactions.map((transaction, index) => ({
    no: index + 1,
    date: normalizeText(transaction.date),
    cashier: formatCashierName(transaction.cashier || transaction.kasir || transaction.user),
    product: normalizeText(transaction.product || transaction.produk || transaction.summary || "-"),
    qty: normalizeNumber(transaction.qty || transaction.quantity || transaction.jumlah),
    price: normalizeNumber(transaction.price || transaction.unitPrice || transaction.harga || transaction.harga_satuan),
    total: normalizeNumber(transaction.total || transaction.amount || transaction.nominal),
    method: normalizeText(transaction.method || transaction.metode || transaction.paymentMethod || "-"),
  }));

  return exportWorkbook({
    fileName,
    exportedAt,
    props: {
      Title: title,
      Subject: "Laporan Raja Aksesoris",
    },
    sheets: [
      {
        name: sheetName,
        title,
        metadataRows: [
          ["Total transaksi", safeTransactions.length],
          ["Total omzet", formatRupiah(totalOmzet)],
          ["Total laba", formatRupiah(totalLaba)],
          ["Periode laporan", reportRange],
          ["Filter aktif", filterSummary],
          ["Tanggal export", formatDateTime(exportedAt, { dateStyle: "full", timeStyle: "short" })],
        ],
        columns: reportColumns,
        rows,
      },
    ],
  });
}

export { exportExcel as exportBusinessReport };
