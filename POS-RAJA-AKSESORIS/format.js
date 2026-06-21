const idrFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatRupiah(value) {
  return idrFormatter.format(Number(value || 0));
}

export function formatPlainNumber(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

export function formatDateTime(value, options = {}) {
  const intlOptions = options.day || options.month
    ? {
        day: options.day,
        month: options.month,
      }
    : {
        dateStyle: options.dateStyle || "medium",
      };

  if (options.timeStyle) {
    intlOptions.timeStyle = options.timeStyle;
  }

  return new Intl.DateTimeFormat("id-ID", intlOptions).format(new Date(value));
}

export function formatDateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function generateTransactionNumber(prefix, order) {
  return `${prefix}-${formatDateKey(new Date())}-${String(order).padStart(4, "0")}`;
}

export function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function isDateInRange(value, startDate, endDate) {
  const date = new Date(value);
  if (startDate && date < startOfDay(startDate)) return false;
  if (endDate && date > endOfDay(endDate)) return false;
  return true;
}

export function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) =>
      row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
