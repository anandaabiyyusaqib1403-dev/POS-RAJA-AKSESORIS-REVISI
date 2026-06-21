import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  EMPLOYEE_PERMISSION_GROUPS,
  flattenEmployeePermissionKeys,
} from "../features/employees/config/employeeIntelligence";
import { supabase, supabaseEnabled } from "../lib/supabase";

const permissionKeys = flattenEmployeePermissionKeys();

function normalizePermissionRows(rows = []) {
  const byKey = new Map(rows.map((row) => [row.permission_key, row]));

  return permissionKeys.map((key) => {
    const row = byKey.get(key) || {};
    return {
      permission_key: key,
      allowed: Boolean(row.allowed),
      updated_at: row.updated_at || null,
      updated_by: row.updated_by || null,
    };
  });
}

export function useEmployeePermissions(employeeId, enabled) {
  const [rows, setRows] = useState(() => normalizePermissionRows());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const requestVersionRef = useRef(0);

  const loadPermissions = useCallback(async () => {
    if (!enabled || !employeeId) return [];
    if (!supabaseEnabled) {
      setLoaded(false);
      setError("Aplikasi belum terhubung ke Supabase.");
      return [];
    }

    const requestVersion = ++requestVersionRef.current;
    setLoading(true);
    setLoaded(false);
    setError("");

    try {
      const { data, error: rpcError } = await supabase.rpc("owner_get_employee_permissions", {
        p_employee_id: employeeId,
      });

      if (requestVersion !== requestVersionRef.current) return [];
      if (rpcError) throw rpcError;

      const normalized = normalizePermissionRows(data || []);
      setRows(normalized);
      setLoaded(true);
      return normalized;
    } catch (err) {
      if (requestVersion === requestVersionRef.current) {
        setLoaded(false);
        setError(err.message || "Gagal memuat akses karyawan.");
      }
      return [];
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setLoading(false);
      }
    }
  }, [employeeId, enabled]);

  const permissions = useMemo(() => {
    const next = {};
    rows.forEach((row) => {
      next[row.permission_key] = Boolean(row.allowed);
    });
    return next;
  }, [rows]);

  const groups = useMemo(
    () =>
      EMPLOYEE_PERMISSION_GROUPS.map((group) => ({
        ...group,
        permissions: group.permissions.map((permission) => ({
          ...permission,
          allowed: Boolean(permissions[permission.key]),
        })),
      })),
    [permissions]
  );

  useEffect(() => {
    requestVersionRef.current += 1;
    setRows(normalizePermissionRows());
    setLoaded(false);
    setError("");

    if (!enabled || !employeeId) {
      return () => {
        requestVersionRef.current += 1;
      };
    }

    void loadPermissions();
    return () => {
      requestVersionRef.current += 1;
    };
  }, [employeeId, enabled, loadPermissions]);

  return {
    rows,
    groups,
    permissions,
    loading,
    loaded,
    error,
    refresh: loadPermissions,
  };
}
