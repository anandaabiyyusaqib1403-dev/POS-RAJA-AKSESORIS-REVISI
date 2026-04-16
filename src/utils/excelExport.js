import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
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

function getColumnLetter(index) {
  let currentIndex = index + 1;
  let label = "";

  while (currentIndex > 0) {
    const remainder = (currentIndex - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    currentIndex = Math.floor((currentIndex - 1) / 26);
  }

  return label;
}

function sanitizeSheetName(name) {
  return String(name || "Sheet")
    .replace(/[\\/?*[\]:]/g, " ")
    .trim()
    .slice(0, 31) || "Sheet";
}

function createBorder() {
  return {
    top: { style: "thin", color: { rgb: BORDER_COLOR } },
    right: { style: "thin", color: { rgb: BORDER_COLOR } },
    bottom: { style: "thin", color: { rgb: BORDER_COLOR } },
    left: { style: "thin", color: { rgb: BORDER_COLOR } },
  };
}

function createAlignment(horizontal = "left", wrapText = false) {
  return {
    vertical: "center",
    horizontal,
    wrapText,
  };
}

function mergeStyles(...styles) {
  return styles.reduce(
    (accumulator, style) => ({
      ...accumulator,
      ...style,
      fill: style.fill || accumulator.fill,
      font: style.font || accumulator.font,
      border: style.border || accumulator.border,
      alignment: style.alignment || accumulator.alignment,
    }),
    {}
  );
}

function applyCellStyle(sheet, address, style) {
  if (!sheet[address]) return;
  sheet[address].s = mergeStyles(sheet[address].s || {}, style);
}

function getColumnAlignment(column) {
  if (column.align) return column.align;
  if (column.type === "currency" || column.type === "number") return "right";
  if (column.type === "center") return "center";
  return "left";
}

function getDisplayLength(value, type) {
  if (type === "currency") {
    return formatRupiah(value).length;
  }

  if (type === "number") {
    return normalizeNumber(value).toLocaleString("id-ID").length;
  }

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

    return {
      wch: Math.min(column.maxWidth, Math.max(column.minWidth, contentWidth + 2)),
    };
  });
}

function buildRowHeights(metadataCount, rowCount) {
  return [
    { hpx: 34 },
    ...Array.from({ length: metadataCount }, () => ({ hpx: 22 })),
    { hpx: 10 },
    { hpx: 26 },
    ...Array.from({ length: rowCount }, () => ({ hpx: 22 })),
  ];
}

function buildWorksheet(config) {
  const title = config.title || "Laporan";
  const metadataRows = (config.metadataRows || []).map(([label, value]) => [
    normalizeText(label),
    normalizeText(value),
  ]);
  const columns = normalizeColumns(config.columns || []);
  const rows = normalizeRows(columns, config.rows || []);
  const rowMatrix = rows.map((row) => columns.map((column) => row[column.key]));
  const sheetRows = [
    [title],
    ...metadataRows,
    [],
    columns.map((column) => column.header),
    ...rowMatrix,
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  const lastColumnIndex = Math.max(columns.length - 1, 0);
  const lastColumnLetter = getColumnLetter(lastColumnIndex);
  const headerRowNumber = metadataRows.length + 3;
  const dataStartRowNumber = headerRowNumber + 1;
  const dataEndRowNumber = dataStartRowNumber + rows.length - 1;

  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastColumnIndex } },
    ...metadataRows
      .filter(() => lastColumnIndex >= 1)
      .map((_, index) => ({
        s: { r: index + 1, c: 1 },
        e: { r: index + 1, c: lastColumnIndex },
      })),
  ];
  worksheet["!cols"] = buildColumnWidths(columns, rows);
  worksheet["!rows"] = buildRowHeights(metadataRows.length, rows.length);

  if (rows.length) {
    worksheet["!autofilter"] = {
      ref: `A${headerRowNumber}:${lastColumnLetter}${dataEndRowNumber}`,
    };
  }

  const titleStyle = {
    fill: { patternType: "solid", fgColor: { rgb: TITLE_FILL } },
    font: { bold: true, sz: 16, color: { rgb: TEXT_DARK } },
    alignment: createAlignment("center"),
  };
  const metaLabelStyle = {
    fill: { patternType: "solid", fgColor: { rgb: META_FILL } },
    font: { bold: true, color: { rgb: TEXT_DARK } },
    border: createBorder(),
    alignment: createAlignment("left"),
  };
  const metaValueStyle = {
    border: createBorder(),
    alignment: createAlignment("left", true),
  };
  const headerStyle = {
    fill: { patternType: "solid", fgColor: { rgb: HEADER_FILL } },
    font: { bold: true, color: { rgb: TEXT_LIGHT } },
    border: createBorder(),
    alignment: createAlignment("center", true),
  };
  const defaultCellStyle = {
    border: createBorder(),
    alignment: createAlignment("left", true),
  };

  // SheetJS community reliably preserves structure, widths, and number formats.
  // The style objects below are kept so the workbook is ready for a style-capable
  // SheetJS-compatible writer if the project upgrades later.
  applyCellStyle(worksheet, "A1", titleStyle);

  metadataRows.forEach((_, index) => {
    const rowNumber = index + 2;
    applyCellStyle(worksheet, `A${rowNumber}`, metaLabelStyle);
    applyCellStyle(worksheet, `${lastColumnIndex >= 1 ? "B" : "A"}${rowNumber}`, metaValueStyle);
  });

  columns.forEach((_, index) => {
    applyCellStyle(worksheet, `${getColumnLetter(index)}${headerRowNumber}`, headerStyle);
  });

  rows.forEach((_, rowIndex) => {
    const rowNumber = dataStartRowNumber + rowIndex;

    columns.forEach((column, columnIndex) => {
      const cellAddress = `${getColumnLetter(columnIndex)}${rowNumber}`;
      applyCellStyle(
        worksheet,
        cellAddress,
        mergeStyles(defaultCellStyle, {
          alignment: createAlignment(
            getColumnAlignment(column),
            column.type !== "currency" && column.type !== "number"
          ),
        })
      );

      if (!worksheet[cellAddress]) return;
      if (column.type === "currency") {
        worksheet[cellAddress].z = CURRENCY_FORMAT;
      }
      if (column.type === "number") {
        worksheet[cellAddress].z = NUMBER_FORMAT;
      }
    });
  });

  return worksheet;
}

export function exportWorkbook(config) {
  const exportedAt = config.exportedAt ? new Date(config.exportedAt) : new Date();
  const workbook = XLSX.utils.book_new();
  const sheets = Array.isArray(config.sheets) ? config.sheets : [];
  const safeFileName =
    String(config.fileName || `Laporan_${formatDateInput(exportedAt)}.xlsx`).replace(
      /\.xlsx$/i,
      ""
    ) + ".xlsx";

  sheets.forEach((sheet, index) => {
    const worksheet = buildWorksheet(sheet);
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      sanitizeSheetName(sheet.name || `Sheet ${index + 1}`)
    );
  });

  workbook.Props = {
    Author: "Raja Aksesoris POS",
    Company: "Raja Aksesoris",
    CreatedDate: exportedAt,
    ...config.props,
  };

  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    cellStyles: true,
  });

  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    safeFileName
  );

  return safeFileName;
}
