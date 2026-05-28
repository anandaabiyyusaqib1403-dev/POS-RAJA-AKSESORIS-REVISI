export const EMPLOYEE_PERMISSIONS = Object.freeze({
  TRANSACTION_REFUND: "transaction.refund",
  TRANSACTION_VOID: "transaction.void",
  TRANSACTION_DELETE: "transaction.delete",
  PRODUCT_STOCK_EDIT: "product.stock_edit",
  PRODUCT_PRICE_EDIT: "product.price_edit",
  SHIFT_CLOSE: "shift.close",
  FINANCE_CASH_WALLET: "finance.cash_wallet",
  EMPLOYEE_PIN_RESET: "employee.pin_reset",
  EMPLOYEE_SESSION_REVOKE: "employee.session_revoke",
  SETTINGS_SECURITY_MANAGE: "settings.security_manage",
});

export const EMPLOYEE_PERMISSION_KEYS = new Set(Object.values(EMPLOYEE_PERMISSIONS));

function normalizePermissionKey(permissionKey) {
  return String(permissionKey || "").trim();
}

function hasObjectPermission(userPermissions, permissionKey) {
  if (!userPermissions || typeof userPermissions !== "object") return false;
  return Boolean(userPermissions[permissionKey]);
}

// These helpers are for UI visibility only. Sensitive actions must still be
// enforced by role checks, Supabase RLS, backend RPCs, or server-side policy.
export function hasPermission(userPermissions, permissionKey) {
  const normalizedPermissionKey = normalizePermissionKey(permissionKey);
  if (!normalizedPermissionKey || !userPermissions) return false;

  if (userPermissions instanceof Set) {
    return userPermissions.has(normalizedPermissionKey);
  }

  if (Array.isArray(userPermissions)) {
    return userPermissions.includes(normalizedPermissionKey);
  }

  return hasObjectPermission(userPermissions, normalizedPermissionKey);
}

export function hasAnyPermission(userPermissions, permissionKeys) {
  if (!Array.isArray(permissionKeys) && !(permissionKeys instanceof Set)) return false;

  for (const permissionKey of permissionKeys) {
    if (hasPermission(userPermissions, permissionKey)) return true;
  }

  return false;
}

export function hasAllPermissions(userPermissions, permissionKeys) {
  if (!Array.isArray(permissionKeys) && !(permissionKeys instanceof Set)) return false;

  const normalizedPermissionKeys = Array.from(permissionKeys).map(normalizePermissionKey).filter(Boolean);
  if (!normalizedPermissionKeys.length) return false;

  return normalizedPermissionKeys.every((permissionKey) =>
    hasPermission(userPermissions, permissionKey)
  );
}
