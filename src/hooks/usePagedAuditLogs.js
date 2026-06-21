import { useMemo } from "react";
import {
  createDateRangeFilters,
  usePagedSupabaseRows,
} from "./usePagedSupabaseRows";

const AUDIT_LOG_SELECT = [
  "id",
  "actor_id",
  "actor_role",
  "action",
  "target_table",
  "target_id",
  "before_value",
  "after_value",
  "reason",
  "device_info",
  "session_id",
  "incident_code",
  "created_at",
].join(", ");

export function usePagedAuditLogs({ search, dateRange, pageSize = 20 }) {
  const filters = useMemo(() => {
    const nextFilters = createDateRangeFilters("created_at", dateRange);
    const keyword = String(search || "").trim();

    if (keyword) {
      const pattern = `%${keyword.replaceAll(",", " ")}%`;
      nextFilters.push({
        operator: "or",
        value: [
          `action.ilike.${pattern}`,
          `target_table.ilike.${pattern}`,
          `actor_role.ilike.${pattern}`,
          `reason.ilike.${pattern}`,
          `incident_code.ilike.${pattern}`,
        ].join(","),
      });
    }

    return nextFilters;
  }, [dateRange, search]);

  return usePagedSupabaseRows({
    table: "audit_logs",
    select: AUDIT_LOG_SELECT,
    filters,
    pageSize,
    orderBy: "created_at",
    ascending: false,
  });
}
