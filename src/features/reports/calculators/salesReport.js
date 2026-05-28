import { formatDateTime, parseDateInput } from "../../../utils/format";

export function getSalesReportRange(period, customRange) {
  const today = new Date();

  if (period === "all") return { startDate: null, endDate: null };
  if (period === "today") return { startDate: today, endDate: today };
  if (period === "7") {
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 6);
    return { startDate, endDate: today };
  }
  if (period === "30") {
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 29);
    return { startDate, endDate: today };
  }

  return {
    startDate: parseDateInput(customRange.startDate),
    endDate: parseDateInput(customRange.endDate),
  };
}

export function formatRangeLabel(range) {
  if (!range.startDate && !range.endDate) {
    return "Semua periode";
  }

  const startLabel = range.startDate
    ? formatDateTime(range.startDate, { dateStyle: "medium" })
    : "-";
  const endLabel = range.endDate ? formatDateTime(range.endDate, { dateStyle: "medium" }) : "-";

  return startLabel === endLabel ? startLabel : `${startLabel} s/d ${endLabel}`;
}

export function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

export function createEmptySalesReport() {
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

export function getMaxValue(rows, key) {
  return Math.max(1, ...rows.map((row) => Number(row[key] || 0)));
}

export function getProfitTone(value) {
  if (Number(value || 0) > 0) return "text-emerald-700";
  if (Number(value || 0) < 0) return "text-rose-600";
  return "text-slate-600";
}
