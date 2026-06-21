import { formatRupiah, formatDateTime } from './format.js';

export function generateReceiptHTML(transaction) {
  const { no_transaksi, total_bayar, uang_diterima, kembalian, metode_bayar, items = [], kasir_id } = transaction;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    @media print {
      body { margin: 0; font-family: 'Courier New', monospace; font-size: 10px; width: 58mm; }
      .header { text-align: center; font-size: 12px; font-weight: bold; margin-bottom: 5px; }
      .item { display: flex; justify-content: space-between; margin: 2px 0; }
      .total { font-size: 12px; font-weight: bold; border-top: 1px dashed #000; padding-top: 5px; margin-top: 10px; }
      .footer { margin-top: 10px; font-size: 9px; text-align: center; }
      @page { size: 58mm 100mm; margin: 2mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    RAJA AKSESORIS<br>
    ${formatDateTime(new Date(), { dateStyle: 'medium', timeStyle: 'short' })}
  </div>
  
  <div>No. Transaksi: ${no_transaksi}</div>
  <div>Kasir: ${kasir_id?.toUpperCase() || 'DEMO'}</div>
  
  ${items.map(item => `
    <div class="item">
      <span>${item.nama_produk}</span>
      <span>${item.qty}x${formatRupiah(item.harga_satuan)}</span>
    </div>
  `).join('')}
  
  <div class="total">
    Total: ${formatRupiah(total_bayar)}<br>
    Bayar: ${formatRupiah(uang_diterima)}<br>
    Kembali: ${formatRupiah(kembalian)}
  </div>
  
  <div class="footer">
    Terima kasih!<br>
    RAJA AKSESORIS - ${new Date().getFullYear()}
  </div>
</body>
</html>
  `.trim();
}
