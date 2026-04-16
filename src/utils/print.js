import logo from "../assets/raja-aksesoris-logo.png";
import { formatCashierName } from "./cashier.js";
import { formatRupiah } from "./format.js";

export const receiptStoreProfile = {
  name: "RAJA AKSESORIS",
  addressLines: [
    "Jl. Bango Raya No.3, RT.6/RW.3",
    "Pd. Labu, Kec. Cilandak",
    "Jakarta Selatan 12450",
  ],
  phone: "+62 817-9815-300",
  logoSrc: logo,
};

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

  if (!normalizedValue) return "Cash";
  if (normalizedValue === "tunai") return "Tunai";
  if (normalizedValue === "cash") return "Cash";
  if (normalizedValue === "qris") return "QRIS";
  if (normalizedValue === "transfer") return "Transfer";
  if (normalizedValue === "bank_mas") return "Bank Mas";
  if (normalizedValue === "pasar_kuota") return "PASAR KUOTA";

  return normalizedValue.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function buildReceiptPrintModel(transaction) {
  const normalizedItems = (transaction?.items || []).map((item, index) => {
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

  const date = normalizeReceiptDate(transaction?.created_at);
  const subtotal = normalizedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const total = Number(transaction?.total_bayar ?? subtotal);
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
      transaction?.kasir_nama || transaction?.kasir || transaction?.kasir_id
    ),
    paymentMethodLabel: formatReceiptPaymentMethod(transaction?.metode_bayar),
    items: normalizedItems,
    totalQty: normalizedItems.reduce((sum, item) => sum + item.qty, 0),
    subtotal,
    total,
    paid,
    change,
    note: String(transaction?.catatan || "").trim(),
  };
}

export function generateReceiptHTML(transaction) {
  const receipt = buildReceiptPrintModel(transaction);

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
      width: 320px;
      font-size: 13px;
      line-height: 1.5;
    }

    #print-area {
      width: 320px;
      padding: 12px;
    }

    .header,
    .footer {
      text-align: center;
    }

    .logo {
      display: block;
      width: auto;
      height: 40px;
      margin: 0 auto 8px;
      object-fit: contain;
      filter: grayscale(100%);
    }

    .store-name {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.18em;
      margin: 0;
    }

    .subtle {
      margin-top: 6px;
      font-size: 12px;
      line-height: 1.45;
    }

    .section {
      margin-top: 12px;
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

    .note-label {
      font-weight: 700;
      margin-bottom: 4px;
    }

    .footer {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px dashed #000000;
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
        width: 320px;
        padding: 12px;
      }
    }
  </style>
</head>
<body>
  <main id="print-area">
    <header class="header">
      <img src="${receipt.store.logoSrc}" alt="Logo Raja Aksesoris" class="logo" />
      <p class="store-name">${escapeHtml(receipt.store.name)}</p>
      <div class="subtle">
        ${receipt.store.addressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
        <div>${escapeHtml(receipt.store.phone)}</div>
      </div>
    </header>

    <section class="section">
      <div class="separator"></div>
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
      <div class="summary-row total-row"><span>TOTAL</span><span>${escapeHtml(formatRupiah(receipt.total))}</span></div>
      <div class="summary-row"><span>Bayar</span><span>${escapeHtml(formatRupiah(receipt.paid))}</span></div>
      <div class="summary-row"><span>Kembali</span><span>${escapeHtml(formatRupiah(receipt.change))}</span></div>
    </section>

    ${noteMarkup}

    <footer class="footer">
      <div>Terima kasih telah berbelanja</div>
      <div>Barang yang sudah dibeli tidak dapat ditukar</div>
    </footer>
  </main>
</body>
</html>
  `.trim();
}
