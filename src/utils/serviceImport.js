import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { showNotification } from "../contexts/NotificationContext";
import { serviceCategories } from "../data/serviceProducts";
import { validateExcelImportFile } from "./excelFileGuard";

const categoryLabelByKey = serviceCategories.reduce((acc, category) => {
  acc[category.value] = category.label;
  acc[category.label.toLowerCase()] = category.label;
  acc[category.label.toLowerCase().replace(/\s+/g, "_")] = category.label;
  return acc;
}, {
  token: "Token Listrik",
  listrik: "Token Listrik",
  token_pln: "Token Listrik",
  voucher: "Voucher Game",
  game: "Voucher Game",
});

const categoryValueByLabel = serviceCategories.reduce((acc, category) => {
  acc[category.value] = category.value;
  acc[category.label.toLowerCase()] = category.value;
  acc[category.label.toLowerCase().replace(/\s+/g, "_")] = category.value;
  return acc;
}, {
  token: "token_listrik",
  listrik: "token_listrik",
  token_pln: "token_listrik",
  voucher: "voucher_game",
  game: "voucher_game",
});

const requiredFields = ["category", "provider", "name", "cost"];
const requiredFieldLabels = {
  category: "kategori",
  provider: "Provider",
  name: "nama_Layanan",
  cost: "modal",
};
const headerAliases = {
  category: ["kategori", "category"],
  provider: ["provider"],
  name: ["nama layanan", "nama layanan produk", "nama produk", "layanan"],
  serviceType: ["jenis", "jenis layanan", "tipe layanan", "group layanan", "paket"],
  cost: ["modal", "cost", "harga modal"],
  defaultPrice: ["harga jual", "harga default", "default price", "selling price"],
  status: ["status"],
};

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeCategory(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  return categoryValueByLabel[key] || "";
}

function inferCategory(categoryLabel, { provider, name, serviceType } = {}) {
  const serviceText = [provider, name, serviceType]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (serviceText.includes("multifinance")) return "multifinance";
  if (serviceText.includes("tv pasca") || serviceText.includes("tv paskabayar")) return "tv";
  if (serviceText.includes("telkom/indihome") || serviceText.includes("indihome")) {
    return "internet";
  }
  if (
    serviceText.includes("token pln") ||
    serviceText.includes("tagihan pln") ||
    String(provider || "").trim().toLowerCase() === "token"
  ) {
    return "token_listrik";
  }

  return normalizeCategory(categoryLabel);
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "aktif" || status === "active") return "Aktif";
  if (status === "nonaktif" || status === "non aktif" || status === "inactive") return "Nonaktif";
  return "";
}

function getColumnIndex(headers, aliases) {
  return headers.findIndex((header) => aliases.includes(header));
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

function worksheetToRows(worksheet) {
  if (!worksheet) return [];
  const columnCount = Math.max(worksheet.columnCount, 1);

  return Array.from({ length: worksheet.rowCount }, (_, rowIndex) => {
    const row = worksheet.getRow(rowIndex + 1);
    return Array.from({ length: columnCount }, (_, columnIndex) =>
      getCellValue(row.getCell(columnIndex + 1))
    );
  });
}

function parseMoneyNumber(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  const raw = String(value).trim();
  const integerLike = raw.replace(/[^\d-]/g, "");
  const number = Number(integerLike);
  return Number.isFinite(number) ? number : NaN;
}

export async function parseServiceWorkbook(file) {
  validateExcelImportFile(file);
  try {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const rows = worksheetToRows(workbook.worksheets[0]);

    if (rows.length < 2) {
      throw new Error("File Excel kosong atau tidak ada data layanan.");
    }

    const headers = rows[0].map(normalizeHeader);
    const missingHeaders = requiredFields
      .filter((field) => getColumnIndex(headers, headerAliases[field]) === -1)
      .map((field) => requiredFieldLabels[field]);

    if (missingHeaders.length) {
      throw new Error(
        `Header wajib: kategori, Provider, nama_Layanan, modal. Kolom opsional: jenis, harga_jual, Status. Kurang: ${missingHeaders.join(", ")}`
      );
    }

    const colIndex = {
      category: getColumnIndex(headers, headerAliases.category),
      provider: getColumnIndex(headers, headerAliases.provider),
      name: getColumnIndex(headers, headerAliases.name),
      serviceType: getColumnIndex(headers, headerAliases.serviceType),
      cost: getColumnIndex(headers, headerAliases.cost),
      defaultPrice: getColumnIndex(headers, headerAliases.defaultPrice),
      status: getColumnIndex(headers, headerAliases.status),
    };

    const products = [];
    const errors = [];

    let lastCategoryLabel = "";

    rows.slice(1).forEach((row, index) => {
      if (!row || row.every((cell) => String(cell || "").trim() === "")) return;

      const rowNumber = index + 2;
      const rawCategoryLabel = String(row[colIndex.category] || "").trim();
      if (rawCategoryLabel) {
        lastCategoryLabel = rawCategoryLabel;
      }
      const categoryLabel = rawCategoryLabel || lastCategoryLabel;
      const provider = String(row[colIndex.provider] || "").trim();
      const name = String(row[colIndex.name] || "").trim();
      const serviceType =
        colIndex.serviceType >= 0 ? String(row[colIndex.serviceType] || "").trim() : "";
      const rawCost = row[colIndex.cost];
      const rawDefaultPrice = colIndex.defaultPrice >= 0 ? row[colIndex.defaultPrice] : "";
      const statusLabel = colIndex.status >= 0 ? String(row[colIndex.status] || "").trim() : "Aktif";
      const category = inferCategory(categoryLabel, { provider, name, serviceType });
      const status = normalizeStatus(statusLabel);
      const cost = parseMoneyNumber(rawCost);
      const defaultPrice = parseMoneyNumber(rawDefaultPrice);
      const rowErrors = [];

      if (!categoryLabel) {
        rowErrors.push("Kategori wajib");
      } else if (!category) {
        rowErrors.push(`Kategori invalid: ${categoryLabel}`);
      }

      if (!provider) rowErrors.push("Provider wajib");
      if (!name) rowErrors.push("Nama Layanan wajib");
      if (category === "kuota" && !serviceType) {
        rowErrors.push("Jenis wajib untuk kategori Kuota");
      }

      if (cost === null) {
        rowErrors.push("Modal wajib");
      } else if (!Number.isFinite(cost) || cost <= 0) {
        rowErrors.push("Modal harus angka lebih dari 0");
      }

      if (defaultPrice !== null && (!Number.isFinite(defaultPrice) || defaultPrice < 0)) {
        rowErrors.push("Harga Default harus angka 0 atau lebih");
      }

      if (!statusLabel) {
        rowErrors.push("Status wajib");
      } else if (!status) {
        rowErrors.push("Status harus Aktif atau Nonaktif");
      }

      if (rowErrors.length) {
        errors.push({
          rowNumber,
          kategori: categoryLabel,
          provider,
          name,
          service_type: serviceType,
          cost: cost || 0,
          default_price: defaultPrice,
          status: statusLabel,
          errors: rowErrors,
        });
        return;
      }

      products.push({
        category,
        provider,
        name,
        service_type: serviceType,
        cost: Math.round(cost),
        default_price: defaultPrice === null ? null : Math.round(defaultPrice),
        active: status === "Aktif",
      });
    });

    return {
      products,
      errors,
      summary: {
        totalRows: rows.length - 1,
        valid: products.length,
        errors: errors.length,
      },
    };
  } catch (error) {
    throw new Error(`Format Excel tidak valid: ${error.message}`);
  }
}

async function saveWorkbook(workbook, fileName) {
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName
  );
}

export async function downloadServiceTemplate() {
  const rows = [
    ["kategori", "Provider", "nama_Layanan", "jenis", "modal", "harga_jual"],
    ["KUOTA", "XL", "48 GB 28 HR", "COMBO MAX 28 HARI", 84400, 89000],
    ["KUOTA", "XL", "FLEX M 5 GB Lokal s/d 10 GB 28 HR", "COMBO FLEX", 45500, 49000],
    ["PULSA", "TELKOMSEL", "Pulsa 10K", "", 9500, 10000],
    ["TOKEN", "PLN", "Token 20K", "", 19500, 20000],
  ];

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Template Layanan");
  rows.forEach((row) => worksheet.addRow(row));
  worksheet.columns = [
    { width: 18 },
    { width: 18 },
    { width: 36 },
    { width: 24 },
    { width: 14 },
    { width: 16 },
  ];
  worksheet.getRow(1).font = { bold: true };

  await saveWorkbook(workbook, "template_layanan_digital.xlsx");
  showNotification("success", "Template layanan digital berhasil didownload.");
}

export async function exportServicesToExcel(services) {
  const headers = ["kategori", "Provider", "nama_Layanan", "jenis", "modal", "harga_jual", "Status"];
  const rows = services.map((service) => [
    categoryLabelByKey[service.category] || service.category,
    service.provider,
    service.name,
    service.service_type || "",
    service.cost,
    service.default_price || "",
    service.active === false ? "Nonaktif" : "Aktif",
  ]);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Layanan Digital");
  [headers, ...rows].forEach((row) => worksheet.addRow(row));
  worksheet.columns = [
    { width: 18 },
    { width: 18 },
    { width: 36 },
    { width: 24 },
    { width: 14 },
    { width: 16 },
    { width: 12 },
  ];
  worksheet.getRow(1).font = { bold: true };

  await saveWorkbook(workbook, `layanan_digital_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showNotification("success", "Export layanan digital berhasil.");
}
