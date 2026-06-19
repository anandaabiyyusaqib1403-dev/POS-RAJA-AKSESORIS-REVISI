import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { formatCashierName } from "./cashier";
import { formatDateInput, formatDateTime } from "./format";

const REPORT_TITLE = "LAPORAN KEUANGAN RAJA AKSESORIS";
const CURRENCY_FORMAT = '"Rp" #,##0';
const NUMBER_FORMAT = "#,##0";
const GOLD = "FFD4AF37";
const GOLD_SOFT = "FFF8E1";
const BORDER_COLOR = "FFD1D5DB";
const TEXT_DARK = "FF0F172A";
const TEXT_LIGHT = "FFFFFFFF";

// Separate cash and digital wallets
const DIGITAL_WALLETS = ["DANA", "Bank Mas", "Wahana", "PASAR KUOTA", "Shopee", "BCA", "QRIS"];

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

function styleSummaryFormulaCell(cell, format = CURRENCY_FORMAT) {
  cell.border = createThinBorder();
  cell.numFmt = format;
  cell.alignment = { horizontal: "right", vertical: "middle" };
  cell.font = { bold: true, color: { argb: TEXT_DARK } };
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

function addTableHeader(sheet, rowNumber, headers) {
  const row = sheet.getRow(rowNumber);
  headers.forEach((header, index) => {
    row.getCell(index + 1).value = header;
  });
  row.height = 26;
  styleTableHeader(row);
  return row;
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
        kasir: formatCashierName(transaction.kasir || transaction.cashier || transaction.kasir_id),
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

  const totalPenjualan =
    inputSummary.totalPenjualan ??
    transactionRows
      .filter((row) => row.jenis.toLowerCase().includes("penjualan"))
      .reduce((sum, row) => sum + row.nominalMasuk, 0);
  const totalModalBarang =
    inputSummary.totalModalBarang ??
    inputSummary.totalModal ??
    0;
  const totalBiayaOperasional =
    inputSummary.totalBiayaOperasional ??
    inputSummary.totalOperasional ??
    transactionRows
      .filter((row) => row.jenis.toLowerCase().includes("operasional"))
      .reduce((sum, row) => sum + row.nominalKeluar, 0);
  const expenseBreakdown = buildExpenseBreakdown(inputSummary, transactionRows);
  const jumlahTransaksi =
    inputSummary.jumlahTransaksi ??
    transactionRows.filter((row) => row.nominalMasuk > 0 || row.nominalKeluar > 0).length;
  const labaKotor = normalizeNumber(totalPenjualan) - normalizeNumber(totalModalBarang);
  const labaBersih = labaKotor - normalizeNumber(totalBiayaOperasional);
  const totalReturSupplier = normalizeNumber(inputSummary.totalReturSupplier);
  const totalReturKonsumen = normalizeNumber(inputSummary.totalReturKonsumen);

  return {
    saldoAwal,
    totalPemasukan,
    totalPengeluaran,
    saldoAkhir: saldoAwal + totalPemasukan - totalPengeluaran,
    totalPenjualan: normalizeNumber(totalPenjualan),
    totalModalBarang: normalizeNumber(totalModalBarang),
    labaKotor,
    totalBiayaOperasional: normalizeNumber(totalBiayaOperasional),
    labaBersih,
    totalReturSupplier,
    totalReturKonsumen,
    jumlahTransaksi: normalizeNumber(jumlahTransaksi),
    rataRataTransaksi:
      normalizeNumber(jumlahTransaksi) > 0
        ? normalizeNumber(totalPenjualan) / normalizeNumber(jumlahTransaksi)
        : 0,
    totalHutangPiutang: normalizeNumber(inputSummary.totalHutangPiutang),
    expenseBreakdown,
  };
}

function buildExpenseBreakdown(inputSummary = {}, transactionRows = []) {
  const fromInput = inputSummary.expenseBreakdown || {};
  const normalizeCategory = (jenis) => {
    const normalized = String(jenis || "").toLowerCase();
    if (normalized.includes("modal")) return "Modal Barang";
    if (normalized.includes("operasional")) return "Operasional";
    return "Lain-lain";
  };
  const grouped = transactionRows.reduce(
    (acc, row) => {
      if (row.nominalKeluar <= 0) return acc;
      const category = normalizeCategory(row.jenis);
      acc[category] += row.nominalKeluar;
      return acc;
    },
    { "Modal Barang": 0, Operasional: 0, "Lain-lain": 0 }
  );

  return {
    "Modal Barang": normalizeNumber(fromInput["Modal Barang"] ?? fromInput.modalBarang ?? grouped["Modal Barang"]),
    Operasional: normalizeNumber(fromInput.Operasional ?? fromInput.operasional ?? grouped.Operasional),
    "Lain-lain": normalizeNumber(fromInput["Lain-lain"] ?? fromInput.lainLain ?? grouped["Lain-lain"]),
  };
}

function buildWalletRows(walletBalances = []) {
  const balanceMap = new Map(
    (Array.isArray(walletBalances) ? walletBalances : []).map((wallet) => [
      normalizeText(wallet.name || wallet.wallet || wallet.label || wallet.id),
      normalizeNumber(wallet.balance ?? wallet.saldo),
    ])
  );

  return DIGITAL_WALLETS.map((walletName) => [walletName, balanceMap.get(walletName) || 0]);
}

function buildPaymentMethodRows(transactionRows = []) {
  const grouped = new Map();

  transactionRows.forEach((transaction) => {
    const method = normalizeText(transaction.metode, "-");
    const amount = transaction.nominalMasuk > 0 ? transaction.nominalMasuk : transaction.nominalKeluar;
    if (amount <= 0) return;

    const current = grouped.get(method) || { metode: method, jumlahTransaksi: 0, totalNominal: 0 };
    current.jumlahTransaksi += 1;
    current.totalNominal += amount;
    grouped.set(method, current);
  });

  return [...grouped.values()].sort((left, right) => right.totalNominal - left.totalNominal);
}

function buildSummarySheet(
  workbook,
  computedSummary,
  walletRows,
  paymentMethodRows,
  periodLabel,
  exportedAtLabel
) {
  const sheet = workbook.addWorksheet("SUMMARY KEUANGAN");
  applyTitle(sheet, REPORT_TITLE, 6);
  applyReportMeta(sheet, periodLabel, exportedAtLabel, 6);

  // MAIN SUMMARY
  styleSectionHeader(sheet, 5, 1, 2, "RINGKASAN UTAMA");
  const mainRows = [
    ["Saldo Awal", computedSummary.saldoAwal],
    ["Total Pemasukan", computedSummary.totalPemasukan],
    ["Total Pengeluaran", computedSummary.totalPengeluaran],
  ];

  mainRows.forEach(([label, value], index) => {
    const rowNumber = index + 6;
    const row = sheet.getRow(rowNumber);
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    row.height = 23;
    styleSummaryValuePair(sheet, rowNumber, 1, 2);
  });
  sheet.getRow(9).getCell(1).value = "Saldo Akhir";
  sheet.getRow(9).getCell(2).value = {
    formula: "B6+B7-B8",
    result: computedSummary.saldoAkhir,
  };
  sheet.getRow(9).height = 23;
  styleSummaryValuePair(sheet, 9, 1, 2);
  styleSummaryFormulaCell(sheet.getCell("B9"));

  // PROFIT SECTION
  styleSectionHeader(sheet, 5, 4, 6, "LABA RUGI");
  const profitRows = [
    ["Total Penjualan", computedSummary.totalPenjualan],
    ["Total Modal", computedSummary.totalModalBarang],
    ["Laba Kotor", { formula: "E6-E7", result: computedSummary.labaKotor }],
    ["Total Operasional", computedSummary.totalBiayaOperasional],
    ["Laba Bersih", { formula: "E8-E9", result: computedSummary.labaBersih }],
  ];

  profitRows.forEach(([label, value], index) => {
    const rowNumber = index + 6;
    sheet.getRow(rowNumber).getCell(4).value = label;
    sheet.getRow(rowNumber).getCell(5).value = value;
    sheet.getRow(rowNumber).height = 23;
    styleSummaryValuePair(sheet, rowNumber, 4, 5);
    if (typeof value === "object") styleSummaryFormulaCell(sheet.getCell(rowNumber, 5));
  });

  // INSIGHTS
  styleSectionHeader(sheet, 12, 1, 2, "WAWASAN BISNIS");
  const insightRows = [
    ["Jumlah Transaksi", computedSummary.jumlahTransaksi],
    ["Rata-rata Transaksi", { formula: "IF(B13=0,0,E6/B13)", result: computedSummary.rataRataTransaksi }],
    ["Retur Supplier", computedSummary.totalReturSupplier],
    ["Garansi Konsumen", computedSummary.totalReturKonsumen],
  ];
  insightRows.forEach(([label, value], index) => {
    const rowNumber = index + 13;
    sheet.getRow(rowNumber).getCell(1).value = label;
    sheet.getRow(rowNumber).getCell(2).value = value;
    sheet.getRow(rowNumber).height = 23;
    styleSummaryValuePair(sheet, rowNumber, 1, 2);
    if (rowNumber === 13) sheet.getCell(rowNumber, 2).numFmt = NUMBER_FORMAT;
    if (rowNumber === 14) styleSummaryFormulaCell(sheet.getCell(rowNumber, 2));
  });

  // EXPENSE BREAKDOWN
  styleSectionHeader(sheet, 12, 4, 5, "RINCIAN PENGELUARAN");
  Object.entries(computedSummary.expenseBreakdown).forEach(([label, value], index) => {
    const rowNumber = index + 13;
    sheet.getRow(rowNumber).getCell(4).value = label;
    sheet.getRow(rowNumber).getCell(5).value = value;
    sheet.getRow(rowNumber).height = 23;
    styleSummaryValuePair(sheet, rowNumber, 4, 5);
  });

  // DIGITAL WALLET BALANCE
  styleSectionHeader(sheet, 17, 1, 2, "SALDO WALLET (DIGITAL)");
  addTableHeader(sheet, 18, ["Wallet", "Saldo"]);
  walletRows.forEach(([wallet, saldo], index) => {
    const row = sheet.getRow(index + 19);
    row.values = [wallet, saldo];
    row.height = 23;
    styleDataRow(row, { currencyColumns: [2] });
  });

  // PAYMENT METHOD SUMMARY
  styleSectionHeader(sheet, 17, 4, 6, "RINGKASAN METODE PEMBAYARAN");
  const paymentHeader = sheet.getRow(18);
  ["Metode", "Jumlah Transaksi", "Total Nominal"].forEach((header, index) => {
    paymentHeader.getCell(index + 4).value = header;
  });
  paymentHeader.height = 26;
  [4, 5, 6].forEach((column) => {
    const cell = paymentHeader.getCell(column);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
    cell.font = { bold: true, color: { argb: TEXT_LIGHT } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = createThinBorder();
  });

  paymentMethodRows.forEach((item, index) => {
    const rowNumber = index + 19;
    const row = sheet.getRow(rowNumber);
    row.getCell(4).value = item.metode;
    row.getCell(5).value = item.jumlahTransaksi;
    row.getCell(6).value = item.totalNominal;
    row.height = 23;
    styleDataRow(row, {
      currencyColumns: [6],
      numberColumns: [5],
      centerColumns: [5],
    });
  });

  autoFitColumns(sheet, [24, 20, 3, 24, 18, 20], 44);
  sheet.views = [{ showGridLines: false }];

  return sheet;
}

function buildCashFlowSheet(workbook, cashFlowRows, computedSummary, periodLabel, exportedAtLabel) {
  const sheet = workbook.addWorksheet("CASH FLOW");
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
    const rowNumber = index + 6;
    runningBalance += item.tipe === "Masuk" ? item.nominal : -item.nominal;
    const row = sheet.getRow(rowNumber);
    row.values = [
      item.tanggal,
      item.tipe,
      item.kategori,
      item.keterangan,
      item.nominal,
      {
        formula:
          rowNumber === 6
            ? `'SUMMARY KEUANGAN'!B6+IF(B${rowNumber}="Masuk",E${rowNumber},-E${rowNumber})`
            : `F${rowNumber - 1}+IF(B${rowNumber}="Masuk",E${rowNumber},-E${rowNumber})`,
        result: runningBalance,
      },
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
  const sheet = workbook.addWorksheet("TRANSACTION DETAIL");
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
  const walletRows = buildWalletRows(data.walletBalances);
  const paymentMethodRows = buildPaymentMethodRows(transactionRows);
  const workbook = new ExcelJS.Workbook();
  const fileName =
    String(data.fileName || `Laporan_Keuangan_Raja_Aksesoris_${formatDateInput(exportedAt)}.xlsx`)
      .replace(/\.xlsx$/i, "") + ".xlsx";

  workbook.creator = "Raja Aksesoris POS";
  workbook.company = "Raja Aksesoris";
  workbook.created = exportedAt;
  workbook.modified = exportedAt;

  buildSummarySheet(
    workbook,
    computedSummary,
    walletRows,
    paymentMethodRows,
    periodLabel,
    exportedAtLabel
  );
  buildCashFlowSheet(workbook, cashFlowRows, computedSummary, periodLabel, exportedAtLabel);
  buildTransactionSheet(workbook, transactionRows, periodLabel, exportedAtLabel);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, fileName);

  return fileName;
}
