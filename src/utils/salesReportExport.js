import { saveAs } from "file-saver";
import * as XLSX from "xlsx/xlsx.mjs";
import { serviceTypeLabelMap } from "../data/businessOptions";
import { walletPlatformLabelMap } from "../data/businessOptions";
import { formatCashierName } from "./cashier";
import { formatDateInput, formatDateTime, formatRupiah } from "./format";

const REPORT_TITLE = "LAPORAN PENJUALAN RAJA AKSESORIS";
const SUMMARY_SHEET_NAME = "Summary";
const TRANSACTION_SHEET_NAME = "Transaksi";
const CURRENCY_FORMAT = '"Rp" #,##0';
const NUMBER_FORMAT = "#,##0";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const STYLE_IDS = {
  default: 0,
  title: 1,
  meta: 2,
  sectionHeader: 3,
  summaryLabel: 4,
  summaryValueText: 5,
  summaryValueNumber: 6,
  summaryValueCurrency: 7,
  tableHeader: 8,
  bodyText: 9,
  bodyCenter: 10,
  bodyNumber: 11,
  bodyCurrency: 12,
};

const CUSTOM_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="&quot;Rp&quot; #,##0"/>
    <numFmt numFmtId="165" formatCode="#,##0"/>
  </numFmts>
  <fonts count="4">
    <font><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="16"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD4AF37"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD1D5DB"/></left>
      <right style="thin"><color rgb="FFD1D5DB"/></right>
      <top style="thin"><color rgb="FFD1D5DB"/></top>
      <bottom style="thin"><color rgb="FFD1D5DB"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="13">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <xf numFmtId="165" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleMedium4"/>
</styleSheet>`;

const productColumns = [
  { key: "kategori", header: "Kategori", type: "text", minWidth: 16, maxWidth: 24 },
  { key: "namaBarang", header: "Nama Barang", type: "text", minWidth: 26, maxWidth: 42 },
  { key: "jenis", header: "Jenis", type: "text", minWidth: 14, maxWidth: 16 },
  { key: "merkKode", header: "Merk/Kode", type: "text", minWidth: 16, maxWidth: 24 },
  { key: "qty", header: "QTY", type: "number", minWidth: 10, maxWidth: 12 },
  { key: "modal", header: "Modal", type: "currency", minWidth: 16, maxWidth: 18 },
  { key: "hargaJual", header: "Harga Jual", type: "currency", minWidth: 16, maxWidth: 18 },
  { key: "margin", header: "Margin", type: "currency", minWidth: 16, maxWidth: 18 },
];

const transactionColumns = [
  { key: "noTransaksi", header: "No Transaksi", type: "text", minWidth: 20, maxWidth: 24 },
  { key: "tanggal", header: "Tanggal", type: "text", minWidth: 22, maxWidth: 24 },
  { key: "kasir", header: "Kasir", type: "text", minWidth: 18, maxWidth: 24 },
  { key: "produk", header: "Produk", type: "text", minWidth: 28, maxWidth: 46 },
  { key: "qty", header: "Qty", type: "number", minWidth: 10, maxWidth: 12 },
  { key: "harga", header: "Harga", type: "currency", minWidth: 16, maxWidth: 18 },
  { key: "total", header: "Total", type: "currency", minWidth: 16, maxWidth: 18 },
  { key: "metode", header: "Metode", type: "text", minWidth: 14, maxWidth: 18 },
];

function sanitizeText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function formatPaymentMethod(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) return "-";
  if (walletPlatformLabelMap[normalized]) return walletPlatformLabelMap[normalized];
  if (normalized === "tunai") return "Tunai";
  if (normalized === "qris") return "QRIS";
  if (normalized === "transfer") return "Transfer";

  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCompactAmount(value) {
  const amount = normalizeNumber(value);
  return amount > 0 ? amount.toLocaleString("id-ID") : "";
}

function buildDigitalProductName(transaction) {
  const serviceLabel =
    serviceTypeLabelMap[transaction.jenis] || sanitizeText(transaction.jenis, "Layanan");
  const provider = sanitizeText(transaction.provider, "");
  const nominalLabel = formatCompactAmount(transaction.nominal);

  return [serviceLabel, provider, nominalLabel].filter(Boolean).join(" - ");
}

function buildDigitalGroupKey(transaction) {
  return [
    sanitizeText(transaction.jenis, ""),
    sanitizeText(transaction.provider, ""),
    normalizeNumber(transaction.nominal),
    normalizeNumber(transaction.harga_jual),
    normalizeNumber(transaction.modal),
  ].join("::");
}

function compareDateAsc(left, right) {
  return new Date(left).getTime() - new Date(right).getTime();
}

function getColumnLetter(index) {
  let current = index + 1;
  let column = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    current = Math.floor((current - 1) / 26);
  }

  return column;
}

function getDisplayLength(value, type) {
  if (type === "currency") return formatRupiah(value).length;
  if (type === "number") return normalizeNumber(value).toLocaleString("id-ID").length;
  return sanitizeText(value).length;
}

function buildColumnWidths(columns, rows) {
  return columns.map((column) => {
    const contentWidth = rows.reduce((widest, row) => {
      return Math.max(widest, getDisplayLength(row[column.key], column.type));
    }, column.header.length);

    return {
      wch: Math.min(column.maxWidth, Math.max(column.minWidth, contentWidth + 2)),
    };
  });
}

function setNumberFormat(sheet, address, formatCode) {
  if (!sheet[address]) return;
  sheet[address].z = formatCode;
}

function buildSalesReportData({
  products = [],
  accessoryTransactions = [],
  digitalTransactions = [],
  logisticsTransactions = [],
}) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const groupedProducts = new Map();
  const transactionRows = [];

  let totalQty = 0;
  let totalOmzet = 0;
  let totalModal = 0;

  const sortedAccessoryTransactions = [...accessoryTransactions].sort((left, right) =>
    compareDateAsc(left.created_at, right.created_at)
  );
  const sortedDigitalTransactions = [...digitalTransactions].sort((left, right) =>
    compareDateAsc(left.created_at, right.created_at)
  );
  const sortedLogisticsTransactions = [...logisticsTransactions].sort((left, right) =>
    compareDateAsc(left.created_at, right.created_at)
  );

  sortedAccessoryTransactions.forEach((transaction) => {
    const items = Array.isArray(transaction.items) ? transaction.items : [];

    items.forEach((item) => {
      const qty = normalizeNumber(item.qty);
      const harga = normalizeNumber(item.harga_satuan);
      const total = normalizeNumber(item.subtotal || qty * harga);
      const product = productMap.get(item.produk_id);
      const modalSatuan = normalizeNumber(product?.harga_beli);
      const modal = modalSatuan * qty;
      const margin = total - modal;
      const productKey =
        product?.id || `aksesoris::${sanitizeText(item.nama_produk, "Produk")}::${harga}`;

      totalQty += qty;
      totalOmzet += total;
      totalModal += modal;

      if (!groupedProducts.has(productKey)) {
        groupedProducts.set(productKey, {
          kategori: sanitizeText(product?.kategori, "Aksesoris"),
          namaBarang: sanitizeText(item.nama_produk || product?.nama, "Produk"),
          jenis: "Aksesoris",
          merkKode: sanitizeText(product?.kode_produk, "-"),
          qty: 0,
          modal: 0,
          totalJual: 0,
          margin: 0,
        });
      }

      const grouped = groupedProducts.get(productKey);
      grouped.qty += qty;
      grouped.modal += modal;
      grouped.totalJual += total;
      grouped.margin += margin;

      transactionRows.push({
        createdAt: transaction.created_at,
        noTransaksi: sanitizeText(transaction.no_transaksi, `TRX-${transaction.id}`),
        tanggal: formatDateTime(transaction.created_at, {
          dateStyle: "medium",
          timeStyle: "short",
        }),
        kasir: formatCashierName(transaction.kasir_id),
        produk: sanitizeText(item.nama_produk || product?.nama, "Produk"),
        qty,
        harga,
        total,
        metode: formatPaymentMethod(transaction.metode_bayar),
      });
    });
  });

  sortedDigitalTransactions.forEach((transaction) => {
    const qty = 1;
    const harga = normalizeNumber(transaction.harga_jual);
    const modal = normalizeNumber(transaction.modal);
    const margin =
      typeof transaction.keuntungan === "number"
        ? normalizeNumber(transaction.keuntungan)
        : harga - modal;
    const productName = buildDigitalProductName(transaction);
    const groupKey = buildDigitalGroupKey(transaction);

    totalQty += qty;
    totalOmzet += harga;
    totalModal += modal;

    if (!groupedProducts.has(groupKey)) {
      groupedProducts.set(groupKey, {
        kategori: serviceTypeLabelMap[transaction.jenis] || "Layanan",
        namaBarang: productName,
        jenis: "Layanan",
        merkKode: sanitizeText(transaction.provider, "-"),
        qty: 0,
        modal: 0,
        totalJual: 0,
        margin: 0,
      });
    }

    const grouped = groupedProducts.get(groupKey);
    grouped.qty += qty;
    grouped.modal += modal;
    grouped.totalJual += harga;
    grouped.margin += margin;

    transactionRows.push({
      createdAt: transaction.created_at,
      noTransaksi: sanitizeText(transaction.no_transaksi, `LYN-${transaction.id}`),
      tanggal: formatDateTime(transaction.created_at, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      kasir: formatCashierName(transaction.kasir_id),
      produk: productName,
      qty,
      harga,
      total: harga,
      metode: "-",
    });
  });

  sortedLogisticsTransactions.forEach((transaction) => {
    const qty = 1;
    const harga = normalizeNumber(transaction.price || transaction.harga_jual);
    const modal = normalizeNumber(transaction.modal);
    const margin =
      typeof transaction.keuntungan === "number"
        ? normalizeNumber(transaction.keuntungan)
        : harga - modal;
    const courier = sanitizeText(transaction.courier || transaction.ekspedisi, "Kurir");
    const packageType = sanitizeText(transaction.packageType || transaction.package_type, "Regular");
    const receiver = sanitizeText(transaction.receiver || transaction.receiver_name, "Penerima");
    const destination = sanitizeText(transaction.destination, "-");
    const groupKey = `logistik::${courier}::${packageType}`;

    totalQty += qty;
    totalOmzet += harga;
    totalModal += modal;

    if (!groupedProducts.has(groupKey)) {
      groupedProducts.set(groupKey, {
        kategori: "Logistik",
        namaBarang: `${courier} ${packageType}`,
        jenis: "Logistik",
        merkKode: courier,
        qty: 0,
        modal: 0,
        totalJual: 0,
        margin: 0,
      });
    }

    const grouped = groupedProducts.get(groupKey);
    grouped.qty += qty;
    grouped.modal += modal;
    grouped.totalJual += harga;
    grouped.margin += margin;

    const paymentMethod =
      transaction.paymentMethod || transaction.payment_method || transaction.platform_sumber;

    transactionRows.push({
      createdAt: transaction.created_at,
      noTransaksi: sanitizeText(transaction.no_transaksi, `LOG-${transaction.id}`),
      tanggal: formatDateTime(transaction.created_at, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      kasir: formatCashierName(transaction.kasir_id),
      produk: `Logistik ${courier} - ${receiver} - ${destination}`,
      qty,
      harga,
      total: harga,
      metode: walletPlatformLabelMap[paymentMethod] || paymentMethod || "-",
    });
  });

  const productRows = [...groupedProducts.values()]
    .map((row) => ({
      kategori: row.kategori,
      namaBarang: row.namaBarang,
      jenis: row.jenis,
      merkKode: row.merkKode,
      qty: row.qty,
      modal: row.modal,
      hargaJual: row.qty ? Math.round(row.totalJual / row.qty) : 0,
      margin: row.margin,
    }))
    .sort((left, right) => {
      if (left.jenis !== right.jenis) {
        return left.jenis.localeCompare(right.jenis, "id-ID");
      }
      if (left.kategori !== right.kategori) {
        return left.kategori.localeCompare(right.kategori, "id-ID");
      }
      return left.namaBarang.localeCompare(right.namaBarang, "id-ID");
    });

  transactionRows.sort((left, right) => {
    const byDate = compareDateAsc(left.createdAt, right.createdAt);
    if (byDate !== 0) return byDate;
    return left.noTransaksi.localeCompare(right.noTransaksi, "id-ID");
  });

  return {
    totals: {
      totalTransactions:
        accessoryTransactions.length + digitalTransactions.length + logisticsTransactions.length,
      totalQty,
      totalOmzet,
      totalModal,
      totalMargin: totalOmzet - totalModal,
    },
    productRows,
    transactionRows,
  };
}

function buildSummarySheet(reportData, periodLabel, exportedAtLabel) {
  const rows = [
    [REPORT_TITLE],
    [`Periode: ${periodLabel}`],
    [`Diekspor: ${exportedAtLabel}`],
    [],
    ["RINGKASAN PENJUALAN"],
    ["Total Transaksi", reportData.totals.totalTransactions],
    ["Total Qty", reportData.totals.totalQty],
    ["Total Omzet", reportData.totals.totalOmzet],
    ["Total Modal", reportData.totals.totalModal],
    ["Total Margin", reportData.totals.totalMargin],
    [],
    ["DETAIL PENJUALAN PRODUK"],
    productColumns.map((column) => column.header),
    ...reportData.productRows.map((row) => productColumns.map((column) => row[column.key])),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const lastDataRow = 13 + reportData.productRows.length;

  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 7 } },
    { s: { r: 11, c: 0 }, e: { r: 11, c: 7 } },
  ];
  sheet["!cols"] = buildColumnWidths(productColumns, reportData.productRows);
  sheet["!rows"] = [
    { hpx: 30 },
    { hpx: 22 },
    { hpx: 22 },
    { hpx: 10 },
    { hpx: 24 },
    { hpx: 22 },
    { hpx: 22 },
    { hpx: 22 },
    { hpx: 22 },
    { hpx: 22 },
    { hpx: 10 },
    { hpx: 24 },
    { hpx: 24 },
    ...reportData.productRows.map(() => ({ hpx: 22 })),
  ];

  if (reportData.productRows.length) {
    sheet["!autofilter"] = {
      ref: `A13:H${lastDataRow}`,
    };
  }

  ["B8", "B9", "B10"].forEach((address) => setNumberFormat(sheet, address, CURRENCY_FORMAT));
  ["B6", "B7"].forEach((address) => setNumberFormat(sheet, address, NUMBER_FORMAT));

  reportData.productRows.forEach((_, index) => {
    const rowNumber = index + 14;
    setNumberFormat(sheet, `E${rowNumber}`, NUMBER_FORMAT);
    setNumberFormat(sheet, `F${rowNumber}`, CURRENCY_FORMAT);
    setNumberFormat(sheet, `G${rowNumber}`, CURRENCY_FORMAT);
    setNumberFormat(sheet, `H${rowNumber}`, CURRENCY_FORMAT);
  });

  const styleMap = new Map([
    ["A1", STYLE_IDS.title],
    ["A2", STYLE_IDS.meta],
    ["A3", STYLE_IDS.meta],
    ["A5", STYLE_IDS.sectionHeader],
    ["A12", STYLE_IDS.sectionHeader],
    ["A6", STYLE_IDS.summaryLabel],
    ["A7", STYLE_IDS.summaryLabel],
    ["A8", STYLE_IDS.summaryLabel],
    ["A9", STYLE_IDS.summaryLabel],
    ["A10", STYLE_IDS.summaryLabel],
    ["B6", STYLE_IDS.summaryValueNumber],
    ["B7", STYLE_IDS.summaryValueNumber],
    ["B8", STYLE_IDS.summaryValueCurrency],
    ["B9", STYLE_IDS.summaryValueCurrency],
    ["B10", STYLE_IDS.summaryValueCurrency],
  ]);

  for (let index = 0; index < productColumns.length; index += 1) {
    styleMap.set(`${getColumnLetter(index)}13`, STYLE_IDS.tableHeader);
  }

  reportData.productRows.forEach((_, index) => {
    const rowNumber = index + 14;
    styleMap.set(`A${rowNumber}`, STYLE_IDS.bodyText);
    styleMap.set(`B${rowNumber}`, STYLE_IDS.bodyText);
    styleMap.set(`C${rowNumber}`, STYLE_IDS.bodyCenter);
    styleMap.set(`D${rowNumber}`, STYLE_IDS.bodyText);
    styleMap.set(`E${rowNumber}`, STYLE_IDS.bodyNumber);
    styleMap.set(`F${rowNumber}`, STYLE_IDS.bodyCurrency);
    styleMap.set(`G${rowNumber}`, STYLE_IDS.bodyCurrency);
    styleMap.set(`H${rowNumber}`, STYLE_IDS.bodyCurrency);
  });

  return {
    sheet,
    styleMap,
  };
}

function buildTransactionSheet(reportData, periodLabel, exportedAtLabel) {
  const rows = [
    ["DETAIL TRANSAKSI PENJUALAN"],
    [`Periode: ${periodLabel}`],
    [`Diekspor: ${exportedAtLabel}`],
    [],
    transactionColumns.map((column) => column.header),
    ...reportData.transactionRows.map((row) => transactionColumns.map((column) => row[column.key])),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const lastDataRow = 5 + reportData.transactionRows.length;

  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
  ];
  sheet["!cols"] = buildColumnWidths(transactionColumns, reportData.transactionRows);
  sheet["!rows"] = [
    { hpx: 30 },
    { hpx: 22 },
    { hpx: 22 },
    { hpx: 10 },
    { hpx: 24 },
    ...reportData.transactionRows.map(() => ({ hpx: 22 })),
  ];

  if (reportData.transactionRows.length) {
    sheet["!autofilter"] = {
      ref: `A5:H${lastDataRow}`,
    };
  }

  reportData.transactionRows.forEach((_, index) => {
    const rowNumber = index + 6;
    setNumberFormat(sheet, `E${rowNumber}`, NUMBER_FORMAT);
    setNumberFormat(sheet, `F${rowNumber}`, CURRENCY_FORMAT);
    setNumberFormat(sheet, `G${rowNumber}`, CURRENCY_FORMAT);
  });

  const styleMap = new Map([
    ["A1", STYLE_IDS.title],
    ["A2", STYLE_IDS.meta],
    ["A3", STYLE_IDS.meta],
  ]);

  for (let index = 0; index < transactionColumns.length; index += 1) {
    styleMap.set(`${getColumnLetter(index)}5`, STYLE_IDS.tableHeader);
  }

  reportData.transactionRows.forEach((_, index) => {
    const rowNumber = index + 6;
    styleMap.set(`A${rowNumber}`, STYLE_IDS.bodyText);
    styleMap.set(`B${rowNumber}`, STYLE_IDS.bodyCenter);
    styleMap.set(`C${rowNumber}`, STYLE_IDS.bodyText);
    styleMap.set(`D${rowNumber}`, STYLE_IDS.bodyText);
    styleMap.set(`E${rowNumber}`, STYLE_IDS.bodyNumber);
    styleMap.set(`F${rowNumber}`, STYLE_IDS.bodyCurrency);
    styleMap.set(`G${rowNumber}`, STYLE_IDS.bodyCurrency);
    styleMap.set(`H${rowNumber}`, STYLE_IDS.bodyCenter);
  });

  return {
    sheet,
    styleMap,
  };
}

function getZipEntryIndex(zip, path) {
  return zip.FullPaths.findIndex((entryPath) => {
    const normalized = String(entryPath || "").replace(/^Root Entry\//, "");
    return normalized === path;
  });
}

function getZipEntryText(zip, path) {
  const index = getZipEntryIndex(zip, path);
  if (index < 0) {
    throw new Error(`Entry ${path} tidak ditemukan di workbook.`);
  }

  return textDecoder.decode(zip.FileIndex[index].content);
}

function setZipEntryText(zip, path, value) {
  const content = textEncoder.encode(value);
  const index = getZipEntryIndex(zip, path);

  if (index < 0) {
    XLSX.CFB.utils.cfb_add(zip, path, content, { unsafe: true });
    return;
  }

  zip.FileIndex[index].content = content;
  zip.FileIndex[index].size = content.length;
}

function applyCellStylesToSheetXml(xml, styleMap) {
  return xml.replace(/<c([^>]*\sr="([^"]+)"[^>]*)>/g, (match, attrs, reference) => {
    const styleId = styleMap.get(reference);

    if (styleId === undefined) return match;

    const sanitizedAttrs = attrs.replace(/\ss="\d+"/, "");
    return `<c${sanitizedAttrs} s="${styleId}">`;
  });
}

function addFreezePane(xml, ySplit, topLeftCell) {
  return xml.replace(
    /<sheetViews>\s*<sheetView([^>]*)\/>\s*<\/sheetViews>/,
    `<sheetViews><sheetView$1><pane ySplit="${ySplit}" topLeftCell="${topLeftCell}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="${topLeftCell}" sqref="${topLeftCell}"/></sheetView></sheetViews>`
  );
}

function finalizeWorkbook(buffer, sheetConfigs) {
  const zip = XLSX.CFB.read(new Uint8Array(buffer), { type: "array" });

  setZipEntryText(zip, "xl/styles.xml", CUSTOM_STYLES_XML);

  sheetConfigs.forEach((config, index) => {
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    let xml = getZipEntryText(zip, path);
    xml = applyCellStylesToSheetXml(xml, config.styleMap);
    xml = addFreezePane(xml, config.freezeRows, config.topLeftCell);
    setZipEntryText(zip, path, xml);
  });

  return XLSX.CFB.write(zip, {
    fileType: "zip",
    type: "array",
  });
}

export function buildSalesReportWorkbook(options = {}) {
  const exportedAt = options.exportedAt ? new Date(options.exportedAt) : new Date();
  const periodLabel = sanitizeText(options.periodLabel, "Semua periode");
  const reportData = buildSalesReportData({
    products: options.products,
    accessoryTransactions: options.accessoryTransactions,
    digitalTransactions: options.digitalTransactions,
    logisticsTransactions: options.logisticsTransactions,
  });
  const safeFileName =
    String(
      options.fileName || `laporan-penjualan-raja-aksesoris-${formatDateInput(exportedAt)}.xlsx`
    ).replace(/\.xlsx$/i, "") + ".xlsx";
  const exportedAtLabel = formatDateTime(exportedAt, {
    dateStyle: "full",
    timeStyle: "short",
  });

  const summarySheet = buildSummarySheet(reportData, periodLabel, exportedAtLabel);
  const transactionSheet = buildTransactionSheet(reportData, periodLabel, exportedAtLabel);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, summarySheet.sheet, SUMMARY_SHEET_NAME);
  XLSX.utils.book_append_sheet(workbook, transactionSheet.sheet, TRANSACTION_SHEET_NAME);

  workbook.Props = {
    Title: REPORT_TITLE,
    Subject: "Laporan penjualan aksesoris dan layanan",
    Author: "Raja Aksesoris POS",
    Company: "Raja Aksesoris",
    CreatedDate: exportedAt,
  };

  const rawBuffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });
  const buffer = finalizeWorkbook(rawBuffer, [
    { styleMap: summarySheet.styleMap, freezeRows: 13, topLeftCell: "A14" },
    { styleMap: transactionSheet.styleMap, freezeRows: 5, topLeftCell: "A6" },
  ]);

  return {
    buffer,
    fileName: safeFileName,
    reportData,
  };
}

export function exportSalesReport(options = {}) {
  const { buffer, fileName } = buildSalesReportWorkbook(options);

  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName
  );

  return fileName;
}
