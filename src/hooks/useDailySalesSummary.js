import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseEnabled } from "../lib/supabase";
import { formatDateInput } from "../utils/format";

const DAILY_SUMMARY_TIMEOUT_MS = 15000;

function withDailySummaryTimeout(promise, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), DAILY_SUMMARY_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function normalizeDateValue(value) {
  if (!value) return "";
  return typeof value === "string" ? value : formatDateInput(value);
}

export function useDailySalesSummary(range) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const startDate = normalizeDateValue(range?.startDate);
  const endDate = normalizeDateValue(range?.endDate);

  useEffect(() => {
    let alive = true;

    async function loadSummary() {
      if (!supabaseEnabled) {
        setRows([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        let query = supabase
          .from("daily_sales_summary")
          .select("tanggal, total_transactions, total_items, total_revenue, total_cost, total_profit")
          .order("tanggal", { ascending: true });

        if (startDate) query = query.gte("tanggal", startDate);
        if (endDate) query = query.lte("tanggal", endDate);

        const { data, error: queryError } = await withDailySummaryTimeout(
          query,
          "Memuat ringkasan harian terlalu lama."
        );
        if (queryError) throw queryError;
        if (alive) setRows(data || []);
      } catch (queryError) {
        if (alive) {
          setRows([]);
          setError(queryError);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadSummary();

    return () => {
      alive = false;
    };
  }, [endDate, startDate]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          transactions: acc.transactions + Number(row.total_transactions || 0),
          items: acc.items + Number(row.total_items || 0),
          revenue: acc.revenue + Number(row.total_revenue || 0),
          cost: acc.cost + Number(row.total_cost || 0),
          profit: acc.profit + Number(row.total_profit || 0),
        }),
        { transactions: 0, items: 0, revenue: 0, cost: 0, profit: 0 }
      ),
    [rows]
  );

  return {
    rows,
    totals,
    loading,
    error,
    available: rows.length > 0 && !error,
  };
}
