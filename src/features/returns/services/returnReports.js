import { formatDateInput, formatDateTime, formatRupiah } from "../../../utils/format";
import { loadExcelTools } from "../../../utils/loadExcelTools";

export const reasonOptions = [
  { value: "rusak", label: "Rusak" },
  { value: "cacat", label: "Cacat" },
  { value: "salah_barang", label: "Salah Barang" },
  { value: "tidak_sesuai", label: "Tidak Sesuai" },
  { value: "tidak_laku", label: "Tidak Laku" },
  { value: "lainnya", label: "Lainnya" },
];

export const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "selesai", label: "Selesai" },
  { value: "diganti_barang", label: "Diganti Barang" },
  { value: "refund_uang", label: "Refund Uang" },
  { value: "potong_tagihan", label: "Potong Tagihan" },
  { value: "ditolak", label: "Ditolak" },
];

export const datePresetOptions = [
  { value: "today", label: "Hari ini" },
  { value: "7days", label: "7 hari" },
  { value: "month", label: "Bulan ini" },
  { value: "all", label: "Semua" },
];

export const warrantyOutcomeOptions = [
  { value: "exchange", label: "Tukar Barang" },
  { value: "refund", label: "Refund" },
  { value: "rejected", label: "Ditolak" },
];

const statusLabelMap = {
  pending: "Pending",
  diganti_barang: "Diganti Barang",
  refund_uang: "Refund Uang",
  potong_tagihan: "Potong Tagihan",
  ditolak: "Ditolak",
  selesai: "Selesai",
};

const warrantyOutcomeLabelMap = {
  exchange: "Tukar Barang",
  refund: "Refund",
  rejected: "Ditolak",
};

export function getStatusLabel(status) {
  return statusLabelMap[status] || status || "-";
}

export function getReasonLabel(reason) {
  return reasonOptions.find((option) => option.value === reason)?.label || reason || "-";
}

export function getWarrantyOutcome(rowOrOutcome) {
  const rawValue =
    typeof rowOrOutcome === "string"
      ? rowOrOutcome
      : rowOrOutcome?.warranty_outcome || rowOrOutcome?.refund_method || "";
  const value = String(rawValue || "").trim().toLowerCase();

  if (value === "exchange" || value === "warranty_exchange") return "exchange";
  if (value === "rejected" || value === "ditolak" || value === "warranty_rejected") return "rejected";
  return "refund";
}

export function getWarrantyOutcomeLabel(rowOrOutcome) {
  return warrantyOutcomeLabelMap[getWarrantyOutcome(rowOrOutcome)] || "-";
}

export function buildReturnExportRows(rows, type) {
  return rows.flatMap((row) => {
    const items = row.items?.length ? row.items : [{}];
    const isCustomer = type === "customer";
    const warrantyOutcome = isCustomer ? getWarrantyOutcome(row) : "";
    const warrantyOutcomeLabel = isCustomer ? getWarrantyOutcomeLabel(row) : "";

    return items.map((item) => ({
      "Jenis Dokumen": isCustomer ? "Garansi Konsumen" : "Retur Supplier",
      "No Dokumen": row.no_retur,
      Tanggal: formatDateTime(row.created_at, { dateStyle: "medium", timeStyle: "short" }),
      Status: getStatusLabel(row.status),
      Pihak: isCustomer ? row.customer_name || "-" : row.supplier_name || "-",
      "Transaksi Asal": isCustomer ? row.transaction_no || "-" : "-",
      Produk: item.product_name || "-",
      "Kode Produk": item.product_code || "-",
      Kategori: item.category || "-",
      Qty: Number(item.quantity || 0),
      "Harga/Modal Satuan": Number(isCustomer ? item.unit_price || 0 : item.unit_cost || 0),
      Subtotal: Number(isCustomer ? item.subtotal_refund || 0 : item.subtotal_cost || 0),
      Alasan: getReasonLabel(row.reason),
      Kondisi: item.condition || row.condition || "-",
      Catatan: item.notes || row.notes || "-",
      "Hasil Klaim": isCustomer ? warrantyOutcomeLabel : "-",
      "Dampak Stok": isCustomer
        ? warrantyOutcome === "exchange"
          ? "Stok pengganti keluar"
          : "Tidak berubah"
        : "-",
      "Metode/Nominal Selesai":
        isCustomer
          ? warrantyOutcome === "refund"
            ? row.refund_method || "-"
            : warrantyOutcomeLabel
          : [row.settlement_method, row.settlement_amount ? formatRupiah(row.settlement_amount) : ""]
              .filter(Boolean)
              .join(" - ") || "-",
    }));
  });
}

function addJsonSheet(workbook, name, rows) {
  const worksheet = workbook.addWorksheet(name);
  const headers = rows.length ? Object.keys(rows[0]) : ["Data"];

  worksheet.addRow(headers);
  rows.forEach((row) => worksheet.addRow(headers.map((header) => row[header])));
  worksheet.columns = headers.map((header) => ({
    width: Math.max(header.length, ...rows.map((row) => String(row[header] || "").length)) + 2,
  }));
  worksheet.getRow(1).font = { bold: true };
}

export async function exportReturnWorkbook({ supplierRows, customerRows, fileName }) {
  const { ExcelJS, saveAs } = await loadExcelTools();
  const workbook = new ExcelJS.Workbook();
  const allRows = [
    ...buildReturnExportRows(supplierRows, "supplier"),
    ...buildReturnExportRows(customerRows, "customer"),
  ];
  const summaryRows = [
    {
      "Jenis Dokumen": "Retur Supplier",
      "Jumlah Dokumen": supplierRows.length,
      "Total Qty": supplierRows.reduce((sum, row) => sum + Number(row.total_quantity || 0), 0),
      "Total Nilai": supplierRows.reduce((sum, row) => sum + Number(row.total_estimated_value || 0), 0),
    },
    {
      "Jenis Dokumen": "Garansi Konsumen",
      "Jumlah Dokumen": customerRows.length,
      "Total Qty": customerRows.reduce((sum, row) => sum + Number(row.total_quantity || 0), 0),
      "Total Nilai": customerRows.reduce((sum, row) => sum + Number(row.total_refund_amount || 0), 0),
    },
  ];

  addJsonSheet(workbook, "Ringkasan", summaryRows);
  addJsonSheet(workbook, "Detail Retur Garansi", allRows);

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName
  );
}

export function getDatePresetRange(preset) {
  const today = new Date();

  if (preset === "today") {
    const date = formatDateInput(today);
    return { startDate: date, endDate: date };
  }

  if (preset === "7days") {
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 6);
    return {
      startDate: formatDateInput(startDate),
      endDate: formatDateInput(today),
    };
  }

  if (preset === "month") {
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      startDate: formatDateInput(startDate),
      endDate: formatDateInput(today),
    };
  }

  return { startDate: "", endDate: "" };
}

export function getDatePresetLabel(preset, dateRange) {
  const presetLabel = datePresetOptions.find((option) => option.value === preset)?.label;
  if (presetLabel) return presetLabel;
  if (!dateRange.startDate && !dateRange.endDate) return "Semua";
  return [dateRange.startDate || "awal", dateRange.endDate || "akhir"].join("_");
}
