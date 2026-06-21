import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseEnabled } from "../lib/supabase";

export function useAuditStorageSummary(enabled = true) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled) return [];
    if (!supabaseEnabled) {
      setError("Aplikasi belum terhubung ke Supabase.");
      return [];
    }

    setLoading(true);
    setError("");

    try {
      const { data, error: rpcError } = await supabase.rpc("owner_get_audit_storage_summary");
      if (rpcError) throw rpcError;
      const nextRows = Array.isArray(data) ? data : [];
      setRows(nextRows);
      return nextRows;
    } catch (err) {
      setError(err.message || "Monitoring kapasitas audit belum dapat dimuat.");
      return [];
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      setError("");
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  return {
    rows,
    loading,
    error,
    refresh,
  };
}
