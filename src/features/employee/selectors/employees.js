import { summarizeDevice } from "../../../utils/device";
import { formatDateInput, formatDateTime } from "../../../utils/format";

const ACTION_MENU_WIDTH = 184;
const ACTION_MENU_HEIGHT = 220;

export function getActionMenuPosition(target) {
  if (typeof window === "undefined" || !target) {
    return { top: 0, left: 0, width: ACTION_MENU_WIDTH };
  }

  const rect = target.getBoundingClientRect();
  const margin = 12;
  const left = Math.max(
    margin,
    Math.min(rect.right - ACTION_MENU_WIDTH, window.innerWidth - ACTION_MENU_WIDTH - margin)
  );
  const shouldOpenUp = rect.bottom + ACTION_MENU_HEIGHT + margin > window.innerHeight;
  const top = shouldOpenUp
    ? Math.max(margin, rect.top - ACTION_MENU_HEIGHT - 8)
    : rect.bottom + 8;

  return { top, left, width: ACTION_MENU_WIDTH };
}

export function normalizeDay(value) {
  return formatDateInput(value || new Date());
}

export function getInitials(name) {
  return (
    String(name || "RA")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "RA"
  );
}

export function getRoleLabel(role) {
  return role === "pemilik" ? "Pemilik" : "Kasir";
}

export function createUsername(name, index) {
  return (
    String(name || `kasir ${index + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/(^\.|\.$)/g, "") || `kasir.${index + 1}`
  );
}

export function getCurrentPayroll(payrolls, employeeId) {
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
  return payrolls.find(
    (row) => row.employee_id === employeeId && row.period_month?.slice(0, 7) === currentMonth.slice(0, 7)
  );
}

export function resolveSessionStatus(row, now = Date.now()) {
  if (row?.account_status && row.account_status !== "active") return row.account_status;
  if (row?.ended_at) return "offline";

  const lastSeen = row?.last_seen_at ? new Date(row.last_seen_at).getTime() : null;
  if (lastSeen) {
    const ageMs = now - lastSeen;
    if (ageMs <= 60 * 1000) return "online";
    if (ageMs <= 5 * 60 * 1000) return "idle";
    return "offline";
  }

  return "offline";
}

export function formatRelativeTime(value, now = Date.now()) {
  if (!value) return "Belum aktif";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Belum aktif";

  const diffSeconds = Math.max(0, Math.round((now - time) / 1000));
  if (diffSeconds < 45) return "Baru saja";
  if (diffSeconds < 3600) return `${Math.round(diffSeconds / 60)} menit lalu`;
  if (diffSeconds < 86400) return `${Math.round(diffSeconds / 3600)} jam lalu`;
  return `${Math.round(diffSeconds / 86400)} hari lalu`;
}

export function getElapsedMinutes(value, now = Date.now()) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(1, Math.round((now - time) / 60000));
}

export function formatClock(value) {
  if (!value) return "-";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "-";
  return formatDateTime(value, { timeStyle: "short" });
}

export function splitDeviceLabel(value) {
  const fallback = "Belum tercatat";
  const [browser, os] = String(value || fallback)
    .split("\u00b7")
    .map((part) => part.trim());

  return {
    browser: browser || fallback,
    os: os || "",
  };
}

export function getSessionLabel(status, lastSeenAt, now = Date.now(), activityStatus = "") {
  if (status === "online") return activityStatus || "Aktif sekarang";
  if (status === "idle") return `Idle ${getElapsedMinutes(lastSeenAt, now)} menit`;
  if (status === "inactive") return "Nonaktif";
  if (status === "suspended") return "Suspended";
  if (status === "archived") return "Diarsipkan";
  return lastSeenAt ? `Terakhir aktif ${formatRelativeTime(lastSeenAt, now)}` : "Offline";
}

export function buildEmployees(staffUsers, user, activeShifts, payrolls = [], rosterRows = [], now = Date.now()) {
  const rosterById = new Map(rosterRows.map((row) => [row.id, row]));
  const staffById = new Map(staffUsers.map((row) => [row.id, row]));
  const rows = rosterRows.length ? [...rosterRows] : [...staffUsers];

  if (user && !rows.some((row) => row.id === user.id)) {
    rows.unshift({
      id: user.id,
      nama: user.nama || "Pemilik Toko",
      role: user.role || "pemilik",
      status: user.status || "active",
      pinHash: user.pinHash,
    });
  }

  if (!rows.length) {
    rows.push({
      id: "owner-preview",
      nama: "Pemilik Toko",
      role: "pemilik",
    });
    rows.push({
      id: "cashier-preview",
      nama: "Kasir Raja",
      role: "kasir",
    });
  }

  const activeCashierIds = new Set(activeShifts.map((shift) => shift.cashier_id));

  return rows.map((row, index) => {
    const roster = rosterById.get(row.id) || row;
    const staffProfile = staffById.get(row.id) || {};
    const role = roster.role || row.role || "kasir";
    const activeShift = activeShifts.find((shift) => shift.cashier_id === row.id);
    const cashierStation =
      row.cashier_station ||
      roster.cashier_station ||
      staffProfile.cashier_station ||
      activeShift?.cashier_station ||
      row.station_name ||
      roster.station_name ||
      staffProfile.station_name ||
      "";
    const isWorking = Boolean(roster.active_shift_id || activeCashierIds.has(row.id));
    const accountStatus = roster.account_status || row.status || "active";
    const status = accountStatus !== "active" ? accountStatus : resolveSessionStatus(roster, now);
    const payroll = getCurrentPayroll(payrolls, row.id);
    const rawDevice = roster.device_summary || row.last_device || roster.user_agent || "";
    const device = summarizeDevice(rawDevice);
    const activityStatus = status === "online" ? roster.activity_status || "" : "";
    const securityLevel =
      role === "pemilik"
        ? "Owner"
        : roster.pin_enabled || row.pin_hash || row.pinHash
          ? "PIN aktif"
          : "Perlu setup PIN";

    return {
      id: row.id || `employee-${index}`,
      name: row.nama || row.name || "Kasir",
      email: row.email || "",
      username: row.username || row.email || createUsername(row.nama || row.name, index),
      phone: row.phone || row.nomor_hp || "-",
      role,
      cashierStation,
      stationName: row.station_name || roster.station_name || staffProfile.station_name || cashierStation,
      accountStatus,
      status,
      sessionStatus: ["online", "idle", "offline"].includes(status) ? status : "blocked",
      sessionLabel: getSessionLabel(status, roster.last_seen_at || row.last_login, now, activityStatus),
      shift: isWorking ? "Shift aktif" : "Tidak aktif",
      shiftStatus: isWorking ? "on_shift" : "no_shift",
      activeShiftId: roster.active_shift_id || "",
      activeShiftStartedAt: roster.active_shift_started_at || null,
      sessionId: roster.session_id || "",
      sessionStartedAt: roster.session_started_at || null,
      lastSeenAt: roster.last_seen_at || null,
      lastLogin: roster.last_login || row.last_login || null,
      device,
      deviceFull: roster.user_agent || row.last_device || rawDevice || "Belum tercatat",
      route: roster.route || "",
      activityStatus,
      activityUpdatedAt: roster.activity_updated_at || null,
      revokedAt: roster.revoked_at || null,
      revokeReason: roster.revoke_reason || "",
      joinedAt: row.created_at || row.joined_at || new Date().toISOString(),
      pinStatus: row.pin_hash || row.pinHash || roster.pin_enabled ? "Aktif" : "Perlu setup",
      securityLevel,
      baseSalary: payroll?.base_salary ?? roster.base_salary ?? row.base_salary ?? 0,
      bonus: payroll?.bonus ?? roster.default_bonus ?? row.default_bonus ?? 0,
      deduction: payroll?.deduction ?? roster.default_deduction ?? row.default_deduction ?? 0,
      payrollStatus: payroll?.status || (role === "kasir" ? "waiting" : "paid"),
      payrollId: payroll?.id || null,
      todayTransactions: roster.today_transactions || 0,
      todayRevenue: roster.today_revenue || 0,
      todayItems: roster.today_items || 0,
      todayRefund: roster.today_refund || 0,
      todayClosingDifference: roster.today_closing_difference || 0,
      hasRosterMetrics: Boolean(rosterRows.length),
    };
  });
}

export function getCashierId(row) {
  return row.kasir_id || row.cashier_id || row.created_by || row.user_id || "";
}

export function getTransactionAmount(transaction) {
  return Number(
    transaction.total_bayar ??
      transaction.harga_jual ??
      transaction.price ??
      transaction.nominal ??
      0
  );
}

export function getTransactionItems(transaction) {
  if (Array.isArray(transaction.items)) {
    return transaction.items.reduce((sum, item) => sum + Number(item.qty || item.quantity || 0), 0);
  }

  return Number(transaction.total_items || transaction.qty || 0);
}

export function buildEmployeeDailyPerformance(employeeId, transactions, returns, shifts) {
  const rows = new Map();
  const ensureRow = (dateKey) => {
    if (!rows.has(dateKey)) {
      rows.set(dateKey, {
        date: dateKey,
        transactions: 0,
        revenue: 0,
        refund: 0,
        closingDifference: 0,
      });
    }
    return rows.get(dateKey);
  };

  transactions
    .filter((transaction) => getCashierId(transaction) === employeeId)
    .forEach((transaction) => {
      const row = ensureRow(normalizeDay(transaction.created_at));
      row.transactions += 1;
      row.revenue += getTransactionAmount(transaction);
    });

  returns
    .filter((row) => getCashierId(row) === employeeId)
    .forEach((returnRow) => {
      const row = ensureRow(normalizeDay(returnRow.created_at));
      row.refund += Number(returnRow.total_refund_amount || 0);
    });

  shifts
    .filter((shift) => shift.cashier_id === employeeId)
    .forEach((shift) => {
      const row = ensureRow(normalizeDay(shift.end_time || shift.start_time || shift.created_at));
      row.closingDifference += Number(shift.difference || 0);
    });

  return [...rows.values()]
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .slice(0, 7);
}
