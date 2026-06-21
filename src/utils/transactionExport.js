import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { walletPlatformLabelMap } from "../data/businessOptions";
import { formatCashierName } from "./cashier";
import { formatDateInput, formatDateTime } from "./format";

const REPORT_TITLE = "LAPORAN TRANSAKSI RAJA AKSESORIS";
const GOLD = "FFD4AF37";
const GOLD_SOFT = "FFFFF8E1";
const BORDER_COLOR = "FFD1D5DB";
const TEXT_DARK = "FF0F172A";
const TEXT_MUTED = "FF64748B";
const CURRENCY_FORMAT = '"Rp" #,##0';
const NUMBER_FORMAT = "#,##0";

const reportColumns = [
  { key: "no", header: "No", width: 8, type: "number", align: "center" },
  { key: "noTransaksi", header: "No Transaksi", width: 24, type: "text", align: "left" },
  { key: "tanggal", header: "Tanggal", width: 18, type: "text", align: "center" },
  { key: "kasir", header: "Kasir", width: 18, type: "text", align: "left" },
  { key: "produk", header: "Produk", width: 34, type: "text", align: "left" },
  { key: "qty", header: "Qty", width: 10, type: "number", align: "right" },
  { key: "harga", header: "Harga", width: 16, type: "currency", align: "right" },
  { key: "total", header: "Total", width: 18, type: "currency", align: "right" },
  { key: "metode", header: "Metode", width: 16, type: "text", align: "left" },
];

function normalizeText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function formatPaymentSummary(transaction) {
  if (Array.isArray(transaction.payments) && transaction.payments.length) {
    return transaction.payments
      .filter((payment) => normalizeNumber(payment.amount) > 0)
      .map(
        (payment) =>
          `${walletPlatformLabelMap[payment.method] || normalizeText(payment.method)} ${normalizeNumber(
            payment.amount
          ).toLocaleString("id-ID")}`
      )
      .join(", ");
  }

  const method = transaction.method || transaction.metode || transaction.paymentMethod;
  return normalizeText(method === "split" ? "Split Payment" : method, "-");
}

function createBorder(color = BORDER_COLOR) {
  return {
    top: { style: "thin", color: { argb: color } },
    right: { style: "thin", color: { argb: color } },
    bottom: { style: "thin", color: { argb: color } },
    left: { style: "thin", color: { argb: color } },
  };
}

function styleSectionHeader(sheet, rowNumber, label) {
  const row = sheet.getRow(rowNumber);
  row.getCell(1).value = label;
  row.height = 24;
  sheet.mergeCells(rowNumber, 1, rowNumber, reportColumns.length);

  const cell = row.getCell(1);
  cell.font = { bold: true, color: { argb: TEXT_DARK } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD_SOFT } };
  cell.alignment = { horizontal: "left", vertical: "middle" };
  cell.border = createBorder();
}

function styleSummaryPair(sheet, rowNumber, label, value, type = "text") {
  const row = sheet.getRow(rowNumber);
  row.height = 23;
  row.getCell(1).value = label;
  row.getCell(2).value = value;

  row.getCell(1).font = { bold: true, color: { argb: TEXT_DARK } };
  row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
  row.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
  row.getCell(1).border = createBorder();

  row.getCell(2).font = { bold: true, color: { argb: TEXT_DARK } };
  row.getCell(2).alignment = { horizontal: type === "currency" || type === "number" ? "right" : "left", vertical: "middle" };
  row.getCell(2).border = createBorder();

  if (type === "currency") row.getCell(2).numFmt = CURRENCY_FORMAT;
  if (type === "number") row.getCell(2).numFmt = NUMBER_FORMAT;
}

function normalizeTransactionRows(transactions) {
  return transactions.map((transaction, index) => {
    const total = normalizeNumber(transaction.total || transaction.amount || transaction.nominal);
    const qty = normalizeNumber(transaction.qty || transaction.quantity || transaction.jumlah || 1);
    const price = normalizeNumber(
      transaction.price || transaction.unitPrice || transaction.harga || transaction.harga_satuan
    );

    return {
      no: index + 1,
      noTransaksi: normalizeText(transaction.noTransaksi || transaction.reference || transaction.no_transaksi),
      tanggal: normalizeText(
        transaction.date ||
          transaction.tanggal ||
          (transaction.occurredAt
            ? formatDateTime(transaction.occurredAt, { dateStyle: "medium" })
            : "-")
      ),
      kasir: formatCashierName(transaction.cashier || transaction.kasir || transaction.user),
      produk: normalizeText(transaction.product || transaction.produk || transaction.summary || "-"),
      qty,
      harga: price || (qty ? total / qty : total),
      total,
      metode: formatPaymentSummary(transaction),
    };
  });
}

function autoFitColumns(sheet, rows) {
  reportColumns.forEach((column, index) => {
    const maxContentWidth = rows.reduce((width, row) => {
      const value = row[column.key];
      const display =
        column.type === "currency" || column.type === "number"
          ? normalizeNumber(value).toLocaleString("id-ID")
          : normalizeText(value);
      return Math.max(width, display.length + 2);
    }, column.header.length + 2);

    sheet.getColumn(index + 1).width = Math.min(42, Math.max(column.width, maxContentWidth));
  });
}

export async function exportExcel(transactions, options = {}) {
  const exportedAt = options.exportedAt ? new Date(options.exportedAt) : new Date();
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const rows = normalizeTransactionRows(safeTransactions);
  const totalOmzet = rows.reduce((sum, row) => sum + normalizeNumber(row.total), 0);
  const fileName =
    String(options.fileName || `Laporan_Transaksi_POS_${formatDateInput(exportedAt)}.xlsx`).replace(
      /\.xlsx$/i,
      ""
    ) + ".xlsx";
  const reportRange = normalizeText(options.reportRange, "Semua periode");

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Raja Aksesoris POS";
  workbook.company = "Raja Aksesoris";
  workbook.created = exportedAt;
  workbook.title = REPORT_TITLE;

  const sheet = workbook.addWorksheet("Riwayat Transaksi");
  sheet.views = [{ state: "frozen", ySplit: 11, showGridLines: false }];

  sheet.mergeCells(1, 1, 1, reportColumns.length);
  const titleCell = sheet.getCell("A1");
  titleCell.value = REPORT_TITLE;
  titleCell.font = { bold: true, size: 16, color: { argb: TEXT_DARK } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 30;

  sheet.mergeCells(2, 1, 2, reportColumns.length);
  const periodCell = sheet.getCell("A2");
  periodCell.value = `Periode: ${reportRange}`;
  periodCell.font = { color: { argb: TEXT_MUTED } };
  periodCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(2).height = 22;

  sheet.mergeCells(3, 1, 3, reportColumns.length);
  const exportCell = sheet.getCell("A3");
  exportCell.value = `Tanggal export: ${formatDateTime(exportedAt, {
    dateStyle: "full",
    timeStyle: "short",
  })}`;
  exportCell.font = { color: { argb: TEXT_MUTED } };
  exportCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(3).height = 22;

  styleSectionHeader(sheet, 5, "RINGKASAN");
  styleSummaryPair(sheet, 6, "Total Transaksi", rows.length, "number");
  styleSummaryPair(sheet, 7, "Total Omzet", totalOmzet, "currency");

  styleSectionHeader(sheet, 9, "DETAIL TRANSAKSI");

  const headerRowNumber = 10;
  const headerRow = sheet.getRow(headerRowNumber);
  reportColumns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: TEXT_DARK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = createBorder();
  });
  headerRow.height = 26;

  rows.forEach((row, rowIndex) => {
    const sheetRow = sheet.getRow(headerRowNumber + rowIndex + 1);
    reportColumns.forEach((column, columnIndex) => {
      const cell = sheetRow.getCell(columnIndex + 1);
      cell.value = row[column.key];
      cell.alignment = {
        horizontal: column.align,
        vertical: "middle",
        wrapText: column.type === "text",
      };
      cell.border = createBorder();

      if (column.type === "currency") cell.numFmt = CURRENCY_FORMAT;
      if (column.type === "number") cell.numFmt = NUMBER_FORMAT;
    });
    sheetRow.height = 23;
  });

  if (rows.length) {
    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber + rows.length, column: reportColumns.length },
    };
  }

  autoFitColumns(sheet, rows);

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName
  );

  return fileName;
}

export { exportExcel as exportBusinessReport };
