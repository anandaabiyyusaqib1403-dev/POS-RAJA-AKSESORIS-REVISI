import logo from "../assets/raja-aksesoris-logo.png";
import { walletPlatformLabelMap } from "../data/businessOptions.js";
import { formatCashierName } from "./cashier.js";
import { formatRupiah } from "./format.js";

export const receiptStoreProfile = {
  name: "RAJA AKSESORIS",
  addressLines: [
    "Jl. Bango Raya No.3",
    "Jakarta Selatan",
  ],
  phone: "+62 817-9815-300",
  logoSrc: logo,
};

export const RECEIPT_PRINTER_SETTINGS_KEY = "raja_pos_receipt_printer_settings";
export const receiptPrinterProfiles = {
  "58mm": {
    id: "58mm",
    label: "Thermal 58mm",
    widthPx: 280,
    windowWidth: 380,
    fontSizePx: 12,
  },
  "80mm": {
    id: "80mm",
    label: "Thermal 80mm",
    widthPx: 320,
    windowWidth: 420,
    fontSizePx: 13,
  },
};
export const defaultReceiptPrinterSettings = {
  profile: "80mm",
  autoClose: true,
};

export function getReceiptPrinterSettings() {
  if (typeof window === "undefined") return defaultReceiptPrinterSettings;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECEIPT_PRINTER_SETTINGS_KEY) || "{}");
    const profile = receiptPrinterProfiles[parsed.profile] ? parsed.profile : defaultReceiptPrinterSettings.profile;

    return {
      ...defaultReceiptPrinterSettings,
      ...parsed,
      profile,
    };
  } catch {
    return defaultReceiptPrinterSettings;
  }
}

export function saveReceiptPrinterSettings(settings = {}) {
  if (typeof window === "undefined") return getReceiptPrinterSettings();

  const nextSettings = {
    ...getReceiptPrinterSettings(),
    ...settings,
  };
  nextSettings.profile = receiptPrinterProfiles[nextSettings.profile]
    ? nextSettings.profile
    : defaultReceiptPrinterSettings.profile;

  window.localStorage.setItem(RECEIPT_PRINTER_SETTINGS_KEY, JSON.stringify(nextSettings));
  return nextSettings;
}

function getReceiptPrinterProfile(options = {}) {
  const settings = {
    ...getReceiptPrinterSettings(),
    ...options,
  };
  return receiptPrinterProfiles[settings.profile] || receiptPrinterProfiles[defaultReceiptPrinterSettings.profile];
}

function createPrintResult(overrides = {}) {
  const printJobId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `print-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    ok: false,
    status: "failed",
    blocked: false,
    transactionId: null,
    printJobId,
    printerProfile: getReceiptPrinterSettings().profile,
    message: "Struk belum dicetak.",
    ...overrides,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeReceiptDate(value) {
  const parsedDate = value ? new Date(value) : new Date();
  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
}

export function formatReceiptCashierName(value) {
  return formatCashierName(value);
}

export function formatReceiptPaymentMethod(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();

  if (walletPlatformLabelMap[normalizedValue]) {
    return walletPlatformLabelMap[normalizedValue];
  }

  if (!normalizedValue) return "Cash";
  if (normalizedValue === "tunai") return "Tunai";
  if (normalizedValue === "cash") return "Cash";
  if (normalizedValue === "qris") return "QRIS";
  if (normalizedValue === "transfer") return "Transfer";
  if (normalizedValue === "bank_mas") return "Bank Mas";
  if (normalizedValue === "pasar_kuota") return "PASAR KUOTA";

  return normalizedValue.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildReceiptItems(transaction) {
  const accessoryItems = Array.isArray(transaction?.items) ? transaction.items : [];
  if (accessoryItems.length) {
    return accessoryItems.map((item, index) => {
      const qty = Number(item.qty || 0);
      const unitPrice = Number(item.harga_satuan || 0);
      const subtotal = Number(item.subtotal ?? qty * unitPrice);

      return {
        key: item.id || `${index}-${item.nama_produk || "item"}`,
        name: item.nama_produk || "Produk",
        qty,
        unitPrice,
        subtotal,
      };
    });
  }

  const digitalItems = Array.isArray(transaction?.transaction_items)
    ? transaction.transaction_items
    : [];
  if (digitalItems.length) {
    return digitalItems.map((item, index) => {
      const qty = Number(item.qty || 1);
      const unitPrice = Number(
        item.selling_price ??
          item.price ??
          transaction?.selling_price ??
          transaction?.harga_jual ??
          0
      );
      const subtotal = Number(item.subtotal ?? qty * unitPrice);

      return {
        key: item.id || `${index}-${item.product_name_snapshot || "item"}`,
        name:
          item.product_name_snapshot ||
          item.product_name ||
          transaction?.product_name ||
          transaction?.catatan ||
          "Layanan",
        qty,
        unitPrice,
        subtotal,
      };
    });
  }

  const fallbackName =
    transaction?.product_name ||
    transaction?.catatan ||
    transaction?.provider ||
    transaction?.jenis ||
    "";
  const fallbackTotal = Number(
    transaction?.total_bayar ??
      transaction?.selling_price ??
      transaction?.harga_jual ??
      0
  );

  if (!fallbackName || fallbackTotal <= 0) {
    return [];
  }

  return [
    {
      key: transaction?.id || "fallback-item",
      name: fallbackName,
      qty: 1,
      unitPrice: fallbackTotal,
      subtotal: fallbackTotal,
    },
  ];
}

export function buildReceiptPrintModel(transaction) {
  const normalizedItems = buildReceiptItems(transaction).map((item, index) => {
    const qty = Number(item.qty || 0);
    const unitPrice = Number(item.unitPrice ?? item.harga_satuan ?? 0);
    const subtotal = Number(item.subtotal ?? qty * unitPrice);

    return {
      key: item.key || item.id || `${index}-${item.name || item.nama_produk || "item"}`,
      name: item.name || item.nama_produk || "Produk",
      qty,
      unitPrice,
      subtotal,
    };
  });

  const date = normalizeReceiptDate(transaction?.created_at);
  const subtotal = normalizedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const total = Number(
    transaction?.total_bayar ??
      transaction?.selling_price ??
      transaction?.harga_jual ??
      subtotal
  );
  const paid = Number(transaction?.uang_diterima ?? total);
  const change = Number(transaction?.kembalian ?? Math.max(0, paid - total));

  return {
    store: receiptStoreProfile,
    noTransaksi: transaction?.no_transaksi || "TRX-0000",
    dateLabel: date.toLocaleDateString("id-ID"),
    timeLabel: date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    cashierLabel: formatReceiptCashierName(
      transaction?.kasir_nama ||
        transaction?.cashier_name ||
        transaction?.kasir ||
        transaction?.kasir_id
    ),
    paymentMethodLabel: formatReceiptPaymentMethod(
      transaction?.metode_bayar || transaction?.payment_method
    ),
    items: normalizedItems,
    totalQty: normalizedItems.reduce((sum, item) => sum + item.qty, 0),
    subtotal,
    total,
    paid,
    change,
    note: String(transaction?.catatan || "").trim(),
  };
}

export function generateReceiptHTML(transaction, options = {}) {
  const receipt = buildReceiptPrintModel(transaction);
  const printerProfile = getReceiptPrinterProfile(options);
  const receiptWidth = printerProfile.widthPx;
  const fontSize = printerProfile.fontSizePx;

  const itemMarkup = receipt.items.length
    ? receipt.items
        .map(
          (item, index) => `
            <div class="item-block" data-key="${escapeHtml(item.key)}">
              <div class="item-name">${index + 1}. ${escapeHtml(item.name)}</div>
              <div class="item-row">
                <span>${escapeHtml(item.qty)} x ${escapeHtml(formatRupiah(item.unitPrice))}</span>
                <span class="item-total">${escapeHtml(formatRupiah(item.subtotal))}</span>
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state">Belum ada item transaksi.</div>`;

  const noteMarkup = receipt.note
    ? `
      <section class="section">
        <div class="separator"></div>
        <div class="note-label">Catatan</div>
        <div>${escapeHtml(receipt.note)}</div>
      </section>
    `
    : "";

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Struk ${escapeHtml(receipt.noTransaksi)}</title>
  <style>
    * {
      box-sizing: border-box;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: "Courier New", Courier, monospace;
    }

    body {
      width: ${receiptWidth}px;
      font-size: ${fontSize}px;
      line-height: 1.5;
    }

    #print-area {
      width: ${receiptWidth}px;
      padding: 0;
      overflow: hidden;
    }

    .header,
    .footer {
      text-align: center;
    }

    .brand-strip {
      height: 7px;
      background: linear-gradient(90deg, #0f172a 0%, #d4af37 45%, #0f172a 100%);
    }

    .receipt-body {
      padding: 12px;
    }

    .logo-frame {
      width: 64px;
      height: 64px;
      margin: 0 auto 8px;
      padding: 8px;
      border: 1px solid #d4af37;
      border-radius: 12px;
      background: #ffffff;
    }

    .logo {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .store-name {
      font-size: 17px;
      font-weight: 900;
      letter-spacing: 0.14em;
      margin: 0;
    }

    .gold-line {
      width: 80px;
      height: 2px;
      margin: 7px auto 0;
      border-radius: 99px;
      background: #d4af37;
    }

    .subtle {
      margin-top: 6px;
      font-size: 12px;
      line-height: 1.45;
    }

    .receipt-pill {
      display: inline-block;
      margin-top: 10px;
      padding: 4px 10px;
      border-radius: 5px;
      background: #0f172a;
      color: #ffffff;
      font-size: 9px;
      font-weight: 900;
      letter-spacing: 0.18em;
    }

    .section {
      margin-top: 12px;
    }

    .meta-card {
      margin-top: 12px;
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
    }

    .separator {
      border-top: 1px dashed #000000;
      margin-bottom: 10px;
    }

    .meta-row,
    .summary-row,
    .item-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: start;
    }

    .item-block + .item-block {
      margin-top: 10px;
    }

    .item-name {
      font-weight: 700;
      margin-bottom: 2px;
      word-break: break-word;
    }

    .item-total,
    .align-right {
      text-align: right;
    }

    .total-row {
      font-weight: 700;
      font-size: 14px;
      margin-top: 2px;
    }

    .total-card {
      margin: 8px 0;
      padding: 7px 9px;
      border-radius: 8px;
      background: #0f172a;
      color: #ffffff;
    }

    .note-label {
      font-weight: 700;
      margin-bottom: 4px;
    }

    .footer {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px dashed #000000;
    }

    .receipt-mark {
      margin-top: 8px;
      font-weight: 700;
      letter-spacing: 0.18em;
    }

    .empty-state {
      padding: 2px 0;
    }

    @page {
      margin: 0;
    }

    @media print {
      html,
      body {
        margin: 0;
        padding: 0;
      }

      #print-area {
        position: absolute;
        top: 0;
        left: 0;
        width: ${receiptWidth}px;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <main id="print-area">
    <div class="brand-strip"></div>
    <div class="receipt-body">
    <header class="header">
      <div class="logo-frame">
        <img src="${receipt.store.logoSrc}" alt="Logo Raja Aksesoris" class="logo" />
      </div>
      <p class="store-name">${escapeHtml(receipt.store.name)}</p>
      <div class="gold-line"></div>
      <div class="subtle">
        ${receipt.store.addressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
        <div>${escapeHtml(receipt.store.phone)}</div>
      </div>
      <div class="receipt-pill">STRUK PEMBAYARAN</div>
    </header>

    <section class="meta-card">
      <div class="meta-row"><span>No</span><span>${escapeHtml(receipt.noTransaksi)}</span></div>
      <div class="meta-row"><span>Tanggal</span><span>${escapeHtml(receipt.dateLabel)}</span></div>
      <div class="meta-row"><span>Jam</span><span>${escapeHtml(receipt.timeLabel)}</span></div>
      <div class="meta-row"><span>Kasir</span><span>${escapeHtml(receipt.cashierLabel)}</span></div>
      <div class="meta-row"><span>Bayar via</span><span>${escapeHtml(receipt.paymentMethodLabel)}</span></div>
    </section>

    <section class="section">
      <div class="separator"></div>
      ${itemMarkup}
    </section>

    <section class="section">
      <div class="separator"></div>
      <div class="summary-row"><span>Total QTY</span><span>${escapeHtml(receipt.totalQty)} item</span></div>
      <div class="summary-row"><span>Subtotal</span><span>${escapeHtml(formatRupiah(receipt.subtotal))}</span></div>
      <div class="total-card">
        <div class="summary-row total-row"><span>TOTAL</span><span>${escapeHtml(formatRupiah(receipt.total))}</span></div>
      </div>
      <div class="summary-row"><span>Bayar</span><span>${escapeHtml(formatRupiah(receipt.paid))}</span></div>
      <div class="summary-row"><span>Kembali</span><span>${escapeHtml(formatRupiah(receipt.change))}</span></div>
    </section>

    ${noteMarkup}

    <footer class="footer">
      <div>Terima kasih telah berbelanja</div>
      <div>Cek barang sebelum meninggalkan toko</div>
      <div class="receipt-mark">RAJA POS</div>
    </footer>
    </div>
  </main>
</body>
</html>
  `.trim();
}

export function openReceiptPrintWindow(options = {}) {
  if (typeof window === "undefined") return null;
  const printerProfile = getReceiptPrinterProfile(options);
  return window.open("", "_blank", `width=${printerProfile.windowWidth},height=720`);
}

export function printTransactionReceiptWithStatus(transaction, existingWindow = null, options = {}) {
  const printerProfile = getReceiptPrinterProfile(options);
  const printWindow = existingWindow || openReceiptPrintWindow(options);
  if (!printWindow) {
    return createPrintResult({
      blocked: true,
      transactionId: transaction?.id || transaction?.no_transaksi || null,
      printerProfile: printerProfile.id,
      message: "Popup print diblokir browser.",
    });
  }

  try {
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };

    printWindow.document.open();
    printWindow.document.write(generateReceiptHTML(transaction, options));
    printWindow.document.close();
    return createPrintResult({
      ok: true,
      status: "opened",
      transactionId: transaction?.id || transaction?.no_transaksi || null,
      printerProfile: printerProfile.id,
      message: "Jendela cetak sudah dibuka.",
    });
  } catch (error) {
    try {
      printWindow.close();
    } catch {
      // Browser may already have closed the print window.
    }
    return createPrintResult({
      transactionId: transaction?.id || transaction?.no_transaksi || null,
      printerProfile: printerProfile.id,
      message: error?.message || "Jendela cetak gagal disiapkan.",
    });
  }
}

export function printTransactionReceipt(transaction, existingWindow = null, options = {}) {
  return printTransactionReceiptWithStatus(transaction, existingWindow, options).ok;
}

function normalizeReturnReceiptType(type) {
  return type === "customer" ? "customer" : "supplier";
}

function formatReturnStatus(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  const statusLabels = {
    pending: "Pending",
    diganti_barang: "Diganti Barang",
    refund_uang: "Refund Uang",
    potong_tagihan: "Potong Tagihan",
    ditolak: "Ditolak",
    selesai: "Selesai",
  };

  return statusLabels[normalizedValue] || normalizedValue.replace(/\b\w/g, (letter) => letter.toUpperCase()) || "-";
}

function formatReturnReason(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  const reasonLabels = {
    rusak: "Rusak",
    cacat: "Cacat",
    salah_barang: "Salah Barang",
    tidak_sesuai: "Tidak Sesuai",
    tidak_laku: "Tidak Laku",
    lainnya: "Lainnya",
  };

  return reasonLabels[normalizedValue] || normalizedValue.replace(/\b\w/g, (letter) => letter.toUpperCase()) || "-";
}

function normalizeWarrantyOutcome(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (normalizedValue === "exchange" || normalizedValue === "warranty_exchange") return "exchange";
  if (normalizedValue === "rejected" || normalizedValue === "ditolak" || normalizedValue === "warranty_rejected") {
    return "rejected";
  }
  return "refund";
}

function formatWarrantyOutcome(value) {
  const labels = {
    exchange: "Tukar Barang",
    refund: "Refund",
    rejected: "Ditolak",
  };

  return labels[normalizeWarrantyOutcome(value)] || "-";
}

function buildReturnReceiptItems(returnRow, type) {
  const valueKey = type === "customer" ? "unit_price" : "unit_cost";
  const subtotalKey = type === "customer" ? "subtotal_refund" : "subtotal_cost";

  return (Array.isArray(returnRow?.items) ? returnRow.items : []).map((item, index) => {
    const qty = Number(item.quantity || 0);
    const unitValue = Number(item[valueKey] || 0);
    const subtotal = Number(item[subtotalKey] ?? qty * unitValue);

    return {
      key: item.id || `${index}-${item.product_name || "item"}`,
      name: item.product_name || "Produk",
      code: item.product_code || "",
      qty,
      unitValue,
      subtotal,
      condition: item.condition || returnRow?.condition || "",
      notes: item.notes || "",
    };
  });
}

export function buildReturnReceiptPrintModel(returnRow, type = "supplier") {
  const normalizedType = normalizeReturnReceiptType(type);
  const isCustomer = normalizedType === "customer";
  const date = normalizeReceiptDate(returnRow?.created_at);
  const items = buildReturnReceiptItems(returnRow, normalizedType);
  const computedTotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const totalValue = Number(
    isCustomer
      ? returnRow?.total_refund_amount ?? computedTotal
      : returnRow?.total_estimated_value ?? computedTotal
  );
  const settlementAmount = Number(returnRow?.settlement_amount || 0);
  const warrantyOutcome = isCustomer
    ? normalizeWarrantyOutcome(returnRow?.warranty_outcome || returnRow?.refund_method)
    : "";

  return {
    store: receiptStoreProfile,
    type: normalizedType,
    title: isCustomer ? "BUKTI GARANSI KONSUMEN" : "BUKTI RETUR SUPPLIER",
    numberLabel: isCustomer ? "No Klaim" : "No Retur",
    noRetur: returnRow?.no_retur || "RTR-0000",
    dateLabel: date.toLocaleDateString("id-ID"),
    timeLabel: date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    partyLabel: isCustomer ? "Konsumen" : "Supplier",
    partyName:
      isCustomer
        ? returnRow?.customer_name || "-"
        : returnRow?.supplier_name || "-",
    transactionNo: returnRow?.transaction_no || "",
    statusLabel: formatReturnStatus(returnRow?.status),
    reasonLabel: formatReturnReason(returnRow?.reason),
    condition: String(returnRow?.condition || "").trim(),
    refundMethod: String(returnRow?.refund_method || "").trim(),
    warrantyOutcome,
    warrantyOutcomeLabel: isCustomer ? formatWarrantyOutcome(returnRow?.warranty_outcome || returnRow?.refund_method) : "",
    settlementMethod: String(returnRow?.settlement_method || "").trim(),
    settlementAmount,
    settlementNotes: String(returnRow?.settlement_notes || "").trim(),
    stockImpactLabel: isCustomer
      ? warrantyOutcome === "exchange"
        ? "Stok pengganti keluar"
        : "Tidak berubah"
      : "",
    items,
    totalQty: Number(returnRow?.total_quantity || items.reduce((sum, item) => sum + item.qty, 0)),
    totalValue,
    note: String(returnRow?.notes || "").trim(),
  };
}

export function generateReturnReceiptHTML(returnRow, type = "supplier", options = {}) {
  const receipt = buildReturnReceiptPrintModel(returnRow, type);
  const printerProfile = getReceiptPrinterProfile(options);
  const receiptWidth = printerProfile.widthPx;
  const fontSize = printerProfile.fontSizePx;
  const amountLabel = receipt.type === "customer" ? "Total Refund" : "Estimasi Nilai";
  const methodLabel = receipt.type === "customer" ? "Hasil Klaim" : "Penyelesaian";
  const totalValueLabel =
    receipt.type === "customer" && receipt.warrantyOutcome !== "refund"
      ? "-"
      : formatRupiah(receipt.totalValue);

  const itemMarkup = receipt.items.length
    ? receipt.items
        .map(
          (item, index) => `
            <div class="item-block" data-key="${escapeHtml(item.key)}">
              <div class="item-name">${index + 1}. ${escapeHtml(item.name)}</div>
              ${
                item.code
                  ? `<div class="item-code">${escapeHtml(item.code)}</div>`
                  : ""
              }
              <div class="item-row">
                <span>${escapeHtml(item.qty)} x ${escapeHtml(formatRupiah(item.unitValue))}</span>
                <span class="item-total">${escapeHtml(formatRupiah(item.subtotal))}</span>
              </div>
              ${
                item.condition
                  ? `<div class="item-note">Kondisi: ${escapeHtml(item.condition)}</div>`
                  : ""
              }
              ${
                item.notes
                  ? `<div class="item-note">Catatan: ${escapeHtml(item.notes)}</div>`
                  : ""
              }
            </div>
          `
        )
        .join("")
    : `<div class="empty-state">Belum ada item retur.</div>`;

  const transactionMarkup = receipt.transactionNo
    ? `<div class="meta-row"><span>Transaksi</span><span>${escapeHtml(receipt.transactionNo)}</span></div>`
    : "";
  const methodValue =
    receipt.type === "customer"
      ? receipt.warrantyOutcome === "refund"
        ? `Refund - ${formatReceiptPaymentMethod(receipt.refundMethod || "cash")}`
        : receipt.warrantyOutcomeLabel
      : receipt.settlementMethod || receipt.statusLabel;
  const settlementMarkup =
    receipt.type === "supplier" && receipt.settlementAmount > 0
      ? `<div class="summary-row"><span>Nominal Selesai</span><span>${escapeHtml(formatRupiah(receipt.settlementAmount))}</span></div>`
      : "";
  const restockMarkup =
    receipt.type === "customer"
      ? `<div class="summary-row"><span>Dampak Stok</span><span>${escapeHtml(receipt.stockImpactLabel)}</span></div>`
      : "";
  const conditionMarkup = receipt.condition
    ? `<div class="meta-row"><span>Kondisi</span><span>${escapeHtml(receipt.condition)}</span></div>`
    : "";
  const notes = [receipt.note, receipt.settlementNotes].filter(Boolean).join(" | ");
  const noteMarkup = notes
    ? `
      <section class="section">
        <div class="separator"></div>
        <div class="note-label">Catatan</div>
        <div>${escapeHtml(notes)}</div>
      </section>
    `
    : "";

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(receipt.title)} ${escapeHtml(receipt.noRetur)}</title>
  <style>
    * {
      box-sizing: border-box;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: "Courier New", Courier, monospace;
    }

    body {
      width: ${receiptWidth}px;
      font-size: ${fontSize}px;
      line-height: 1.5;
    }

    #print-area {
      width: ${receiptWidth}px;
      padding: 0;
      overflow: hidden;
    }

    .header,
    .footer {
      text-align: center;
    }

    .brand-strip {
      height: 7px;
      background: linear-gradient(90deg, #0f172a 0%, #d4af37 45%, #0f172a 100%);
    }

    .receipt-body {
      padding: 12px;
    }

    .logo-frame {
      width: 64px;
      height: 64px;
      margin: 0 auto 8px;
      padding: 8px;
      border: 1px solid #d4af37;
      border-radius: 12px;
      background: #ffffff;
    }

    .logo {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .store-name {
      font-size: 17px;
      font-weight: 900;
      letter-spacing: 0.14em;
      margin: 0;
    }

    .gold-line {
      width: 80px;
      height: 2px;
      margin: 7px auto 0;
      border-radius: 99px;
      background: #d4af37;
    }

    .receipt-title {
      display: inline-block;
      margin-top: 10px;
      padding: 4px 10px;
      border-radius: 5px;
      background: #0f172a;
      color: #ffffff;
      font-size: 9px;
      font-weight: 900;
      letter-spacing: 0.14em;
    }

    .subtle {
      margin-top: 6px;
      font-size: 12px;
      line-height: 1.45;
    }

    .section {
      margin-top: 12px;
    }

    .meta-card {
      margin-top: 12px;
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
    }

    .separator {
      border-top: 1px dashed #000000;
      margin-bottom: 10px;
    }

    .meta-row,
    .summary-row,
    .item-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: start;
    }

    .meta-row span:last-child,
    .summary-row span:last-child {
      text-align: right;
      word-break: break-word;
    }

    .item-block + .item-block {
      margin-top: 10px;
    }

    .item-name {
      font-weight: 700;
      margin-bottom: 2px;
      word-break: break-word;
    }

    .item-code,
    .item-note {
      font-size: 12px;
      word-break: break-word;
    }

    .item-total {
      text-align: right;
    }

    .total-row {
      font-weight: 700;
      font-size: 14px;
      margin-top: 2px;
    }

    .total-card {
      margin: 8px 0;
      padding: 7px 9px;
      border-radius: 8px;
      background: #0f172a;
      color: #ffffff;
    }

    .note-label {
      font-weight: 700;
      margin-bottom: 4px;
    }

    .footer {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px dashed #000000;
    }

    .receipt-mark {
      margin-top: 8px;
      font-weight: 700;
      letter-spacing: 0.18em;
    }

    .empty-state {
      padding: 2px 0;
    }

    @page {
      margin: 0;
    }

    @media print {
      html,
      body {
        margin: 0;
        padding: 0;
      }

      #print-area {
        position: absolute;
        top: 0;
        left: 0;
        width: ${receiptWidth}px;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <main id="print-area">
    <div class="brand-strip"></div>
    <div class="receipt-body">
    <header class="header">
      <div class="logo-frame">
        <img src="${receipt.store.logoSrc}" alt="Logo Raja Aksesoris" class="logo" />
      </div>
      <p class="store-name">${escapeHtml(receipt.store.name)}</p>
      <div class="gold-line"></div>
      <div class="subtle">
        ${receipt.store.addressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
        <div>${escapeHtml(receipt.store.phone)}</div>
      </div>
      <div class="receipt-title">${escapeHtml(receipt.title)}</div>
    </header>

    <section class="meta-card">
      <div class="meta-row"><span>${escapeHtml(receipt.numberLabel)}</span><span>${escapeHtml(receipt.noRetur)}</span></div>
      <div class="meta-row"><span>Tanggal</span><span>${escapeHtml(receipt.dateLabel)}</span></div>
      <div class="meta-row"><span>Jam</span><span>${escapeHtml(receipt.timeLabel)}</span></div>
      <div class="meta-row"><span>${escapeHtml(receipt.partyLabel)}</span><span>${escapeHtml(receipt.partyName)}</span></div>
      ${transactionMarkup}
      <div class="meta-row"><span>Status</span><span>${escapeHtml(receipt.statusLabel)}</span></div>
      <div class="meta-row"><span>Alasan</span><span>${escapeHtml(receipt.reasonLabel)}</span></div>
      ${conditionMarkup}
      <div class="meta-row"><span>${escapeHtml(methodLabel)}</span><span>${escapeHtml(methodValue)}</span></div>
    </section>

    <section class="section">
      <div class="separator"></div>
      ${itemMarkup}
    </section>

    <section class="section">
      <div class="separator"></div>
      <div class="summary-row"><span>Total QTY</span><span>${escapeHtml(receipt.totalQty)} pcs</span></div>
      <div class="total-card">
        <div class="summary-row total-row"><span>${escapeHtml(amountLabel)}</span><span>${escapeHtml(totalValueLabel)}</span></div>
      </div>
      ${settlementMarkup}
      ${restockMarkup}
    </section>

    ${noteMarkup}

    <footer class="footer">
      <div>${receipt.type === "customer" ? "Dokumen bukti klaim garansi" : "Dokumen bukti retur barang"}</div>
      <div>Simpan sebagai arsip toko</div>
      <div class="receipt-mark">RAJA POS</div>
    </footer>
    </div>
  </main>
</body>
</html>
  `.trim();
}

export function printReturnReceiptWithStatus(returnRow, type = "supplier", existingWindow = null, options = {}) {
  const printerProfile = getReceiptPrinterProfile(options);
  const documentLabel = normalizeReturnReceiptType(type) === "customer" ? "garansi" : "retur";
  const printWindow = existingWindow || openReceiptPrintWindow(options);
  if (!printWindow) {
    return createPrintResult({
      blocked: true,
      transactionId: returnRow?.id || returnRow?.no_retur || null,
      printerProfile: printerProfile.id,
      message: `Popup print ${documentLabel} diblokir browser.`,
    });
  }

  try {
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };

    printWindow.document.open();
    printWindow.document.write(generateReturnReceiptHTML(returnRow, type, options));
    printWindow.document.close();
    return createPrintResult({
      ok: true,
      status: "opened",
      transactionId: returnRow?.id || returnRow?.no_retur || null,
      printerProfile: printerProfile.id,
      message: `Jendela cetak ${documentLabel} sudah dibuka.`,
    });
  } catch (error) {
    try {
      printWindow.close();
    } catch {
      // Browser may already have closed the print window.
    }
    return createPrintResult({
      transactionId: returnRow?.id || returnRow?.no_retur || null,
      printerProfile: printerProfile.id,
      message: error?.message || `Jendela cetak ${documentLabel} gagal disiapkan.`,
    });
  }
}

export function printReturnReceipt(returnRow, type = "supplier", existingWindow = null, options = {}) {
  return printReturnReceiptWithStatus(returnRow, type, existingWindow, options).ok;
}
