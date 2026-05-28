import type { ProductActivityLog, ProductRow, ProductStatus } from "../../types/Product";
import { toSafeInteger } from "./shared";

export const productStatuses: Record<ProductStatus, ProductStatus> = {
  active: "active",
  inactive: "inactive",
  deleted: "deleted",
};

export function normalizeProductCode(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

export function createGeneratedProductCode(name: unknown) {
  const compactName = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `RAJA-${compactName || "PRODUK"}-${suffix}`;
}

export function getProductCodeConflictMessage(code: unknown, product: ProductRow | null = null) {
  const normalizedCode = normalizeProductCode(code);
  const productName = product?.nama ? `"${product.nama}"` : "produk lain";

  if (product?.status === productStatuses.deleted) {
    return `Kode produk ${normalizedCode} masih dipakai oleh ${productName} di History Produk. Restore atau hapus permanen produk lama dulu.`;
  }

  if (product?.status === productStatuses.inactive || product?.aktif === false) {
    return `Kode produk ${normalizedCode} sedang dipakai oleh ${productName} yang nonaktif. Aktifkan atau ubah kode produk lama dulu.`;
  }

  return `Kode produk ${normalizedCode} sudah dipakai oleh ${productName}.`;
}

export function normalizeProduct(product: ProductRow) {
  const status =
    product.status ||
    (product.aktif === false ? productStatuses.inactive : productStatuses.active);
  const safeStatus = Object.values(productStatuses).includes(status as ProductStatus)
    ? status
    : productStatuses.active;

  return {
    ...product,
    kode_produk: normalizeProductCode(product.kode_produk),
    nama: String(product.nama || "").trim(),
    kategori: String(product.kategori || "").trim() || "Aksesoris Lainnya",
    stok: Math.max(0, toSafeInteger(product.stok || 0)),
    stok_minimum: Math.max(0, toSafeInteger(product.stok_minimum ?? 3, 3)),
    harga_beli: Math.max(0, toSafeInteger(product.harga_beli || 0)),
    harga_jual: Math.max(0, toSafeInteger(product.harga_jual || 0)),
    satuan: String(product.satuan || "pcs").trim() || "pcs",
    status: safeStatus,
    aktif: safeStatus === productStatuses.active,
    deleted_at: product.deleted_at || null,
    deleted_by: product.deleted_by || null,
  };
}

export function splitInventoryProducts(products: ProductRow[]) {
  return products.reduce(
    (acc, product) => {
      const normalizedProduct = normalizeProduct(product);
      if (normalizedProduct.status === productStatuses.deleted) {
        acc.deletedProducts.push(normalizedProduct);
      } else {
        acc.activeProducts.push(normalizedProduct);
      }
      return acc;
    },
    { activeProducts: [] as ReturnType<typeof normalizeProduct>[], deletedProducts: [] as ReturnType<typeof normalizeProduct>[] }
  );
}

export function createProductActivityLog({
  productId,
  action,
  actorId,
  details = {},
  productSnapshot = null,
}: {
  productId?: string | null;
  action: string;
  actorId?: string | null;
  details?: Record<string, any>;
  productSnapshot?: ProductRow | null;
}) {
  return {
    id: crypto.randomUUID(),
    product_id: productId || null,
    action,
    actor_id: actorId || null,
    details,
    product_snapshot: productSnapshot,
    created_at: new Date().toISOString(),
  };
}

export function normalizeProductActivityLog(log: ProductActivityLog) {
  return {
    ...log,
    action: log.action || "",
    details: log.details || {},
    product_snapshot: log.product_snapshot || null,
    created_at: log.created_at || new Date().toISOString(),
  };
}

export function sanitizeImportedProduct(product: ProductRow) {
  return normalizeProduct({
    ...product,
    nama: String(product.nama || "").trim(),
    kategori: String(product.kategori || "").trim() || "Aksesoris Lainnya",
    stok: Math.max(0, Number(product.stok || 0)),
    stok_minimum: Math.max(0, Number(product.stok_minimum ?? 3)),
    harga_beli: Math.max(0, Number(product.harga_beli || 0)),
    harga_jual: Math.max(0, Number(product.harga_jual || 0)),
    satuan: String(product.satuan || "pcs").trim() || "pcs",
    aktif: product.aktif ?? true,
  });
}
