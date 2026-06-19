import { normalizeProductCode } from "./productNormalizer";
import { toSafeInteger } from "./shared";

export function normalizeSupplierReturn(row: Record<string, any>, items: Record<string, any>[] = []) {
  const normalizedItems = items
    .filter((item) => item.supplier_return_id === row.id)
    .map((item) => ({
      ...item,
      product_id: item.product_id || null,
      product_name: item.product_name || "",
      product_code: normalizeProductCode(item.product_code || ""),
      category: item.category || "",
      quantity: Math.max(0, toSafeInteger(item.quantity || 0)),
      unit_cost: Math.max(0, toSafeInteger(item.unit_cost || 0)),
      subtotal_cost: Math.max(0, toSafeInteger(item.subtotal_cost || 0)),
      condition: item.condition || "",
      notes: item.notes || "",
    }));

  return {
    ...row,
    id: row.id,
    no_retur: row.no_retur || "",
    supplier_id: row.supplier_id || null,
    supplier_name: row.supplier_name || "",
    status: row.status || "pending",
    reason: row.reason || "lainnya",
    condition: row.condition || "",
    notes: row.notes || "",
    total_quantity: Math.max(0, toSafeInteger(row.total_quantity || 0)),
    total_estimated_value: Math.max(0, toSafeInteger(row.total_estimated_value || 0)),
    settlement_amount: Math.max(0, toSafeInteger(row.settlement_amount || 0)),
    settlement_method: row.settlement_method || "",
    settlement_notes: row.settlement_notes || "",
    created_by: row.created_by || null,
    completed_by: row.completed_by || null,
    completed_at: row.completed_at || null,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || row.created_at || new Date().toISOString(),
    items: normalizedItems,
  };
}

function normalizeWarrantyOutcome(row: Record<string, any>) {
  const value = String(row.warranty_outcome || row.refund_method || "").trim().toLowerCase();
  if (value === "exchange" || value === "warranty_exchange") return "exchange";
  if (value === "rejected" || value === "ditolak" || value === "warranty_rejected") return "rejected";
  return "refund";
}

export function normalizeCustomerReturn(row: Record<string, any>, items: Record<string, any>[] = []) {
  const normalizedItems = items
    .filter((item) => item.customer_return_id === row.id)
    .map((item) => ({
      ...item,
      transaction_item_id: item.transaction_item_id || null,
      product_id: item.product_id || null,
      product_name: item.product_name || "",
      product_code: normalizeProductCode(item.product_code || ""),
      category: item.category || "",
      quantity: Math.max(0, toSafeInteger(item.quantity || 0)),
      unit_price: Math.max(0, toSafeInteger(item.unit_price || 0)),
      subtotal_refund: Math.max(0, toSafeInteger(item.subtotal_refund || 0)),
      restock: item.restock !== false,
      condition: item.condition || "",
      notes: item.notes || "",
    }));

  return {
    ...row,
    id: row.id,
    no_retur: row.no_retur || "",
    transaction_id: row.transaction_id || null,
    transaction_no: row.transaction_no || "",
    customer_name: row.customer_name || "",
    status: row.status || "selesai",
    reason: row.reason || "lainnya",
    condition: row.condition || "",
    notes: row.notes || "",
    total_quantity: Math.max(0, toSafeInteger(row.total_quantity || 0)),
    total_refund_amount: Math.max(0, toSafeInteger(row.total_refund_amount || 0)),
    refund_method: row.refund_method || "",
    restock: row.restock !== false,
    warranty_outcome: normalizeWarrantyOutcome(row),
    created_by: row.created_by || null,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || row.created_at || new Date().toISOString(),
    items: normalizedItems,
  };
}
