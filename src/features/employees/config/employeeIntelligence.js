import { EMPLOYEE_PERMISSIONS } from "../../../core/permissions/employeePermissions.js";

export { EMPLOYEE_PERMISSIONS } from "../../../core/permissions/employeePermissions.js";

export const EMPLOYEE_ACTIVITY_STATUS = Object.freeze({
  CHECKOUT: "Sedang checkout",
  STOCK_INPUT: "Sedang input stok",
  SHIFT_CLOSING: "Sedang closing shift",
  REPORT_VIEW: "Sedang lihat laporan",
  IDLE: "Idle",
  OFFLINE: "Offline",
});

export const EMPLOYEE_ACTIVITY_STATUSES = new Set(Object.values(EMPLOYEE_ACTIVITY_STATUS));

export const EMPLOYEE_ACTIVITY_SYNC_THROTTLE_MS = 12_000;
export const EMPLOYEE_FOCUS_SYNC_THROTTLE_MS = 5_000;
export const EMPLOYEE_DETAIL_CACHE_TTL_MS = 60_000;
export const EMPLOYEE_ACTIVITY_PAGE_SIZE = 30;
export const EMPLOYEE_ACTIVITY_MAX_PAGE_SIZE = 50;

export const EMPLOYEE_PERMISSION_GROUPS = [
  {
    id: "transaction",
    label: "Transaksi",
    helper: "Aksi yang langsung mempengaruhi nota dan penjualan.",
    permissions: [
      {
        key: EMPLOYEE_PERMISSIONS.TRANSACTION_REFUND,
        label: "Refund transaksi",
        helper: "Boleh melakukan pengembalian dana.",
      },
      {
        key: EMPLOYEE_PERMISSIONS.TRANSACTION_VOID,
        label: "Void transaksi",
        helper: "Boleh membatalkan transaksi sebelum final.",
      },
      {
        key: EMPLOYEE_PERMISSIONS.TRANSACTION_DELETE,
        label: "Delete transaksi",
        helper: "Boleh menghapus atau mengarsip transaksi.",
        danger: true,
      },
    ],
  },
  {
    id: "stock",
    label: "Stok",
    helper: "Perubahan inventory dan harga produk.",
    permissions: [
      {
        key: EMPLOYEE_PERMISSIONS.PRODUCT_STOCK_EDIT,
        label: "Edit stok",
        helper: "Boleh koreksi stok fisik.",
      },
      {
        key: EMPLOYEE_PERMISSIONS.PRODUCT_PRICE_EDIT,
        label: "Edit harga",
        helper: "Boleh mengubah harga jual.",
      },
    ],
  },
  {
    id: "shift",
    label: "Shift",
    helper: "Kontrol opening dan closing operasional kasir.",
    permissions: [
      {
        key: EMPLOYEE_PERMISSIONS.SHIFT_CLOSE,
        label: "Closing shift",
        helper: "Boleh menutup shift kasir.",
      },
    ],
  },
  {
    id: "finance",
    label: "Keuangan",
    helper: "Akses perubahan kas dan wallet operasional.",
    permissions: [
      {
        key: EMPLOYEE_PERMISSIONS.FINANCE_CASH_WALLET,
        label: "Kas dan wallet",
        helper: "Boleh input kas/wallet operasional.",
      },
    ],
  },
  {
    id: "security",
    label: "Security",
    helper: "Aksi keamanan akun dan sesi.",
    permissions: [
      {
        key: EMPLOYEE_PERMISSIONS.EMPLOYEE_PIN_RESET,
        label: "Reset PIN",
        helper: "Boleh meminta reset PIN staff.",
        danger: true,
      },
      {
        key: EMPLOYEE_PERMISSIONS.EMPLOYEE_SESSION_REVOKE,
        label: "Revoke session",
        helper: "Boleh memutus sesi aktif staff.",
        danger: true,
      },
    ],
  },
  {
    id: "owner",
    label: "Owner Actions",
    helper: "Aksi konfigurasi yang tetap perlu supervisi owner.",
    permissions: [
      {
        key: EMPLOYEE_PERMISSIONS.SETTINGS_SECURITY_MANAGE,
        label: "Atur security",
        helper: "Boleh mengubah kebijakan PIN dan akses.",
        danger: true,
      },
    ],
  },
];

export function flattenEmployeePermissionKeys(groups = EMPLOYEE_PERMISSION_GROUPS) {
  if (!Array.isArray(groups)) return [];

  const keys = [];
  for (const group of groups) {
    const permissions = Array.isArray(group?.permissions) ? group.permissions : [];
    for (const permission of permissions) {
      const key = String(permission?.key || "").trim();
      if (key) keys.push(key);
    }
  }

  return Array.from(new Set(keys));
}

export function clampEmployeeActivityLimit(limit) {
  const fallbackLimit = EMPLOYEE_ACTIVITY_PAGE_SIZE;
  const numericLimit = limit === undefined || limit === null ? fallbackLimit : Number(limit);

  if (!Number.isFinite(numericLimit)) return fallbackLimit;

  const roundedLimit = Math.round(numericLimit);
  return Math.max(1, Math.min(EMPLOYEE_ACTIVITY_MAX_PAGE_SIZE, roundedLimit));
}

function normalizeActivityPath(pathname) {
  const rawPathname = String(pathname || "").toLowerCase();
  const withoutHash = rawPathname.split("#")[0];
  const withoutQuery = withoutHash.split("?")[0];
  return withoutQuery.replace(/\/+$/, "") || "/";
}

export function getEmployeeRouteActivityStatus(pathname = "") {
  const route = normalizeActivityPath(pathname);

  if (route.includes("/kasir") || route.includes("/cashier") || route.includes("/pos")) {
    return EMPLOYEE_ACTIVITY_STATUS.CHECKOUT;
  }

  if (route.includes("/stock-opname") || route.includes("/produk") || route.includes("/stok")) {
    return EMPLOYEE_ACTIVITY_STATUS.STOCK_INPUT;
  }

  if (route.includes("/shift")) {
    return EMPLOYEE_ACTIVITY_STATUS.SHIFT_CLOSING;
  }

  if (
    route.includes("/laporan") ||
    route.includes("/report") ||
    route.includes("/dashboard") ||
    route.includes("/analytics")
  ) {
    return EMPLOYEE_ACTIVITY_STATUS.REPORT_VIEW;
  }

  return EMPLOYEE_ACTIVITY_STATUS.IDLE;
}
