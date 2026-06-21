import { useCallback, useEffect, useRef, useState } from "react";

import { EMPLOYEE_DETAIL_CACHE_TTL_MS } from "../features/employees/config/employeeIntelligence";
import { supabase, supabaseEnabled } from "../lib/supabase";

const performanceCache = new Map();

function getCacheKey(employeeId, days) {
  return `${employeeId || "none"}:${days}`;
}

function normalizePerformance(data) {
  const summary = data?.summary || {};
  return {
    summary: {
      transactions: Number(summary.transactions || 0),
      revenue: Number(summary.revenue || 0),
      avgTransaction: Number(summary.avgTransaction || summary.averageTransaction || 0),
      refundCount: Number(summary.refundCount || summary.refund || 0),
      voidCount: Number(summary.voidCount || 0),
      activeHours: Number(summary.activeHours || 0),
      shiftCount: Number(summary.shiftCount || 0),
    },
    trend: Array.isArray(data?.trend) ? data.trend.slice(0, 7) : [],
    topProducts: Array.isArray(data?.topProducts)
      ? data.topProducts.slice(0, 5).map((item) => ({
          productName: item.productName || item.name || "Produk",
          qty: Number(item.qty || 0),
          revenue: Number(item.revenue || 0),
        }))
      : [],
  };
}

export function useEmployeePerformance(employeeId, enabled, options = {}) {
  const days = Math.max(1, Math.min(30, Number(options.days || 7)));
  const [data, setData] = useState(() => normalizePerformance(null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestVersionRef = useRef(0);

  const loadPerformance = useCallback(
    async ({ force = false } = {}) => {
      if (!enabled || !employeeId) return null;
      if (!supabaseEnabled) {
        setError("Aplikasi belum terhubung ke Supabase.");
        return null;
      }

      const cacheKey = getCacheKey(employeeId, days);
      const cached = performanceCache.get(cacheKey);
      if (!force && cached && Date.now() - cached.cachedAt < EMPLOYEE_DETAIL_CACHE_TTL_MS) {
        setData(cached.data);
        return cached.data;
      }

      const requestVersion = ++requestVersionRef.current;
      setLoading(true);
      setError("");

      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          "owner_get_employee_performance",
          {
            p_employee_id: employeeId,
            p_days: days,
          }
        );

        if (requestVersion !== requestVersionRef.current) return null;
        if (rpcError) throw rpcError;

        const normalized = normalizePerformance(rpcData || {});
        performanceCache.set(cacheKey, { data: normalized, cachedAt: Date.now() });
        setData(normalized);
        return normalized;
      } catch (err) {
        if (requestVersion === requestVersionRef.current) {
          setError(err.message || "Gagal memuat performa karyawan.");
        }
        return null;
      } finally {
        if (requestVersion === requestVersionRef.current) {
          setLoading(false);
        }
      }
    },
    [days, employeeId, enabled]
  );

  const refresh = useCallback(() => loadPerformance({ force: true }), [loadPerformance]);

  useEffect(() => {
    requestVersionRef.current += 1;
    setData(normalizePerformance(null));
    setError("");

    if (!enabled || !employeeId) {
      return () => {
        requestVersionRef.current += 1;
      };
    }

    void loadPerformance();
    return () => {
      requestVersionRef.current += 1;
    };
  }, [employeeId, enabled, loadPerformance]);

  return {
    data,
    loading,
    error,
    refresh,
  };
}
