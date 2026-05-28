import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { formatDateInput, formatRupiah } from "./format";

const HEADER_FILL = "D4AF37";
const META_FILL = "E5E7EB";
const TITLE_FILL = "F8FAFC";
const BORDER_COLOR = "CBD5E1";
const TEXT_DARK = "0F172A";
const TEXT_LIGHT = "FFFFFF";
const CURRENCY_FORMAT = '"Rp"#,##0';
const NUMBER_FORMAT = "#,##0";

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function normalizeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function sanitizeSheetName(name) {
  return (
    String(name || "Sheet")
      .replace(/[\\/?*[\]:]/g, " ")
      .trim()
      .slice(0, 31) || "Sheet"
  );
}

function getColumnAlignment(column) {
  if (column.align) return column.align;
  if (column.type === "currency" || column.type === "number") return "right";
  if (column.type === "center") return "center";
  return "left";
}

function getDisplayLength(value, type) {
  if (type === "currency") return formatRupiah(value).length;
  if (type === "number") return normalizeNumber(value).toLocaleString("id-ID").length;
  return normalizeText(value).length;
}

function normalizeColumns(columns) {
  return columns.map((column) => ({
    type: "text",
    minWidth: 10,
    maxWidth: 32,
    ...column,
  }));
}

function normalizeRows(columns, rows) {
  return rows.map((row, index) => {
    const normalizedRow = {};

    columns.forEach((column) => {
      const rawValue =
        typeof column.value === "function" ? column.value(row, index) : row[column.key];

      normalizedRow[column.key] =
        column.type === "currency" || column.type === "number"
          ? normalizeNumber(rawValue)
          : normalizeText(rawValue);
    });

    return normalizedRow;
  });
}

function buildColumnWidths(columns, rows) {
  return columns.map((column) => {
    const contentWidth = rows.reduce((widest, row) => {
      const cellLength = getDisplayLength(row[column.key], column.type);
      return Math.max(widest, cellLength);
    }, column.header.length);

    return Math.min(column.maxWidth, Math.max(column.minWidth, contentWidth + 2));
  });
}

function createBorder() {
  return {
    top: { style: "thin", color: { argb: BORDER_COLOR } },
    right: { style: "thin", color: { argb: BORDER_COLOR } },
    bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    left: { style: "thin", color: { argb: BORDER_COLOR } },
  };
}

function styleRow(row, style) {
  row.eachCell((cell) => {
    Object.assign(cell, style);
  });
}

function buildWorksheet(workbook, config) {
  const title = config.title || "Laporan";
  const metadataRows = (config.metadataRows || []).map(([label, value]) => [
    normalizeText(label),
    normalizeText(value),
  ]);
  const columns = normalizeColumns(config.columns || []);
  const rows = normalizeRows(columns, config.rows || []);
  const worksheet = workbook.addWorksheet(sanitizeSheetName(config.name || title));
  const lastColumn = Math.max(columns.length, 1);

  worksheet.addRow([title]);
  worksheet.mergeCells(1, 1, 1, lastColumn);
  worksheet.getCell(1, 1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: TITLE_FILL },
  };
  worksheet.getCell(1, 1).font = { bold: true, size: 16, color: { argb: TEXT_DARK } };
  worksheet.getCell(1, 1).alignment = { vertical: "middle", horizontal: "center" };
  worksheet.getRow(1).height = 25;

  metadataRows.forEach((metadata) => {
    const row = worksheet.addRow(metadata);
    row.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: META_FILL },
    };
    row.getCell(1).font = { bold: true, color: { argb: TEXT_DARK } };
    row.eachCell((cell) => {
      cell.border = createBorder();
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    });
    if (lastColumn > 2) worksheet.mergeCells(row.number, 2, row.number, lastColumn);
  });

  worksheet.addRow([]);
  const headerRow = worksheet.addRow(columns.map((column) => column.header));
  styleRow(headerRow, {
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } },
    font: { bold: true, color: { argb: TEXT_LIGHT } },
    border: createBorder(),
    alignment: { vertical: "middle", horizontal: "center", wrapText: true },
  });

  rows.forEach((row) => {
    const dataRow = worksheet.addRow(columns.map((column) => row[column.key]));
    columns.forEach((column, index) => {
      const cell = dataRow.getCell(index + 1);
      cell.border = createBorder();
      cell.alignment = {
        vertical: "middle",
        horizontal: getColumnAlignment(column),
        wrapText: column.type !== "currency" && column.type !== "number",
      };
      if (column.type === "currency") cell.numFmt = CURRENCY_FORMAT;
      if (column.type === "number") cell.numFmt = NUMBER_FORMAT;
    });
  });

  worksheet.columns = buildColumnWidths(columns, rows).map((width) => ({ width }));
  if (rows.length) {
    worksheet.autoFilter = {
      from: { row: metadataRows.length + 3, column: 1 },
      to: { row: metadataRows.length + 3, column: lastColumn },
    };
  }

  return worksheet;
}

export async function exportWorkbook(config) {
  const exportedAt = config.exportedAt ? new Date(config.exportedAt) : new Date();
  const workbook = new ExcelJS.Workbook();
  const sheets = Array.isArray(config.sheets) ? config.sheets : [];
  const safeFileName =
    String(config.fileName || `Laporan_${formatDateInput(exportedAt)}.xlsx`).replace(
      /\.xlsx$/i,
      ""
    ) + ".xlsx";

  sheets.forEach((sheet) => buildWorksheet(workbook, sheet));
  workbook.creator = "Raja Aksesoris POS";
  workbook.company = "Raja Aksesoris";
  workbook.created = exportedAt;

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    safeFileName
  );

  return safeFileName;
}
