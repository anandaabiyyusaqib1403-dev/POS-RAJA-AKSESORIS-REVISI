import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { validateExcelImportFile } from "./excelFileGuard";

export const productImportColumns = [
  "kategori",
  "nama_barang",
  "jenis",
  "kode",
  "modal",
  "harga_jual",
  "stok",
];

const requiredColumns = productImportColumns;
const templateSheetName = "Template Produk";
const preferredSheetNames = [templateSheetName, "Produk"];

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeCode(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value)).toUpperCase();
  }

  return normalizeText(value).toUpperCase();
}

function hasCurrencyText(value) {
  return /(^|\s)rp\.?\s?/i.test(String(value ?? ""));
}

function hasCurrencyFormat(cell) {
  return /rp|\$/i.test(String(cell?.numFmt || cell?.text || ""));
}

function isStrictNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function buildHeaderMap(headerRow) {
  return headerRow.reduce((acc, value, index) => {
    const header = normalizeText(value);
    if (header) acc.set(header, index);
    return acc;
  }, new Map());
}

function validateHeaders(headerMap) {
  const actualHeaders = [...headerMap.keys()];
  const missingColumns = requiredColumns.filter((column) => !headerMap.has(column));
  const unexpectedColumns = actualHeaders.filter((column) => !requiredColumns.includes(column));

  if (missingColumns.length || unexpectedColumns.length) {
    const details = [
      missingColumns.length ? `Kolom wajib belum ada: ${missingColumns.join(", ")}` : "",
      unexpectedColumns.length ? `Kolom tidak sesuai format: ${unexpectedColumns.join(", ")}` : "",
    ].filter(Boolean);

    throw new Error(
      `${details.join(". ")}. Format wajib harus persis: ${requiredColumns.join(", ")}.`
    );
  }
}

function readCell(worksheet, rowIndex, columnIndex) {
  return worksheet.getRow(rowIndex + 1).getCell(columnIndex + 1);
}

function getCellValue(cell) {
  const value = cell?.value;

  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;
  if ("result" in value) return value.result ?? "";
  if ("text" in value) return value.text ?? "";
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text || "").join("");
  }

  return cell.text || "";
}

function getRowValues(worksheet, rowNumber, columnCount = worksheet.columnCount) {
  const row = worksheet.getRow(rowNumber);
  return Array.from({ length: columnCount }, (_, index) =>
    getCellValue(row.getCell(index + 1))
  );
}

function validateNumericCell({ worksheet, rowIndex, columnIndex, columnName, rawValue, errors }) {
  const cell = readCell(worksheet, rowIndex, columnIndex);

  if (rawValue === "" || rawValue === null || rawValue === undefined) {
    errors.push(`${columnName} wajib diisi angka`);
    return 0;
  }

  if (hasCurrencyText(rawValue) || hasCurrencyFormat(cell)) {
    errors.push(`${columnName} harus angka polos tanpa format mata uang/Rp`);
    return 0;
  }

  if (!isStrictNumber(rawValue)) {
    errors.push(`${columnName} harus berupa angka, bukan teks`);
    return 0;
  }

  if (rawValue < 0) {
    errors.push(`${columnName} tidak boleh negatif`);
    return 0;
  }

  return Math.round(rawValue);
}

function parseProductRow({ worksheet, row, rowIndex, headerMap, importedCodes }) {
  const errors = [];
  const getValue = (column) => row[headerMap.get(column)];
  const namaBarang = normalizeText(getValue("nama_barang"));
  const kode = normalizeCode(getValue("kode"));

  if (!namaBarang) errors.push("nama_barang tidak boleh kosong");
  if (!kode) errors.push("kode wajib diisi");
  if (kode && importedCodes.has(kode)) errors.push(`kode ${kode} duplikat di file import`);

  const modal = validateNumericCell({
    worksheet,
    rowIndex,
    columnIndex: headerMap.get("modal"),
    columnName: "modal",
    rawValue: getValue("modal"),
    errors,
  });
  const hargaJual = validateNumericCell({
    worksheet,
    rowIndex,
    columnIndex: headerMap.get("harga_jual"),
    columnName: "harga_jual",
    rawValue: getValue("harga_jual"),
    errors,
  });
  const stok = validateNumericCell({
    worksheet,
    rowIndex,
    columnIndex: headerMap.get("stok"),
    columnName: "stok",
    rawValue: getValue("stok"),
    errors,
  });

  if (!Number.isInteger(stok)) {
    errors.push("stok harus angka bulat");
  }

  if (errors.length) {
    return {
      valid: false,
      errorRow: {
        rowNumber: rowIndex + 1,
        kode: kode || "-",
        nama: namaBarang || "-",
        errors,
      },
    };
  }

  importedCodes.add(kode);

  return {
    valid: true,
    product: {
      kode_produk: kode,
      nama: namaBarang,
      kategori: normalizeText(getValue("kategori")),
      jenis: normalizeText(getValue("jenis")),
      stok,
      stok_minimum: 3,
      harga_beli: modal,
      harga_jual: hargaJual,
      satuan: "pcs",
      aktif: true,
    },
  };
}

export function parseProductWorkbookData(workbook) {
  const preferredSheet = preferredSheetNames
    .map((name) => workbook.getWorksheet(name))
    .find(Boolean);
  const worksheet = preferredSheet || workbook.worksheets[0];
  const sheetName = worksheet?.name;

  if (!sheetName) {
    throw new Error("File Excel tidak memiliki sheet produk.");
  }

  if (worksheet.rowCount < 2) {
    throw new Error(`Sheet "${sheetName}" harus memiliki header dan minimal 1 baris produk.`);
  }

  const columnCount = Math.max(worksheet.columnCount, requiredColumns.length);
  const headerMap = buildHeaderMap(getRowValues(worksheet, 1, columnCount));
  validateHeaders(headerMap);

  const products = [];
  const errorRows = [];
  const importedCodes = new Set();
  const dataColumnCount = Math.max(columnCount, Math.max(...headerMap.values()) + 1);

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const rowIndex = rowNumber - 1;
    const row = getRowValues(worksheet, rowNumber, dataColumnCount);
    const isEmptyRow = requiredColumns.every((column) => normalizeText(row[headerMap.get(column)]) === "");
    if (isEmptyRow) continue;

    const result = parseProductRow({
      worksheet,
      row,
      rowIndex,
      headerMap,
      importedCodes,
    });

    if (result.valid) {
      products.push(result.product);
      continue;
    }

    errorRows.push(result.errorRow);
  }

  return {
    products,
    errorRows,
    summary: {
      sheetName,
      totalRows: Math.max(worksheet.rowCount - 1, 0),
      importedRows: products.length,
      errorRows: errorRows.length,
      requiredColumns,
    },
  };
}

export async function parseProductWorkbook(file) {
  validateExcelImportFile(file);
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  return parseProductWorkbookData(workbook);
}

export async function downloadProductImportTemplate() {
  const sampleRows = [
    ["Casing", "Casing Samsung A15 Anti Crack", "Aksesoris", "RAJA-CS-A15-001", 18000, 30000, 10],
    ["Tempered Glass", "Tempered Glass Oppo A38", "Aksesoris", "RAJA-TG-A38-001", 7000, 15000, 20],
    ["Charger", "Charger Fast Charging 20W", "Aksesoris", "RAJA-CHR-20W-001", 28000, 45000, 8],
  ];
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(templateSheetName);
  const headerRow = worksheet.addRow(productImportColumns);

  sampleRows.forEach((row) => worksheet.addRow(row));

  worksheet.columns = [
    { width: 18 },
    { width: 34 },
    { width: 16 },
    { width: 22 },
    { width: 12 },
    { width: 14 },
    { width: 10 },
  ];

  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF0F172A" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD4AF37" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = 22;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
  });

  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();

  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "template-import-produk-raja-aksesoris.xlsx"
  );
}

export async function exportProductsToExcel(products = [], fileName = "stok-barang.xlsx") {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Stok Barang");
  const headerRow = worksheet.addRow([
    "Barcode",
    "Nama Barang",
    "Kategori",
    "Stok",
    "Stok Minimum",
    "Harga Modal",
    "Harga Jual",
    "Status",
  ]);

  products.forEach((product) => {
    const stock = Number(product.stok || 0);
    const minimumStock = Number(product.stok_minimum || 0);
    const status =
      product.status === "inactive" || product.aktif === false
        ? "Nonaktif"
        : stock === 0
          ? "Habis"
          : stock <= minimumStock
            ? "Menipis"
            : "Aman";

    worksheet.addRow([
      product.kode_produk || "",
      product.nama || "",
      product.kategori || "",
      stock,
      minimumStock,
      Number(product.harga_beli || 0),
      Number(product.harga_jual || 0),
      status,
    ]);
  });

  worksheet.columns = [
    { width: 22 },
    { width: 34 },
    { width: 20 },
    { width: 10 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
  ];
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF0F172A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD4AF37" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  worksheet.getColumn(6).numFmt = '"Rp" #,##0';
  worksheet.getColumn(7).numFmt = '"Rp" #,##0';

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName
  );
}
