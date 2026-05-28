export const EXCEL_IMPORT_ACCEPT = ".xlsx";
export const DEFAULT_EXCEL_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export function validateExcelImportFile(file, maxBytes = DEFAULT_EXCEL_IMPORT_MAX_BYTES) {
  if (!file) {
    throw new Error("Pilih file Excel terlebih dahulu.");
  }

  const fileName = String(file.name || "").toLowerCase();
  if (!fileName.endsWith(".xlsx")) {
    throw new Error("Import hanya menerima file .xlsx dari template aplikasi.");
  }

  if (Number(file.size || 0) > maxBytes) {
    const maxMb = Math.max(1, Math.round(maxBytes / 1024 / 1024));
    throw new Error(`Ukuran file Excel maksimal ${maxMb} MB.`);
  }
}
