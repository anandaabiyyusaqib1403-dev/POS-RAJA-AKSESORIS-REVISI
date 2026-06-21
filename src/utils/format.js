const idrFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function toValidDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}


export function formatRupiah(value) {
  return idrFormatter.format(Number(value || 0));
}

export function formatPlainNumber(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

export function formatDateTime(value, options = {}) {
  const date = toValidDate(value);
  if (!date) return "-";

  const hasExplicitParts =
    options.day || options.month || options.year || options.weekday;
  const intlOptions = hasExplicitParts
    ? {
        day: options.day,
        month: options.month,
        year: options.year,
        weekday: options.weekday,
      }
    : options.dateStyle
      ? { dateStyle: options.dateStyle }
      : options.timeStyle
        ? {}
        : { dateStyle: "medium" };
  if (options.timeStyle) {
    intlOptions.timeStyle = options.timeStyle;
  }
  return new Intl.DateTimeFormat("id-ID", intlOptions).format(date);
}

export function formatDateInput(value) {
  const date = toValidDate(value);
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateInput(value) {
  if (!value) return null;
  const [year, month, day] = String(value)
    .split("-")
    .map((segment) => Number(segment));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return new Date(year, month - 1, day);
}

export function formatDisplayDate(date) {
  const value = toValidDate(date);
  if (!value) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

export function formatDateKey(value) {
  const date = toValidDate(value);
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function generateTransactionNumber(prefix, order) {
  return `${prefix}-${formatDateKey(new Date())}-${String(order).padStart(4, "0")}`;
}

export function startOfDay(value) {
  const source = toValidDate(value) || new Date();
  const date = new Date(source);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDay(value) {
  const source = toValidDate(value) || new Date();
  const date = new Date(source);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function isDateInRange(value, startDate, endDate) {
  const date = toValidDate(value);
  if (!date) return false;
  if (startDate && date < startOfDay(startDate)) return false;
  if (endDate && date > endOfDay(endDate)) return false;
  return true;
}

// FIX: tambah BOM (\uFEFF) agar Excel bisa baca UTF-8 dengan benar
// FIX: format angka Rupiah di kolom Total agar tidak berantakan
export function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? "");
          // Escape double quotes, wrap semua cell dalam quotes
          return `"${str.replaceAll('"', '""')}"`;
        })
        .join(",")
    )
    .join("\r\n"); // CRLF untuk kompatibilitas Excel Windows

  // BOM UTF-8 wajib agar karakter Rp, huruf Indonesia tidak rusak di Excel
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Helper: format angka Rupiah untuk CSV (tanpa simbol Rp, pakai titik ribuan)
// Agar Excel tidak salah baca sebagai teks
export function formatRupiahCsv(value) {
  return Number(value || 0).toLocaleString("id-ID");
}
