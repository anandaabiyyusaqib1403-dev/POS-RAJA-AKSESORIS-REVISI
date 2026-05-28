import { useCallback, useEffect, useRef, useState } from "react";

import {
  EMPLOYEE_ACTIVITY_PAGE_SIZE,
  clampEmployeeActivityLimit,
} from "../features/employees/config/employeeIntelligence";
import { supabase, supabaseEnabled } from "../lib/supabase";

const activityCache = new Map();
const ACTIVITY_WINDOW_DAYS = 30;

function getCacheKey(employeeId, limit) {
  return `${employeeId || "none"}:${limit}`;
}

function getCursor(rows) {
  const lastRow = rows[rows.length - 1];
  if (!lastRow) return null;
  return {
    createdAt: lastRow.created_at,
    id: lastRow.id,
  };
}

function normalizeActivity(row) {
  return {
    id: String(row.id || `${row.source || "activity"}-${row.created_at || Date.now()}`),
    created_at: row.created_at || new Date().toISOString(),
    action: row.action || "activity",
    title: row.title || "Aktivitas",
    detail: row.detail || "",
    tone: row.tone || "neutral",
    source: row.source || "audit",
    metadata: row.metadata || {},
  };
}

export function useEmployeeActivity(employeeId, enabled, options = {}) {
  const pageSize = clampEmployeeActivityLimit(options.pageSize || EMPLOYEE_ACTIVITY_PAGE_SIZE);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const requestVersionRef = useRef(0);

  const loadPage = useCallback(
    async ({ cursor = null, append = false } = {}) => {
      if (!enabled || !employeeId) return [];
      if (!supabaseEnabled) {
        setError("Aplikasi belum terhubung ke Supabase.");
        return [];
      }

      const requestVersion = ++requestVersionRef.current;
      setError("");
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const { data, error: rpcError } = await supabase.rpc("owner_get_employee_activity", {
          p_employee_id: employeeId,
          p_limit: pageSize,
          p_before_created_at: cursor?.createdAt || null,
          p_before_id: cursor?.id || null,
          p_days: ACTIVITY_WINDOW_DAYS,
        });

        if (requestVersion !== requestVersionRef.current) return [];
        if (rpcError) throw rpcError;

        const nextRows = (data || []).map(normalizeActivity);
        setRows((current) => {
          const merged = append ? [...current, ...nextRows] : nextRows;
          if (!append) {
            activityCache.set(getCacheKey(employeeId, pageSize), {
              rows: merged,
              hasMore: nextRows.length >= pageSize,
              cachedAt: Date.now(),
            });
          }
          return merged;
        });
        setHasMore(nextRows.length >= pageSize);
        return nextRows;
      } catch (err) {
        if (requestVersion === requestVersionRef.current) {
          setError(err.message || "Gagal memuat aktivitas karyawan.");
        }
        return [];
      } finally {
        if (requestVersion === requestVersionRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [employeeId, enabled, pageSize]
  );

  const refresh = useCallback(() => loadPage({ append: false }), [loadPage]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return Promise.resolve([]);
    return loadPage({ cursor: getCursor(rows), append: true });
  }, [hasMore, loadPage, loading, loadingMore, rows]);

  useEffect(() => {
    requestVersionRef.current += 1;
    setRows([]);
    setError("");
    setHasMore(false);

    if (!enabled || !employeeId) {
      return () => {
        requestVersionRef.current += 1;
      };
    }

    const cached = activityCache.get(getCacheKey(employeeId, pageSize));
    if (cached?.rows?.length) {
      setRows(cached.rows);
      setHasMore(Boolean(cached.hasMore));
      return () => {
        requestVersionRef.current += 1;
      };
    }

    void loadPage({ append: false });
    return () => {
      requestVersionRef.current += 1;
    };
  }, [employeeId, enabled, loadPage, pageSize]);

  return {
    rows,
    loading,
    loadingMore,
    error,
    hasMore,
    refresh,
    loadMore,
    pageSize,
  };
}
