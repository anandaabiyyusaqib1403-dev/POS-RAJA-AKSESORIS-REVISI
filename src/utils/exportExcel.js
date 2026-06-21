import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { formatCashierName } from "./cashier";

export async function exportExcel(data, fileName = "laporan-raja-aksesoris.xlsx") {
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

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Laporan");
  const headers = formatted.length ? Object.keys(formatted[0]) : ["Data"];

  worksheet.addRow(headers);
  formatted.forEach((row) => worksheet.addRow(headers.map((key) => row[key])));
  worksheet.columns = headers.map((key) => ({
    width: Math.max(key.length, ...formatted.map((row) => String(row[key] || "").length)) + 5,
  }));
  worksheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();

  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName
  );
}
