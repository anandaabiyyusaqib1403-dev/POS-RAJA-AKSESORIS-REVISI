/**
 * Utility for wrapping sensitive actions with PIN confirmation
 * This ensures that critical operations require PIN verification
 */

/**
 * List of sensitive actions that require PIN confirmation
 * These are organized by feature for easy management
 */
export const SENSITIVE_ACTIONS = {
  PRODUCT: {
    CREATE: "Tambah produk",
    EDIT: "Edit produk",
    DELETE: "Hapus produk",
    RESTORE: "Pulihkan produk",
    PERMANENT_DELETE: "Hapus permanen produk",
    EDIT_STOCK: "Edit stok barang",
    EDIT_PRICE: "Ubah harga",
    IMPORT: "Import/update produk",
    TOGGLE_STATUS: "Aktifkan/nonaktifkan produk",
    RENAME_CATEGORY: "Ubah nama kategori produk",
    DELETE_CATEGORY: "Hapus kategori produk",
    APPLY_STOCK_OPNAME: "Terapkan Stock Opname",
  },
  SUPPLIER_RETURN: {
    CREATE: "Buat retur supplier",
    RESOLVE: "Proses retur supplier",
  },
  CUSTOMER_RETURN: {
    CREATE: "Buat klaim garansi konsumen",
  },
  SERVICE: {
    CREATE: "Tambah layanan",
    EDIT: "Edit layanan",
    DISABLE: "Nonaktifkan layanan",
    DELETE: "Hapus layanan",
    IMPORT: "Import/update layanan",
  },
  TRANSACTION: {
    DELETE: "Hapus transaksi",
    RESTORE: "Pulihkan transaksi",
    PERMANENT_DELETE: "Hapus permanen transaksi",
  },
  DEBT: {
    EDIT: "Edit hutang/piutang",
    DELETE: "Hapus hutang/piutang",
    MARK_PAID: "Tandai sebagai lunas",
  },
  CASH: {
    EDIT_ENTRY: "Edit catatan kas",
    DELETE_ENTRY: "Hapus catatan kas",
    DELETE_MULTIPLE: "Hapus beberapa catatan kas",
  },
  CUSTOMER: {
    EDIT: "Edit data pelanggan",
    DELETE: "Hapus data pelanggan",
  },
  WALLET: {
    MUTATE: "Mutasi saldo aplikasi",
  },
};

export const AUTHORIZATION_REQUIRED_MESSAGE = "Masukkan PIN untuk lanjut";

/**
 * Configuration for which actions require PIN
 * You can customize this per role or per action
 */
export function shouldRequirePinForAction(actionKey, userRole) {
  if (userRole === "pemilik") {
    return false;
  }

  if (userRole === "kasir") {
    return true;
  }

  return false;
}

/**
 * Get the action description for a sensitive operation
 */
export function getActionDescription(actionKey) {
  const [category, action] = actionKey.split(".");
  return SENSITIVE_ACTIONS[category]?.[action] || "Tindakan sensitif";
}

/**
 * Create a PIN-protected wrapper for async actions
 *
 * Usage:
 * const deleteProduct = await wrapWithPinProtection(
 *   () => dataContext.deleteProduct(id),
 *   "PRODUCT.DELETE",
 *   userRole
 * );
 */
export async function wrapWithPinProtection(
  action,
  actionKey,
  userRole,
  verifyPinFn
) {
  if (!shouldRequirePinForAction(actionKey, userRole)) {
    // No PIN required, execute directly
    return await action();
  }

  if (!verifyPinFn) {
    throw new Error("PIN verification function is required for sensitive actions");
  }

  // PIN verification happens in the component that calls this
  // This function just helps manage the wrapper logic
  return {
    requiresPin: true,
    actionKey,
    description: getActionDescription(actionKey),
    execute: action,
  };
}
