import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseEnabled } from "../lib/supabase";
import {
  createDateRangeFilters,
  usePagedSupabaseRows,
} from "./usePagedSupabaseRows";

const SUPPLIER_RETURN_SELECT = [
  "id",
  "no_retur",
  "supplier_id",
  "supplier_name",
  "status",
  "reason",
  "condition",
  "notes",
  "total_quantity",
  "total_estimated_value",
  "settlement_amount",
  "settlement_method",
  "settlement_notes",
  "created_by",
  "completed_by",
  "completed_at",
  "created_at",
  "updated_at",
].join(", ");
const SUPPLIER_RETURN_ITEM_SELECT = [
  "id",
  "supplier_return_id",
  "product_id",
  "product_name",
  "product_code",
  "category",
  "quantity",
  "unit_cost",
  "subtotal_cost",
  "condition",
  "notes",
].join(", ");
const CUSTOMER_RETURN_SELECT = [
  "id",
  "no_retur",
  "transaction_id",
  "transaction_no",
  "customer_name",
  "status",
  "reason",
  "condition",
  "notes",
  "total_quantity",
  "total_refund_amount",
  "refund_method",
  "restock",
  "created_by",
  "created_at",
  "updated_at",
].join(", ");
const CUSTOMER_RETURN_ITEM_SELECT = [
  "id",
  "customer_return_id",
  "transaction_item_id",
  "product_id",
  "product_name",
  "product_code",
  "category",
  "quantity",
  "unit_price",
  "subtotal_refund",
  "restock",
  "condition",
  "notes",
].join(", ");
const RETURN_ITEM_TIMEOUT_MS = 15000;

function withReturnItemTimeout(promise, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), RETURN_ITEM_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function buildSearchFilter(type, keyword) {
  const value = String(keyword || "").trim();
  if (!value) return null;

  const encoded = value.replaceAll(",", " ");
  const pattern = `%${encoded}%`;

  if (type === "customer") {
    return {
      operator: "or",
      value: [
        `no_retur.ilike.${pattern}`,
        `transaction_no.ilike.${pattern}`,
        `customer_name.ilike.${pattern}`,
        `reason.ilike.${pattern}`,
      ].join(","),
    };
  }

  return {
    operator: "or",
    value: [
      `no_retur.ilike.${pattern}`,
      `supplier_name.ilike.${pattern}`,
      `reason.ilike.${pattern}`,
    ].join(","),
  };
}

function normalizeReturn(row, items) {
  return {
    ...row,
    items: items.filter((item) =>
      item.supplier_return_id
        ? item.supplier_return_id === row.id
        : item.customer_return_id === row.id
    ),
  };
}

export function usePagedReturnRows({ type, search, dateRange, statusFilter, pageSize = 12 }) {
  const filters = useMemo(() => {
    const nextFilters = createDateRangeFilters("created_at", dateRange);
    const searchFilter = buildSearchFilter(type, search);
    if (searchFilter) nextFilters.push(searchFilter);
    if (type === "supplier" && statusFilter && statusFilter !== "semua") {
      nextFilters.push({ column: "status", operator: "eq", value: statusFilter });
    }
    return nextFilters;
  }, [dateRange, search, statusFilter, type]);

  const table = type === "customer" ? "customer_returns" : "supplier_returns";
  const itemTable = type === "customer" ? "customer_return_items" : "supplier_return_items";
  const itemKey = type === "customer" ? "customer_return_id" : "supplier_return_id";
  const page = usePagedSupabaseRows({
    table,
    select: type === "customer" ? CUSTOMER_RETURN_SELECT : SUPPLIER_RETURN_SELECT,
    filters,
    pageSize,
    orderBy: "created_at",
    ascending: false,
  });
  const [items, setItems] = useState([]);
  const [itemsError, setItemsError] = useState(null);
  const [itemsLoading, setItemsLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadItems() {
      if (!supabaseEnabled || !page.rows.length) {
        setItems([]);
        setItemsError(null);
        return;
      }

      setItemsLoading(true);
      setItemsError(null);
      try {
        const { data, error } = await withReturnItemTimeout(
          supabase
            .from(itemTable)
            .select(type === "customer" ? CUSTOMER_RETURN_ITEM_SELECT : SUPPLIER_RETURN_ITEM_SELECT)
            .in(
              itemKey,
              page.rows.map((row) => row.id)
            ),
          "Memuat detail retur terlalu lama."
        );

        if (error) throw error;
        if (alive) setItems(data || []);
      } catch (error) {
        if (alive) {
          setItems([]);
          setItemsError(error);
        }
      } finally {
        if (alive) setItemsLoading(false);
      }
    }

    loadItems();

    return () => {
      alive = false;
    };
  }, [itemKey, itemTable, page.rows, type]);

  const rows = useMemo(
    () => page.rows.map((row) => normalizeReturn(row, items)),
    [items, page.rows]
  );

  return {
    ...page,
    rows,
    loading: page.loading || itemsLoading,
    error: page.error || itemsError,
  };
}
