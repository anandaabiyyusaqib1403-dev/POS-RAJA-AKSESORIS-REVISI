import { normalizeProductCode } from "./productNormalizer";
import { toSafeInteger } from "./shared";

export function normalizeStockLog(log: Record<string, any>) {
  return {
    ...log,
    tipe: log.tipe || "masuk",
    jumlah: Number(log.jumlah || 0),
    stok_sebelum:
      typeof log.stok_sebelum === "number" ? log.stok_sebelum : null,
    stok_sesudah:
      typeof log.stok_sesudah === "number" ? log.stok_sesudah : null,
    referensi: log.referensi || "",
    catatan: log.catatan || "",
  };
}

export function normalizeStockOpnameItem(item: Record<string, any>) {
  const systemStock = toSafeInteger(item.system_stock ?? item.stok_sistem ?? 0);
  const rawRealStock = item.real_stock ?? item.stok_real;
  const hasRealStock = rawRealStock !== null && rawRealStock !== undefined && rawRealStock !== "";
  const realStock = hasRealStock ? Math.max(0, toSafeInteger(rawRealStock)) : null;
  const difference = hasRealStock
    ? realStock - systemStock
    : toSafeInteger(item.difference ?? item.selisih ?? 0);

  return {
    ...item,
    id: item.id || crypto.randomUUID(),
    session_id: item.session_id || null,
    product_id: item.product_id || item.produk_id || null,
    product_name: item.product_name || item.nama_produk || "",
    product_code: normalizeProductCode(item.product_code || item.kode_produk),
    category: item.category || item.kategori || "Aksesoris Lainnya",
    system_stock: systemStock,
    real_stock: realStock,
    difference,
    note: item.note || item.catatan || "",
    cost: Math.max(0, toSafeInteger(item.cost ?? item.harga_beli ?? 0)),
    applied_delta:
      item.applied_delta === null || item.applied_delta === undefined
        ? null
        : toSafeInteger(item.applied_delta),
    counted_at: item.counted_at || null,
    conflict_status: item.conflict_status || "clear",
    conflict_reason: item.conflict_reason || "",
    created_at: item.created_at || new Date().toISOString(),
    updated_at: item.updated_at || item.created_at || new Date().toISOString(),
  };
}

export function summarizeStockOpnameItems(items: Record<string, any>[] = []) {
  return items.reduce(
    (acc, rawItem) => {
      const item = normalizeStockOpnameItem(rawItem);
      const hasRealStock = item.real_stock !== null && item.real_stock !== undefined;
      if (hasRealStock) {
        acc.checked_products += 1;
        if (item.difference < 0) {
          acc.total_minus += Math.abs(item.difference);
          acc.total_loss += Math.abs(item.difference) * item.cost;
        } else if (item.difference > 0) {
          acc.total_plus += item.difference;
        }
      }
      return acc;
    },
    {
      checked_products: 0,
      total_minus: 0,
      total_plus: 0,
      total_loss: 0,
    }
  );
}

export function normalizeStockOpnameSession(
  session: Record<string, any>,
  items: Record<string, any>[] = []
) {
  const normalizedItems = items
    .filter((item) => item.session_id === session.id)
    .map(normalizeStockOpnameItem)
    .sort((left, right) => left.product_name.localeCompare(right.product_name));
  const computed = summarizeStockOpnameItems(normalizedItems);

  return {
    ...session,
    id: session.id,
    name: session.name || "Stock Opname",
    category: session.category || "Semua kategori",
    status: session.status === "completed" ? "completed" : "draft",
    created_by: session.created_by || null,
    applied_by: session.applied_by || null,
    cutoff_at: session.cutoff_at || session.created_at || new Date().toISOString(),
    created_at: session.created_at || new Date().toISOString(),
    updated_at: session.updated_at || session.created_at || new Date().toISOString(),
    completed_at: session.completed_at || null,
    total_products: toSafeInteger(session.total_products ?? normalizedItems.length),
    checked_products: toSafeInteger(session.checked_products ?? computed.checked_products),
    total_minus: toSafeInteger(session.total_minus ?? computed.total_minus),
    total_plus: toSafeInteger(session.total_plus ?? computed.total_plus),
    total_loss: Math.max(0, toSafeInteger(session.total_loss ?? computed.total_loss)),
    items: normalizedItems,
  };
}
