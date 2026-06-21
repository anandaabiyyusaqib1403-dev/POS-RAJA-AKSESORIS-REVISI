import { supabase } from "../../../services/supabase/client";
import {
  getProductCodeConflictMessage,
  normalizeProductCode,
} from "../../../core/normalizers/productNormalizer";
import {
  isOptionalResetTableError,
  isPermissionDeniedForTable,
} from "../../../core/errors/schemaDrift";

export function getProductDbPayload(product: Record<string, any>, options: Record<string, any> = {}) {
  const { legacy = false, includeCode = true } = options;
  const payload: Record<string, any> = {
    nama: product.nama,
    kategori: product.kategori,
    stok: product.stok,
    stok_minimum: product.stok_minimum,
    harga_beli: product.harga_beli,
    harga_jual: product.harga_jual,
    satuan: product.satuan,
    aktif: product.aktif,
  };

  if (includeCode) {
    payload.kode_produk = product.kode_produk;
  }

  if (!legacy) {
    payload.status = product.status;
    payload.deleted_at = product.deleted_at;
    payload.deleted_by = product.deleted_by;
  }

  return payload;
}

export async function throwDuplicateProductCodeError(code: string, currentProductId: string | null = null) {
  let query = supabase
    .from("produk")
    .select("id, nama, aktif, status, deleted_at")
    .eq("kode_produk", normalizeProductCode(code))
    .limit(1);

  if (currentProductId) {
    query = query.neq("id", currentProductId);
  }

  const { data } = await query;
  throw new Error(getProductCodeConflictMessage(code, data?.[0] || null));
}

export function getOptionalProductActivityRows(result: { data?: any[] | null; error?: any } | null | undefined) {
  if (!result) return [];
  if (
    result.error &&
    (isOptionalResetTableError(result.error) ||
      isPermissionDeniedForTable(result.error, ["product_activity_logs"]))
  ) {
    console.warn(
      "Product activity logs skipped:",
      result.error.message || result.error
    );
    return [];
  }
  if (result.error) throw result.error;
  return result.data || [];
}
