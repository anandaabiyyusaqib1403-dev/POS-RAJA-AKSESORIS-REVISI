import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseEnabled } from "../lib/supabase";
import {
  createDateRangeFilters,
  usePagedSupabaseRows,
} from "./usePagedSupabaseRows";

const DETAIL_SELECT = [
  "id",
  "transaction_key",
  "transaction_id",
  "no_transaksi",
  "occurred_at",
  "cashier_id",
  "cashier",
  "type",
  "type_label",
  "category",
  "provider",
  "product_name",
  "qty",
  "selling_price",
  "cost",
  "profit",
  "payment_customer",
  "payment_group",
  "target_number",
  "searchable_text",
].join(", ");
const REPORT_QUERY_TIMEOUT_MS = 15000;

function withReportTimeout(promise, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), REPORT_QUERY_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function normalizeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function toIsoRange(range = {}) {
  const startDate = range.startDate ? new Date(range.startDate) : null;
  const endDate = range.endDate ? new Date(range.endDate) : null;

  return {
    start: startDate && Number.isFinite(startDate.getTime()) ? startDate.toISOString() : null,
    end: endDate && Number.isFinite(endDate.getTime()) ? endDate.toISOString() : null,
  };
}

function emptyReport() {
  return {
    globalSummary: {
      total_transactions: 0,
      total_revenue: 0,
      total_cost: 0,
      total_profit: 0,
      total_qty: 0,
      margin: 0,
    },
    typeSummary: [],
    categorySummary: [],
    providerSummary: [],
    paymentSummary: [],
    topProducts: [],
    cashierSummary: [],
    detailRows: [],
  };
}

function mapAggregate(row) {
  const totalRevenue = normalizeNumber(row.total_revenue);
  const totalProfit = normalizeNumber(row.total_profit);

  return {
    key: row.key,
    label: row.label || row.key || "-",
    category: row.category || "",
    provider: row.provider || "",
    type: row.key || "",
    total_transactions: normalizeNumber(row.total_transactions),
    total_qty: normalizeNumber(row.total_qty),
    total_revenue: totalRevenue,
    total_cost: normalizeNumber(row.total_cost),
    total_profit: totalProfit,
    margin: totalRevenue > 0 ? totalProfit / totalRevenue : 0,
  };
}

function mapDetailRow(row) {
  return {
    id: row.id,
    transaction_key: row.transaction_key,
    transaction_id: row.transaction_id,
    no_transaksi: row.no_transaksi,
    date: row.occurred_at ? new Date(row.occurred_at) : new Date(),
    cashier: row.cashier || "-",
    type: row.type || "produk",
    type_label: row.type_label || row.type || "-",
    category: row.category || "-",
    provider: row.provider || null,
    product_name: row.product_name || "-",
    qty: normalizeNumber(row.qty),
    selling_price: normalizeNumber(row.selling_price),
    cost: normalizeNumber(row.cost),
    profit: normalizeNumber(row.profit),
    payment_customer: row.payment_customer || "-",
    payment_group: row.payment_group || "-",
    target_number: row.target_number || "",
  };
}

function normalizeRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function buildReport(summaryRows, detailRows) {
  const report = emptyReport();
  const safeSummaryRows = normalizeRows(summaryRows);
  const safeDetailRows = normalizeRows(detailRows);

  safeSummaryRows.forEach((row) => {
    const mapped = mapAggregate(row);

    if (row.summary_type === "global") {
      report.globalSummary = {
        total_transactions: mapped.total_transactions,
        total_revenue: mapped.total_revenue,
        total_cost: mapped.total_cost,
        total_profit: mapped.total_profit,
        total_qty: mapped.total_qty,
        margin: mapped.margin,
      };
      return;
    }

    if (row.summary_type === "type") {
      report.typeSummary.push(mapped);
      return;
    }

    if (row.summary_type === "category") {
      report.categorySummary.push(mapped);
      return;
    }

    if (row.summary_type === "provider") {
      report.providerSummary.push(mapped);
      return;
    }

    if (row.summary_type === "payment") {
      report.paymentSummary.push({
        payment_customer: mapped.label,
        total_transactions: mapped.total_transactions,
        total_revenue: mapped.total_revenue,
      });
      return;
    }

    if (row.summary_type === "top_product") {
      report.topProducts.push({
        rank: normalizeNumber(row.rank),
        product_name: mapped.label,
        qty: mapped.total_qty,
        revenue: mapped.total_revenue,
        profit: mapped.total_profit,
      });
      return;
    }

    if (row.summary_type === "cashier") {
      report.cashierSummary.push(mapped);
    }
  });

  report.typeSummary.sort((left, right) => {
    const order = ["produk", "layanan", "jasa"];
    return order.indexOf(left.type) - order.indexOf(right.type);
  });
  report.categorySummary.sort((left, right) => right.total_profit - left.total_profit);
  report.providerSummary.sort((left, right) => right.total_profit - left.total_profit);
  report.cashierSummary.sort((left, right) => right.total_revenue - left.total_revenue);
  report.detailRows = safeDetailRows.map(mapDetailRow);

  return report;
}

function buildSearchFilter(search) {
  const keyword = String(search || "").trim();
  if (!keyword) return null;
  return {
    column: "searchable_text",
    operator: "ilike",
    value: `%${keyword.replaceAll(",", " ")}%`,
  };
}

export function useOwnerSalesReport({ range, search, type, pageSize = 25 }) {
  const [summaryRows, setSummaryRows] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);
  const isoRange = useMemo(() => toIsoRange(range), [range]);

  const filters = useMemo(() => {
    const nextFilters = createDateRangeFilters("occurred_at", range);
    const searchFilter = buildSearchFilter(search);
    if (searchFilter) nextFilters.push(searchFilter);
    if (type && type !== "semua") {
      nextFilters.push({ column: "type", operator: "eq", value: type });
    }
    return nextFilters;
  }, [range, search, type]);

  const details = usePagedSupabaseRows({
    table: "sales_report_items",
    select: DETAIL_SELECT,
    filters,
    pageSize,
    orderBy: "occurred_at",
    ascending: false,
    enabled: supabaseEnabled,
  });

  useEffect(() => {
    let alive = true;

    async function loadSummary() {
      if (!supabaseEnabled) {
        setSummaryRows([]);
        setSummaryError(null);
        setSummaryLoading(false);
        return;
      }

      setSummaryLoading(true);
      setSummaryError(null);

      try {
        const { data, error } = await withReportTimeout(
          supabase.rpc("get_sales_report_summary", {
            p_start: isoRange.start,
            p_end: isoRange.end,
          }),
          "Memuat ringkasan laporan penjualan terlalu lama."
        );
        if (error) throw error;
        if (alive) setSummaryRows(normalizeRows(data));
      } catch (error) {
        if (alive) {
          setSummaryRows([]);
          setSummaryError(error);
        }
      } finally {
        if (alive) setSummaryLoading(false);
      }
    }

    loadSummary();

    return () => {
      alive = false;
    };
  }, [isoRange.end, isoRange.start, summaryRefreshKey]);

  const report = useMemo(
    () => buildReport(summaryRows, details.rows),
    [details.rows, summaryRows]
  );

  return {
    report,
    detailPage: details,
    loading: summaryLoading || details.loading,
    error: summaryError || details.error,
    available: !summaryError && !details.error,
    refresh() {
      setSummaryRefreshKey((value) => value + 1);
      details.refresh();
    },
  };
}
