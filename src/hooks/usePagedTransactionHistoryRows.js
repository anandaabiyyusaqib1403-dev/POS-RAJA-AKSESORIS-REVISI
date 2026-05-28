import { useMemo } from "react";
import {
  createDateRangeFilters,
  usePagedSupabaseRows,
} from "./usePagedSupabaseRows";

const TRANSACTION_HISTORY_SELECT = [
  "id",
  "source",
  "flow",
  "occurred_at",
  "date_filter_value",
  "raw_id",
  "reference",
  "summary",
  "caption",
  "amount",
  "secondary_amount",
  "secondary_label",
  "income_value",
  "expense_value",
  "internal_value",
  "profit_impact",
  "payment_method",
  "note",
  "searchable_text",
].join(", ");

function buildSearchFilter(search) {
  const keyword = String(search || "").trim();
  if (!keyword) return null;
  return {
    column: "searchable_text",
    operator: "ilike",
    value: `%${keyword}%`,
  };
}

function getRawMap(rows) {
  return new Map((rows || []).map((row) => [row.id, row]));
}

export function usePagedTransactionHistoryRows({
  search,
  sourceFilter,
  flowFilter,
  paymentFilter,
  dateRange,
  rawRows,
  pageSize = 25,
}) {
  const filters = useMemo(() => {
    const nextFilters = createDateRangeFilters("date_filter_value", dateRange);
    const searchFilter = buildSearchFilter(search);
    if (searchFilter) nextFilters.push(searchFilter);
    if (sourceFilter && sourceFilter !== "semua") {
      nextFilters.push({ column: "source", operator: "eq", value: sourceFilter });
    }
    if (flowFilter && flowFilter !== "semua") {
      nextFilters.push({ column: "flow", operator: "eq", value: flowFilter });
    }
    if (paymentFilter && paymentFilter !== "semua") {
      nextFilters.push({ column: "payment_method", operator: "eq", value: paymentFilter });
    }
    return nextFilters;
  }, [dateRange, flowFilter, paymentFilter, search, sourceFilter]);

  const page = usePagedSupabaseRows({
    table: "transaction_history_summary",
    select: TRANSACTION_HISTORY_SELECT,
    filters,
    pageSize,
    orderBy: "occurred_at",
    ascending: false,
  });

  const rawMaps = useMemo(
    () => ({
      aksesoris: getRawMap(rawRows?.accessoryTransactions),
      digital: getRawMap(rawRows?.digitalTransactions),
      logistik: getRawMap(rawRows?.logisticsTransactions),
      saldo: getRawMap(rawRows?.walletTransactions),
      operasional: getRawMap(rawRows?.cashEntries),
    }),
    [rawRows]
  );

  const rows = useMemo(
    () =>
      page.rows.map((row) => ({
        id: row.id,
        source: row.source,
        flow: row.flow,
        occurredAt: row.occurred_at,
        dateFilterValue: row.date_filter_value,
        reference: row.reference,
        summary: row.summary,
        caption: row.caption,
        amount: Number(row.amount || 0),
        secondaryAmount: Number(row.secondary_amount || 0),
        secondaryLabel: row.secondary_label || "Detail",
        incomeValue: Number(row.income_value || 0),
        expenseValue: Number(row.expense_value || 0),
        internalValue: Number(row.internal_value || 0),
        profitImpact: Number(row.profit_impact || 0),
        paymentMethod: row.payment_method || "",
        note: row.note || "",
        raw: rawMaps[row.source]?.get(row.raw_id) || { id: row.raw_id },
        searchableText: row.searchable_text || "",
      })),
    [page.rows, rawMaps]
  );

  return {
    ...page,
    rows,
  };
}
