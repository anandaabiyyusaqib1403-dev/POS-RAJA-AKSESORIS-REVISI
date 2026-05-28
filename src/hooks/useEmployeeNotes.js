import { useCallback, useEffect, useRef, useState } from "react";

import { supabase, supabaseEnabled } from "../lib/supabase";

function normalizeNote(row) {
  return {
    id: row.id,
    employee_id: row.employee_id,
    note_type: row.note_type || "note",
    note: row.note || "",
    created_by: row.created_by || null,
    created_at: row.created_at || null,
  };
}

export function useEmployeeNotes(employeeId, enabled) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestVersionRef = useRef(0);

  const loadNotes = useCallback(async () => {
    if (!enabled || !employeeId) return [];
    if (!supabaseEnabled) {
      setError("Aplikasi belum terhubung ke Supabase.");
      return [];
    }

    const requestVersion = ++requestVersionRef.current;
    setLoading(true);
    setError("");

    try {
      const { data, error: queryError } = await supabase
        .from("employee_notes")
        .select("id, employee_id, note_type, note, created_by, created_at")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (requestVersion !== requestVersionRef.current) return [];
      if (queryError) throw queryError;

      const normalized = (data || []).map(normalizeNote);
      setNotes(normalized);
      return normalized;
    } catch (err) {
      if (requestVersion === requestVersionRef.current) {
        setError(err.message || "Gagal memuat catatan karyawan.");
      }
      return [];
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setLoading(false);
      }
    }
  }, [employeeId, enabled]);

  useEffect(() => {
    requestVersionRef.current += 1;
    setNotes([]);
    setError("");

    if (!enabled || !employeeId) {
      return () => {
        requestVersionRef.current += 1;
      };
    }

    void loadNotes();
    return () => {
      requestVersionRef.current += 1;
    };
  }, [employeeId, enabled, loadNotes]);

  return {
    notes,
    loading,
    error,
    refresh: loadNotes,
  };
}
