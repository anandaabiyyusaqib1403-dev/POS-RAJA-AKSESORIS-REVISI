import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseEnabled } from "../lib/supabase";

const PAGE_QUERY_TIMEOUT_MS = 15000;

function withPageQueryTimeout(promise, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), PAGE_QUERY_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function applyFilter(query, filter) {
  if (!filter || filter.value === undefined || filter.value === null || filter.value === "") {
    return query;
  }

  if (filter.operator === "eq") return query.eq(filter.column, filter.value);
  if (filter.operator === "neq") return query.neq(filter.column, filter.value);
  if (filter.operator === "gte") return query.gte(filter.column, filter.value);
  if (filter.operator === "lte") return query.lte(filter.column, filter.value);
  if (filter.operator === "ilike") return query.ilike(filter.column, filter.value);
  if (filter.operator === "in") return query.in(filter.column, filter.value);
  if (filter.operator === "or") return query.or(filter.value);

  return query;
}

function toDateBoundaryIso(value, boundary) {
  if (!value) return null;

  const date = value instanceof Date
    ? new Date(value)
    : new Date(`${value}T${boundary === "end" ? "23:59:59.999" : "00:00:00"}`);

  if (!Number.isFinite(date.getTime())) return null;

  if (value instanceof Date) {
    if (boundary === "end") {
      date.setHours(23, 59, 59, 999);
    } else {
      date.setHours(0, 0, 0, 0);
    }
  }

  return date.toISOString();
}

export function createDateRangeFilters(column, range = {}) {
  const filters = [];

  const startValue = toDateBoundaryIso(range.startDate, "start");
  if (startValue) {
    filters.push({
      column,
      operator: "gte",
      value: startValue,
    });
  }

  const endValue = toDateBoundaryIso(range.endDate, "end");
  if (endValue) {
    filters.push({
      column,
      operator: "lte",
      value: endValue,
    });
  }
  return filters;
}

export function usePagedSupabaseRows({
  table,
  select = "*",
  filters = [],
  orderBy = "created_at",
  ascending = false,
  pageSize = 20,
  enabled = true,
}) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);
  const stableFilters = useMemo(() => JSON.parse(filterKey), [filterKey]);

  useEffect(() => {
    setPage(1);
  }, [filterKey, pageSize, table]);

  const refresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadRows() {
      if (!enabled || !supabaseEnabled || !table) {
        setRows([]);
        setCount(0);
        setError(null);
        setLoading(false);
        return;
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from(table)
          .select(select, { count: "exact" })
          .order(orderBy, { ascending })
          .range(from, to);

        stableFilters.forEach((filter) => {
          query = applyFilter(query, filter);
        });

        const { data, count: nextCount, error: queryError } = await withPageQueryTimeout(
          query,
          `Memuat ${table} terlalu lama.`
        );
        if (queryError) throw queryError;
        if (!alive) return;

        setRows(data || []);
        setCount(nextCount || 0);
      } catch (queryError) {
        if (!alive) return;
        setRows([]);
        setCount(0);
        setError(queryError);
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadRows();

    return () => {
      alive = false;
    };
  }, [
    ascending,
    enabled,
    filterKey,
    orderBy,
    page,
    pageSize,
    refreshKey,
    select,
    stableFilters,
    table,
  ]);

  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const from = count ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, count);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  return {
    rows,
    count,
    page,
    pageCount,
    pageSize,
    from,
    to,
    loading,
    error,
    setPage,
    refresh,
  };
}
