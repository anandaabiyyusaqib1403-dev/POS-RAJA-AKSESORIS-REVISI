import { walletAliasMap } from "../data/businessOptions";

export const SHIFT_OPEN_HOUR = 7;
export const SHIFT_CLOSE_HOUR = 20;
export const SHIFT_AUTO_CLOSE_HOUR = 5;
export const SHIFT_TIME_ZONE = "Asia/Jakarta";
export const SHIFT_FLAG_THRESHOLD = 50000;
export const CASHIER_STATIONS = ["Kasir 1", "Kasir 2", "Kasir 3", "Kasir 4"];
export const SHIFT_TYPES = ["Pagi", "Siang", "Full Day", "Lembur", "Backup"];
export const DEFAULT_SHIFT_TYPE = "Pagi";

export const SHIFT_STATUS_LABELS = {
  active: "Aktif",
  pending: "Menunggu Approval",
  approved: "Disetujui",
  approved_with_correction: "Disetujui dengan Koreksi",
  flagged: "Perlu Dicek",
};

function normalizeNumber(value, fallback = 0) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function normalizePaymentMethod(value, fallback = "cash") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  return walletAliasMap[normalized] || normalized || fallback;
}

export function normalizeCashierStation(value, fallback = "") {
  const normalized = String(value || "").trim();
  return CASHIER_STATIONS.includes(normalized) ? normalized : fallback;
}

export function normalizeShiftType(value, fallback = DEFAULT_SHIFT_TYPE) {
  const normalized = String(value || "").trim();
  return SHIFT_TYPES.includes(normalized) ? normalized : fallback;
}

function normalizeDigitalBreakdown(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce((acc, [method, amount]) => {
    const normalizedMethod = normalizePaymentMethod(method, "other");
    if (isCashPaymentMethod(normalizedMethod)) {
      return acc;
    }

    acc[normalizedMethod] = (acc[normalizedMethod] || 0) + normalizeNumber(amount);
    return acc;
  }, {});
}

function createPaymentSummary() {
  return {
    cash: 0,
    digital: 0,
    digitalBreakdown: {},
  };
}

function addPaymentToSummary(summary, method, amount) {
  const total = normalizeNumber(amount);
  const normalizedMethod = normalizePaymentMethod(method, "other");

  if (isCashPaymentMethod(normalizedMethod)) {
    summary.cash += total;
    return summary;
  }

  summary.digital += total;
  summary.digitalBreakdown[normalizedMethod] =
    (summary.digitalBreakdown[normalizedMethod] || 0) + total;

  return summary;
}

function mergePaymentSummary(summary, next) {
  summary.cash += normalizeNumber(next.cash);
  summary.digital += normalizeNumber(next.digital);

  Object.entries(next.digitalBreakdown || {}).forEach(([method, amount]) => {
    const normalizedMethod = normalizePaymentMethod(method, "other");
    summary.digitalBreakdown[normalizedMethod] =
      (summary.digitalBreakdown[normalizedMethod] || 0) + normalizeNumber(amount);
  });

  return summary;
}

export function normalizeShiftStatus(status) {
  const normalized = String(status || "active").trim().toLowerCase();

  if (normalized === "pending_close" || normalized === "closed") {
    return "pending";
  }

  if (
    normalized === "approved" ||
    normalized === "approved_with_correction" ||
    normalized === "flagged" ||
    normalized === "pending"
  ) {
    return normalized;
  }

  return "active";
}

export function normalizeShiftRecord(shift) {
  const rawActualCash = shift.actual_cash ?? shift.actualCash;
  const expectedCash = normalizeNumber(
    shift.expected_cash ?? shift.expectedCash ?? shift.total_cash ?? shift.totalCash
  );
  const explicitDifference = shift.difference;

  return {
    ...shift,
    cashier_id: shift.cashier_id || shift.cashierId || null,
    employee_id: shift.employee_id || shift.employeeId || shift.cashier_id || shift.cashierId || null,
    employee_name: shift.employee_name || shift.employeeName || shift.cashier_name || shift.cashierName || "",
    cashier_station: normalizeCashierStation(shift.cashier_station || shift.cashierStation),
    station_code: String(shift.station_code || shift.stationCode || ""),
    station_name: String(shift.station_name || shift.stationName || shift.cashier_station || shift.cashierStation || ""),
    shift_type: normalizeShiftType(shift.shift_type || shift.shiftType),
    start_time: shift.start_time || shift.startTime || new Date().toISOString(),
    end_time: shift.end_time || shift.endTime || null,
    opening_cash: normalizeNumber(shift.opening_cash ?? shift.openingCash),
    total_cash: normalizeNumber(shift.total_cash ?? shift.totalCash),
    total_digital: normalizeNumber(shift.total_digital ?? shift.totalDigital),
    digital_breakdown: normalizeDigitalBreakdown(
      shift.digital_breakdown ?? shift.digitalBreakdown
    ),
    total_transactions: normalizeNumber(shift.total_transactions ?? shift.totalTransactions),
    total_items: normalizeNumber(shift.total_items ?? shift.totalItems),
    actual_cash: rawActualCash === null || rawActualCash === undefined ? null : normalizeNumber(rawActualCash),
    expected_cash: expectedCash,
    difference:
      explicitDifference !== null && explicitDifference !== undefined
        ? normalizeNumber(explicitDifference)
        : rawActualCash === null || rawActualCash === undefined
          ? null
          : normalizeNumber(rawActualCash) - expectedCash,
    notes: String(shift.notes || ""),
    approval_notes: String(shift.approval_notes || shift.approvalNotes || ""),
    status: normalizeShiftStatus(shift.status),
    approved_by: shift.approved_by || shift.approvedBy || null,
    approved_at: shift.approved_at || shift.approvedAt || null,
    correction_difference: normalizeNumber(
      shift.correction_difference ?? shift.correctionDifference ?? shift.difference ?? 0
    ),
    correction_type: String(shift.correction_type || shift.correctionType || ""),
    closed_by: shift.closed_by || shift.closedBy || null,
    created_at: shift.created_at || shift.createdAt || shift.start_time || new Date().toISOString(),
  };
}

export function isCashPaymentMethod(method) {
  return ["cash", "tunai"].includes(normalizePaymentMethod(method));
}

export function getShiftStatusLabel(status) {
  return SHIFT_STATUS_LABELS[normalizeShiftStatus(status)] || SHIFT_STATUS_LABELS.active;
}

export function canOpenShift(role, now = new Date()) {
  return role === "pemilik" || now.getHours() >= SHIFT_OPEN_HOUR;
}

export function canCloseShift(role, now = new Date()) {
  return role === "pemilik" || now.getHours() >= SHIFT_CLOSE_HOUR;
}

export function getShiftAutoCloseCutoff(now = new Date()) {
  const localDateTime = new Date(
    now.toLocaleString("en-US", { timeZone: SHIFT_TIME_ZONE })
  );
  const cutoffLocal = new Date(localDateTime);
  cutoffLocal.setHours(SHIFT_AUTO_CLOSE_HOUR, 0, 0, 0);

  if (localDateTime < cutoffLocal) {
    cutoffLocal.setDate(cutoffLocal.getDate() - 1);
  }

  const localOffset = localDateTime.getTime() - now.getTime();
  return new Date(cutoffLocal.getTime() - localOffset);
}

export function isShiftExpiredByAutoClose(shift, now = new Date()) {
  if (normalizeShiftStatus(shift?.status) !== "active") {
    return false;
  }

  return new Date(shift.start_time || shift.startTime || 0) < getShiftAutoCloseCutoff(now);
}

export function isLargeShiftDifference(value) {
  return Math.abs(normalizeNumber(value)) >= SHIFT_FLAG_THRESHOLD;
}

export function findActiveShift(shifts, cashierId) {
  return (
    shifts.find(
      (shift) =>
        normalizeShiftStatus(shift.status) === "active" &&
        shift.cashier_id === cashierId &&
        !isShiftExpiredByAutoClose(shift)
    ) || null
  );
}

export function getAccessoryPaymentSummary(transaction) {
  const payments = Array.isArray(transaction.payments) ? transaction.payments : [];

  if (payments.length) {
    return payments.reduce(
      (summary, payment) => addPaymentToSummary(summary, payment.method, payment.amount),
      createPaymentSummary()
    );
  }

  const total = normalizeNumber(transaction.total_bayar ?? transaction.totalBayar);
  return addPaymentToSummary(
    createPaymentSummary(),
    transaction.metode_bayar || transaction.paymentMethod,
    total
  );
}

export function getDigitalPaymentSummary(transaction) {
  const total = normalizeNumber(transaction.harga_jual ?? transaction.price);
  return addPaymentToSummary(
    createPaymentSummary(),
    transaction.payment_method || transaction.paymentMethod || "cash",
    total
  );
}

export function getLogisticsPaymentSummary(transaction) {
  const total = normalizeNumber(transaction.price ?? transaction.harga_jual);
  const paymentMethod =
    transaction.paymentMethod || transaction.payment_method || transaction.platform_sumber || "cash";

  return addPaymentToSummary(createPaymentSummary(), paymentMethod, total);
}

export function calculateShiftMetrics({
  shiftId,
  accessoryTransactions = [],
  digitalTransactions = [],
  logisticsTransactions = [],
}) {
  const accessoryRows = accessoryTransactions.filter((transaction) => transaction.shift_id === shiftId);
  const digitalRows = digitalTransactions.filter((transaction) => transaction.shift_id === shiftId);
  const logisticsRows = logisticsTransactions.filter((transaction) => transaction.shift_id === shiftId);

  const accessoryPaymentSummary = accessoryRows.reduce(
    (summary, transaction) => mergePaymentSummary(summary, getAccessoryPaymentSummary(transaction)),
    createPaymentSummary()
  );

  const digitalPaymentSummary = digitalRows.reduce(
    (summary, transaction) => mergePaymentSummary(summary, getDigitalPaymentSummary(transaction)),
    createPaymentSummary()
  );

  const logisticsPaymentSummary = logisticsRows.reduce(
    (summary, transaction) => mergePaymentSummary(summary, getLogisticsPaymentSummary(transaction)),
    createPaymentSummary()
  );

  const totalItems =
    accessoryRows.reduce(
      (sum, transaction) =>
        sum +
        (Array.isArray(transaction.items)
          ? transaction.items.reduce((itemSum, item) => itemSum + normalizeNumber(item.qty), 0)
          : 0),
      0
    ) +
    digitalRows.length +
    logisticsRows.length;

  const totalCash =
    accessoryPaymentSummary.cash + digitalPaymentSummary.cash + logisticsPaymentSummary.cash;
  const totalDigital =
    accessoryPaymentSummary.digital + digitalPaymentSummary.digital + logisticsPaymentSummary.digital;
  const digitalBreakdownSummary = [
    accessoryPaymentSummary,
    digitalPaymentSummary,
    logisticsPaymentSummary,
  ].reduce((summary, next) => mergePaymentSummary(summary, next), createPaymentSummary());

  return {
    total_transactions: accessoryRows.length + digitalRows.length + logisticsRows.length,
    total_items: totalItems,
    total_cash: totalCash,
    total_digital: totalDigital,
    digital_breakdown: digitalBreakdownSummary.digitalBreakdown,
    expected_cash: totalCash,
  };
}
