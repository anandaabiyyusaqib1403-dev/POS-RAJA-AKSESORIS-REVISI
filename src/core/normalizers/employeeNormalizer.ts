import { formatCashierName } from "../../utils/cashier";
import type { AppSetting, EmployeePayroll, StaffUser } from "../../types/Employee";

export const DEFAULT_SECURITY_CONTROLS = {
  refund: { enabled: true, requiredBy: "kasir_owner" },
  retur: { enabled: true, requiredBy: "kasir_owner" },
  stock: { enabled: true, requiredBy: "kasir_owner" },
  price: { enabled: true, requiredBy: "owner_only" },
  delete_transaction: { enabled: true, requiredBy: "owner_only" },
  closing_shift: { enabled: true, requiredBy: "kasir_owner" },
};

export function normalizeStaffUser(user: Record<string, any>): StaffUser {
  return {
    id: user.id,
    nama: user.nama || formatCashierName(user.id || user.email || user.role),
    email: user.email || "",
    username: user.username || "",
    phone: user.phone || "",
    role: user.role || "kasir",
    cashier_station: user.cashier_station || "",
    station_code: user.station_code || "",
    station_name: user.station_name || user.cashier_station || "",
    status: user.status || "active",
    pin_hash: user.pin_hash || null,
    base_salary: Number(user.base_salary || 0),
    default_bonus: Number(user.default_bonus || 0),
    default_deduction: Number(user.default_deduction || 0),
    last_login: user.last_login || null,
    last_device: user.last_device || "",
    archived_at: user.archived_at || null,
    created_at: user.created_at || null,
    updated_at: user.updated_at || null,
  };
}

export function normalizeEmployeePayroll(row: Record<string, any>): EmployeePayroll {
  return {
    id: row.id,
    employee_id: row.employee_id,
    period_month: row.period_month,
    base_salary: Number(row.base_salary || 0),
    bonus: Number(row.bonus || 0),
    deduction: Number(row.deduction || 0),
    status: row.status || "waiting",
    notes: row.notes || "",
    paid_at: row.paid_at || null,
    paid_by: row.paid_by || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

export function normalizeAppSetting(row: Record<string, any>): AppSetting {
  return {
    key: row.key,
    value: row.value || {},
    updated_by: row.updated_by || null,
    updated_at: row.updated_at || null,
  };
}

export function normalizeSecurityControls(value: unknown, fallbackEnabled = true) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
  return Object.entries(DEFAULT_SECURITY_CONTROLS).reduce<Record<string, { enabled: boolean; requiredBy: string }>>(
    (acc, [key, fallback]) => {
      const row = source[key] && typeof source[key] === "object" ? source[key] : {};
      acc[key] = {
        enabled:
          row.enabled === undefined
            ? Boolean(fallbackEnabled && fallback.enabled)
            : row.enabled !== false,
        requiredBy: ["owner_only", "kasir_owner", "all_users"].includes(row.requiredBy)
          ? row.requiredBy
          : fallback.requiredBy,
      };
      return acc;
    },
    {}
  );
}
