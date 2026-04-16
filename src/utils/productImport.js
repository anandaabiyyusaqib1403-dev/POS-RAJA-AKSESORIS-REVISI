import * as XLSX from "xlsx";

const preferredSheetNames = ["Barang", "Produk", "Products"];
const defaultCategory = "Aksesoris Lainnya";

const categoryMatchers = [
  { category: "Tempered Glass", pattern: /(temper|glass|\btg\b)/i },
  { category: "Casing", pattern: /(casing|case\b|soft case|hard case)/i },
  { category: "Charger", pattern: /(charger|charge|car charger|travel charger|adaptor|adapter)/i },
  { category: "Power Bank", pattern: /(power ?bank)/i },
  {
    category: "Earphone",
    pattern: /(earphone|headset|headphone|handfree|handsfree|earbuds|tws)/i,
  },
  { category: "Holder HP", pattern: /(holder|car mount|phone stand|grip)/i },
  { category: "Tongsis", pattern: /(tongsis|tripod|selfie stick)/i },
  { category: "Memory Card", pattern: /(memory|micro ?sd|sd card)/i },
  { category: "Flashdisk OTG", pattern: /(flashdisk|flash drive)/i },
  { category: "Waterproof Case", pattern: /(waterproof)/i },
  { category: "Kabel", pattern: /(cable|kabel|aux|otg|usb\b|type c|lightning|micro)/i },
  { category: "Speaker", pattern: /(speaker)/i },
];

function normalizeText(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return String(value ?? "").trim();
}

function normalizeCode(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  return normalizeText(value).toUpperCase();
}

function parseInteger(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  const normalized = normalizeText(value).replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function hasProductColumns(row) {
  return Boolean(
    row &&
      (row["Nama Barang"] ||
        row["Nama Produk"] ||
        row.Nama ||
        row.Barcode ||
        row["ID Barang"])
  );
}

function resolveSheetName(workbook) {
  const preferredName = preferredSheetNames.find((name) => workbook.SheetNames.includes(name));
  if (preferredName) return preferredName;

  return workbook.SheetNames.find((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const [firstRow] = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: true });
    return hasProductColumns(firstRow);
  });
}

export function inferProductCategory(name) {
  const productName = normalizeText(name);
  if (!productName) return defaultCategory;

  const matched = categoryMatchers.find(({ pattern }) => pattern.test(productName));
  return matched?.category || defaultCategory;
}

export function parseProductWorkbookData(workbook) {
  const sheetName = resolveSheetName(workbook);
  if (!sheetName) {
    throw new Error(
      'Sheet produk tidak ditemukan. Gunakan file dengan sheet "Barang" atau kolom nama produk.'
    );
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: true });
  if (!rows.length) {
    throw new Error(`Sheet "${sheetName}" kosong dan belum bisa diimpor.`);
  }

  const products = [];
  const importedCodes = new Set();
  let skippedRows = 0;

  rows.forEach((row) => {
    const kodeProduk = normalizeCode(row.Barcode || row["Kode Produk"] || row["ID Barang"]);
    const namaProduk = normalizeText(row["Nama Barang"] || row["Nama Produk"] || row.Nama);

    if (!kodeProduk || !namaProduk || importedCodes.has(kodeProduk)) {
      skippedRows += 1;
      return;
    }

    importedCodes.add(kodeProduk);
    const statusText = normalizeText(row.Ket || row.Status).toLowerCase();

    products.push({
      kode_produk: kodeProduk,
      nama: namaProduk,
      kategori: normalizeText(row.Kategori) || inferProductCategory(namaProduk),
      stok: parseInteger(row.Stok),
      stok_minimum: 3,
      harga_beli: parseInteger(row["Harga Modal"] || row["Harga Beli"]),
      harga_jual: parseInteger(row["Harga Jual"]),
      satuan: normalizeText(row.Satuan) || "pcs",
      aktif:
        !statusText ||
        (!statusText.includes("nonaktif") && !statusText.includes("tidak aktif")),
    });
  });

  if (!products.length) {
    throw new Error("Tidak ada produk valid yang bisa diimpor dari file Excel ini.");
  }

  return {
    products,
    summary: {
      sheetName,
      totalRows: rows.length,
      importedRows: products.length,
      skippedRows,
    },
  };
}

export async function parseProductWorkbook(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    raw: true,
  });

  return parseProductWorkbookData(workbook);
}
