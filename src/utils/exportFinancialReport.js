import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { formatDateInput, formatDateTime } from "./format";

const REPORT_TITLE = "LAPORAN KEUANGAN RAJA AKSESORIS";
const CURRENCY_FORMAT = '"Rp" #,##0';
const NUMBER_FORMAT = "#,##0";
const GOLD = "FFD4AF37";
const GOLD_SOFT = "FFF8E1";
const BORDER_COLOR = "FFD1D5DB";
const TEXT_DARK = "FF0F172A";
const TEXT_LIGHT = "FFFFFFFF";

function normalizeText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function createThinBorder() {
  return {
    top: { style: "thin", color: { argb: BORDER_COLOR } },
    right: { style: "thin", color: { argb: BORDER_COLOR } },
    bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    left: { style: "thin", color: { argb: BORDER_COLOR } },
  };
}

function getCellDisplayValue(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatDateTime(value, { dateStyle: "medium" });
  if (typeof value === "object") {
    if ("text" in value) return String(value.text ?? "");
    if ("result" in value) return String(value.result ?? "");
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
  }
  return String(value);
}

function autoFitColumns(sheet, minWidths = [], maxWidth = 52) {
  sheet.columns.forEach((column, index) => {
    let width = minWidths[index] || 10;

    column.eachCell({ includeEmpty: true }, (cell) => {
      width = Math.max(width, getCellDisplayValue(cell.value).length + 2);
    });

    column.width = Math.min(width, maxWidth);
  });
}

function applyTitle(sheet, title, lastColumn) {
  sheet.mergeCells(1, 1, 1, lastColumn);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: TEXT_DARK } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 30;
}

function applyReportMeta(sheet, periodLabel, exportedAtLabel, lastColumn) {
  sheet.mergeCells(2, 1, 2, lastColumn);
  sheet.mergeCells(3, 1, 3, lastColumn);
  sheet.getCell(2, 1).value = `Periode: ${periodLabel}`;
  sheet.getCell(3, 1).value = `Diekspor: ${exportedAtLabel}`;

  [2, 3].forEach((rowNumber) => {
    const cell = sheet.getCell(rowNumber, 1);
    cell.font = { color: { argb: TEXT_DARK } };
    cell.alignment = { horizontal: "left", vertical: "middle" };
    sheet.getRow(rowNumber).height = 22;
  });
}

function styleSectionHeader(sheet, rowNumber, startColumn, endColumn, label) {
  sheet.mergeCells(rowNumber, startColumn, rowNumber, endColumn);
  const cell = sheet.getCell(rowNumber, startColumn);
  cell.value = label;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
  cell.font = { bold: true, color: { argb: TEXT_LIGHT } };
  cell.alignment = { horizontal: "center", vertical: "middle" };

  for (let column = startColumn; column <= endColumn; column += 1) {
    sheet.getCell(rowNumber, column).border = createThinBorder();
  }
}

function styleTableHeader(row) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
    cell.font = { bold: true, color: { argb: TEXT_LIGHT } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = createThinBorder();
  });
}

function styleSummaryValuePair(sheet, rowNumber, labelColumn, valueColumn) {
  const labelCell = sheet.getCell(rowNumber, labelColumn);
  const valueCell = sheet.getCell(rowNumber, valueColumn);

  labelCell.border = createThinBorder();
  labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD_SOFT } };
  labelCell.font = { bold: true, color: { argb: TEXT_DARK } };
  labelCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };

  valueCell.border = createThinBorder();
  valueCell.numFmt = CURRENCY_FORMAT;
  valueCell.alignment = { horizontal: "right", vertical: "middle" };
}

function styleDataRow(row, { currencyColumns = [], numberColumns = [], centerColumns = [] } = {}) {
  row.eachCell((cell, columnNumber) => {
    const isCurrency = currencyColumns.includes(columnNumber);
    const isNumber = numberColumns.includes(columnNumber);
    const isCenter = centerColumns.includes(columnNumber);

    cell.border = createThinBorder();
    cell.alignment = {
      horizontal: isCurrency || isNumber ? "right" : isCenter ? "center" : "left",
      vertical: "middle",
      wrapText: !isCurrency && !isNumber,
    };

    if (isCurrency) cell.numFmt = CURRENCY_FORMAT;
    if (isNumber) cell.numFmt = NUMBER_FORMAT;
  });
}

function compareBySortAt(left, right) {
  return new Date(left.sortAt || left.tanggal || 0) - new Date(right.sortAt || right.tanggal || 0);
}

function normalizeTransactionRows(transactions = []) {
  return (Array.isArray(transactions) ? transactions : [])
    .map((transaction) => {
      const nominalMasuk = normalizeNumber(
        transaction.nominalMasuk ?? transaction.income ?? transaction.masuk
      );
      const nominalKeluar = normalizeNumber(
        transaction.nominalKeluar ?? transaction.expense ?? transaction.keluar
      );
      const rawAmount = normalizeNumber(transaction.nominal ?? transaction.amount);
      const tipe = String(transaction.tipe || transaction.type || "").toLowerCase();

      return {
        sortAt: transaction.sortAt || transaction.created_at || transaction.date || transaction.tanggal,
        noTransaksi: normalizeText(
          transaction.noTransaksi || transaction.no_transaksi || transaction.reference || transaction.id
        ),
        tanggal: normalizeText(transaction.tanggal || transaction.date),
        kasir: normalizeText(transaction.kasir || transaction.cashier || transaction.kasir_id),
        jenis: normalizeText(transaction.jenis || transaction.type || transaction.kategori, "Transaksi"),
        keterangan: normalizeText(transaction.keterangan || transaction.description || transaction.note),
        nominalMasuk: nominalMasuk || (tipe.includes("masuk") ? rawAmount : 0),
        nominalKeluar: nominalKeluar || (tipe.includes("keluar") ? rawAmount : 0),
        metode: normalizeText(transaction.metode || transaction.method || transaction.paymentMethod, "-"),
      };
    })
    .sort(compareBySortAt);
}

function normalizeCashFlowRows(cashFlow = []) {
  return (Array.isArray(cashFlow) ? cashFlow : [])
    .map((row) => {
      const tipe = String(row.tipe || row.type || "").toLowerCase().includes("keluar")
        ? "Keluar"
        : "Masuk";

      return {
        sortAt: row.sortAt || row.created_at || row.date || row.tanggal,
        tanggal: normalizeText(row.tanggal || row.date),
        tipe,
        kategori: normalizeText(row.kategori || row.category || row.jenis, "Kas"),
        keterangan: normalizeText(row.keterangan || row.description || row.note),
        nominal: normalizeNumber(row.nominal ?? row.amount ?? row.total),
      };
    })
    .sort(compareBySortAt);
}

function buildCashFlowFromTransactions(transactions) {
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
    .filter((row) => row.nominal > 0)
    .sort(compareBySortAt);
}

function buildComputedSummary(inputSummary = {}, cashFlowRows, transactionRows) {
  const saldoAwal = normalizeNumber(inputSummary.saldoAwal);
  const totalPemasukan = cashFlowRows
    .filter((row) => row.tipe === "Masuk")
    .reduce((sum, row) => sum + row.nominal, 0);
  const totalPengeluaran = cashFlowRows
    .filter((row) => row.tipe === "Keluar")
    .reduce((sum, row) => sum + row.nominal, 0);
  const labaBersih = totalPemasukan - totalPengeluaran;

  const totalPenjualan =
    inputSummary.totalPenjualan ??
    transactionRows
      .filter((row) => row.jenis.toLowerCase().includes("penjualan"))
      .reduce((sum, row) => sum + row.nominalMasuk, 0);
  const totalModalBarang =
    inputSummary.totalModalBarang ??
    inputSummary.totalModal ??
    transactionRows
      .filter((row) => row.jenis.toLowerCase().includes("modal"))
      .reduce((sum, row) => sum + row.nominalKeluar, 0);
  const totalBiayaOperasional =
    inputSummary.totalBiayaOperasional ??
    inputSummary.totalOperasional ??
    transactionRows
      .filter((row) => row.jenis.toLowerCase().includes("operasional"))
      .reduce((sum, row) => sum + row.nominalKeluar, 0);

  return {
    saldoAwal,
    totalPemasukan,
    totalPengeluaran,
    labaBersih,
    saldoAkhir: saldoAwal + labaBersih,
    totalPenjualan: normalizeNumber(totalPenjualan),
    totalModalBarang: normalizeNumber(totalModalBarang),
    totalBiayaOperasional: normalizeNumber(totalBiayaOperasional),
    totalHutangPiutang: normalizeNumber(inputSummary.totalHutangPiutang),
  };
}

function buildSummarySheet(workbook, computedSummary, periodLabel, exportedAtLabel) {
  const sheet = workbook.addWorksheet("Summary");
  applyTitle(sheet, REPORT_TITLE, 5);
  applyReportMeta(sheet, periodLabel, exportedAtLabel, 5);

  styleSectionHeader(sheet, 5, 1, 2, "MAIN SUMMARY");
  styleSectionHeader(sheet, 5, 4, 5, "DETAIL BREAKDOWN");

  const mainRows = [
    ["Total Pemasukan", computedSummary.totalPemasukan],
    ["Total Pengeluaran", computedSummary.totalPengeluaran],
    ["Laba Bersih", computedSummary.labaBersih],
    ["Saldo Awal", computedSummary.saldoAwal],
    ["Saldo Akhir", computedSummary.saldoAkhir],
  ];
  const detailRows = [
    ["Total Penjualan", computedSummary.totalPenjualan],
    ["Total Modal Barang", computedSummary.totalModalBarang],
    ["Total Biaya Operasional", computedSummary.totalBiayaOperasional],
    ["Total Hutang/Piutang", computedSummary.totalHutangPiutang],
  ];

  mainRows.forEach(([label, value], index) => {
    const rowNumber = index + 6;
    const row = sheet.getRow(rowNumber);
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    row.height = 23;
    styleSummaryValuePair(sheet, rowNumber, 1, 2);
  });

  detailRows.forEach(([label, value], index) => {
    const rowNumber = index + 6;
    const row = sheet.getRow(rowNumber);
    row.getCell(4).value = label;
    row.getCell(5).value = value;
    row.height = 23;
    styleSummaryValuePair(sheet, rowNumber, 4, 5);
  });

  sheet.getCell("A12").value = "Catatan";
  sheet.getCell("A12").font = { bold: true, color: { argb: TEXT_DARK } };
  sheet.getCell("B12").value =
    "Laba bersih dihitung dari total kas masuk dikurangi total kas keluar pada periode laporan.";
  sheet.mergeCells("B12:E12");
  for (let column = 1; column <= 5; column += 1) {
    const cell = sheet.getCell(12, column);
    cell.border = createThinBorder();
    cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  }

  autoFitColumns(sheet, [24, 20, 3, 26, 22], 44);
  sheet.views = [{ showGridLines: false }];
  sheet.getRow(12).height = 36;

  return sheet;
}

function buildCashFlowSheet(workbook, cashFlowRows, computedSummary, periodLabel, exportedAtLabel) {
  const sheet = workbook.addWorksheet("Cash Flow");
  applyTitle(sheet, "CASH FLOW (ARUS KAS)", 6);
  applyReportMeta(sheet, periodLabel, exportedAtLabel, 6);

  const headerRow = sheet.getRow(5);
  ["Tanggal", "Tipe", "Kategori", "Keterangan", "Nominal", "Saldo"].forEach((header, index) => {
    headerRow.getCell(index + 1).value = header;
  });
  headerRow.height = 26;
  styleTableHeader(headerRow);

  let runningBalance = computedSummary.saldoAwal;

  cashFlowRows.forEach((item, index) => {
    runningBalance += item.tipe === "Masuk" ? item.nominal : -item.nominal;
    const row = sheet.getRow(index + 6);
    row.values = [
      item.tanggal,
      item.tipe,
      item.kategori,
      item.keterangan,
      item.nominal,
      runningBalance,
    ];
    row.height = 23;
    styleDataRow(row, {
      currencyColumns: [5, 6],
      centerColumns: [1, 2],
    });
  });

  sheet.autoFilter = "A5:F5";
  sheet.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
  autoFitColumns(sheet, [20, 12, 18, 34, 18, 18], 54);

  return sheet;
}

function buildTransactionSheet(workbook, transactionRows, periodLabel, exportedAtLabel) {
  const sheet = workbook.addWorksheet("Transaksi Keuangan");
  applyTitle(sheet, "TRANSAKSI KEUANGAN", 8);
  applyReportMeta(sheet, periodLabel, exportedAtLabel, 8);

  const headerRow = sheet.getRow(5);
  [
    "No Transaksi",
    "Tanggal",
    "Kasir",
    "Jenis",
    "Keterangan",
    "Nominal Masuk",
    "Nominal Keluar",
    "Metode",
  ].forEach((header, index) => {
    headerRow.getCell(index + 1).value = header;
  });
  headerRow.height = 26;
  styleTableHeader(headerRow);

  transactionRows.forEach((transaction, index) => {
    const row = sheet.getRow(index + 6);
    row.values = [
      transaction.noTransaksi,
      transaction.tanggal,
      transaction.kasir,
      transaction.jenis,
      transaction.keterangan,
      transaction.nominalMasuk,
      transaction.nominalKeluar,
      transaction.metode,
    ];
    row.height = 23;
    styleDataRow(row, {
      currencyColumns: [6, 7],
      centerColumns: [1, 2, 3, 4, 8],
    });
  });

  sheet.autoFilter = "A5:H5";
  sheet.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
  autoFitColumns(sheet, [20, 22, 18, 18, 38, 18, 18, 16], 56);

  return sheet;
}

export async function exportFinancialReport(data = {}) {
  const exportedAt = data.exportedAt ? new Date(data.exportedAt) : new Date();
  const periodLabel = normalizeText(data.periodLabel, "Semua periode");
  const exportedAtLabel = formatDateTime(exportedAt, {
    dateStyle: "full",
    timeStyle: "short",
  });
  const transactionRows = normalizeTransactionRows(data.transactions);
  const cashFlowRows = normalizeCashFlowRows(
    Array.isArray(data.cashFlow) && data.cashFlow.length
      ? data.cashFlow
      : buildCashFlowFromTransactions(transactionRows)
  );
  const computedSummary = buildComputedSummary(data.summary, cashFlowRows, transactionRows);
  const workbook = new ExcelJS.Workbook();
  const fileName =
    String(data.fileName || `Laporan_Keuangan_Raja_Aksesoris_${formatDateInput(exportedAt)}.xlsx`)
      .replace(/\.xlsx$/i, "") + ".xlsx";

  workbook.creator = "Raja Aksesoris POS";
  workbook.company = "Raja Aksesoris";
  workbook.created = exportedAt;
  workbook.modified = exportedAt;

  buildSummarySheet(workbook, computedSummary, periodLabel, exportedAtLabel);
  buildCashFlowSheet(workbook, cashFlowRows, computedSummary, periodLabel, exportedAtLabel);
  buildTransactionSheet(workbook, transactionRows, periodLabel, exportedAtLabel);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, fileName);

  return fileName;
}
