import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { formatCashierName } from "./cashier";

export function exportExcel(data, fileName = "laporan-raja-aksesoris.xlsx") {
  const formatted = Array.isArray(data)
    ? data.map((item) => ({
        "No Transaksi": item.id,
        Tanggal: item.date,
        Kasir: formatCashierName(item.cashier || item.kasir || item.user),
        Produk: item.product,
        Qty: item.qty,
        Harga: `Rp ${Number(item.price || 0).toLocaleString("id-ID")}`,
        Total: `Rp ${Number(item.total || 0).toLocaleString("id-ID")}`,
        Metode: item.method,
      }))
    : [];

  const worksheet = XLSX.utils.json_to_sheet(formatted);

  if (formatted.length) {
    const colWidths = Object.keys(formatted[0]).map((key) => ({
      wch:
        Math.max(key.length, ...formatted.map((row) => String(row[key] || "").length)) + 5,
    }));
    worksheet["!cols"] = colWidths;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan");

  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });

  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName
  );
}
