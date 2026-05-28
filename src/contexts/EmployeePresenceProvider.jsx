import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMPLOYEE_ACTIVITY_STATUS,
  EMPLOYEE_ACTIVITY_SYNC_THROTTLE_MS,
  EMPLOYEE_FOCUS_SYNC_THROTTLE_MS,
  getEmployeeRouteActivityStatus,
} from "../features/employees/config/employeeIntelligence";
import { supabase } from "../lib/supabase";
import { formatCashierName } from "../utils/cashier";
import { getDeviceSummary, getUserAgent } from "../utils/device";
import { useAuth } from "./useAuth";
import { EmployeePresenceContext } from "./employee-presence-context";

const SESSION_STORAGE_KEY = "pos_session_id";
const SESSION_HEARTBEAT_MS = 25000;
const LARGE_REFRESH_THROTTLE_MS = 30000;
const EMPLOYEE_ROSTER_SELECT = [
  "id",
  "nama",
  "email",
  "username",
  "phone",
  "role",
  "account_status",
  "pin_enabled",
  "base_salary",
  "default_bonus",
  "default_deduction",
  "last_login",
  "last_device",
  "created_at",
  "updated_at",
  "session_id",
  "session_status_raw",
  "session_status",
  "device_summary",
  "user_agent",
  "route",
  "session_started_at",
  "last_seen_at",
  "ended_at",
  "activity_status",
  "activity_updated_at",
  "revoked_at",
  "revoked_by",
  "revoke_reason",
  "active_shift_id",
  "active_shift_started_at",
  "shift_status",
  "today_transactions",
  "today_revenue",
  "today_items",
  "today_refund",
  "today_closing_difference",
].join(", ");

function getBrowserSessionId() {
  if (typeof window === "undefined") return "";
  const existingId = window.sessionStorage?.getItem(SESSION_STORAGE_KEY);
  if (existingId) return existingId;

  const nextId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.sessionStorage?.setItem(SESSION_STORAGE_KEY, nextId);
  return nextId;
}

function getCurrentRoute() {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search || ""}`;
}

function getCurrentActivityStatus(status = getVisibilityStatus()) {
  if (status !== "online") return EMPLOYEE_ACTIVITY_STATUS.IDLE;
  if (typeof window === "undefined") return EMPLOYEE_ACTIVITY_STATUS.IDLE;
  return getEmployeeRouteActivityStatus(window.location.pathname);
}

function getVisibilityStatus() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    return "idle";
  }
  return "online";
}

function isMissingRpcError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST202" ||
    error?.code === "42883" ||
    message.includes("could not find the function")
  );
}

function isOptionalResetTableError(error) {
  const code = String(error?.code || "");
  const message = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    ["42P01", "42703", "PGRST106", "PGRST205"].includes(code) ||
    message.includes("schema cache") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

function isPermissionDeniedForTable(error, tableNames = []) {
  const code = String(error?.code || "");
  const message = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    code === "42501" &&
    message.includes("permission denied") &&
    tableNames.some((tableName) => message.includes(tableName.toLowerCase()))
  );
}

function normalizeEmployeeRoster(row) {
  return {
    id: row.id,
    nama: row.nama || formatCashierName(row.id || row.email || row.role),
    email: row.email || "",
    username: row.username || "",
    phone: row.phone || "",
    role: row.role || "kasir",
    account_status: row.account_status || "active",
    pin_enabled: Boolean(row.pin_enabled),
    base_salary: Number(row.base_salary || 0),
    default_bonus: Number(row.default_bonus || 0),
    default_deduction: Number(row.default_deduction || 0),
    last_login: row.last_login || null,
    last_device: row.last_device || "",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    session_id: row.session_id || "",
    session_status_raw: row.session_status_raw || "",
    session_status: row.session_status || "offline",
    device_summary: row.device_summary || "",
    user_agent: row.user_agent || "",
    route: row.route || "",
    session_started_at: row.session_started_at || null,
    last_seen_at: row.last_seen_at || null,
    ended_at: row.ended_at || null,
    activity_status: row.activity_status || "",
    activity_updated_at: row.activity_updated_at || null,
    revoked_at: row.revoked_at || null,
    revoked_by: row.revoked_by || null,
    revoke_reason: row.revoke_reason || "",
    active_shift_id: row.active_shift_id || null,
    active_shift_started_at: row.active_shift_started_at || null,
    shift_status: row.shift_status || "no_shift",
    today_transactions: Number(row.today_transactions || 0),
    today_revenue: Number(row.today_revenue || 0),
    today_items: Number(row.today_items || 0),
    today_refund: Number(row.today_refund || 0),
    today_closing_difference: Number(row.today_closing_difference || 0),
  };
}

function deriveSessionStatus(sessionRow) {
  if (!sessionRow || sessionRow.revoked_at || sessionRow.ended_at) return "offline";

  const lastSeenAt = new Date(sessionRow.last_seen_at || 0).getTime();
  if (!Number.isFinite(lastSeenAt)) return sessionRow.status || "offline";

  const ageMs = Date.now() - lastSeenAt;
  if (ageMs <= 60000) return sessionRow.status === "idle" ? "idle" : "online";
  if (ageMs <= 300000) return "idle";
  return "offline";
}

function patchRosterPresence(rows, sessionRow) {
  if (!sessionRow?.user_id) return rows;

  let changed = false;
  const nextRows = rows.map((row) => {
    if (row.id !== sessionRow.user_id) return row;

    changed = true;
    return {
      ...row,
      session_id: sessionRow.session_id || row.session_id || "",
      session_status_raw: sessionRow.status || "",
      session_status: deriveSessionStatus(sessionRow),
      device_summary: sessionRow.device_summary || row.device_summary || "",
      user_agent: sessionRow.user_agent || row.user_agent || "",
      route: sessionRow.route || row.route || "",
      session_started_at: sessionRow.started_at || row.session_started_at || null,
      last_seen_at: sessionRow.last_seen_at || row.last_seen_at || null,
      ended_at: sessionRow.ended_at || null,
      activity_status: sessionRow.activity_status || row.activity_status || "",
      activity_updated_at: sessionRow.activity_updated_at || row.activity_updated_at || null,
      revoked_at: sessionRow.revoked_at || null,
      revoked_by: sessionRow.revoked_by || row.revoked_by || null,
      revoke_reason: sessionRow.revoke_reason || row.revoke_reason || "",
    };
  });

  return changed ? nextRows : rows;
}

export function EmployeePresenceProvider({ children }) {
  const { user, logout } = useAuth();
  const [employeeRoster, setEmployeeRoster] = useState([]);
  const refreshVersionRef = useRef(0);
  const employeeRosterRef = useRef([]);
  const lastLargeRefreshAtRef = useRef(0);
  const largeRefreshTimerRef = useRef(null);

  useEffect(() => {
    employeeRosterRef.current = employeeRoster;
  }, [employeeRoster]);

  const refreshEmployeeRoster = useCallback(async ({ force = false } = {}) => {
    if (user?.role !== "pemilik") {
      setEmployeeRoster([]);
      return [];
    }

    const now = Date.now();
    if (!force && now - lastLargeRefreshAtRef.current < LARGE_REFRESH_THROTTLE_MS) {
      return employeeRosterRef.current;
    }

    const requestVersion = ++refreshVersionRef.current;
    lastLargeRefreshAtRef.current = now;

    const result = await supabase
      .from("employee_roster_operational")
      .select(EMPLOYEE_ROSTER_SELECT)
      .order("nama", { ascending: true })
      .limit(500);

    if (requestVersion !== refreshVersionRef.current) return [];

    if (result.error) {
      if (
        isOptionalResetTableError(result.error) ||
        isPermissionDeniedForTable(result.error, ["employee_roster_operational"])
      ) {
        setEmployeeRoster([]);
        return [];
      }
      throw result.error;
    }

    const rows = (result.data || []).map(normalizeEmployeeRoster);
    setEmployeeRoster(rows);
    return rows;
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== "pemilik") {
      setEmployeeRoster([]);
      return undefined;
    }

    refreshEmployeeRoster({ force: true }).catch((error) => {
      console.warn("Gagal memuat roster karyawan:", error.message || error);
    });

    return undefined;
  }, [refreshEmployeeRoster, user?.role]);

  useEffect(() => {
    if (!user) return undefined;

    const sessionId = getBrowserSessionId();
    const userAgent = getUserAgent();
    const deviceSummary = getDeviceSummary(userAgent);
    let sessionRpcAvailable = true;
    let presenceChannel = null;

    let lastActivitySyncAt = 0;
    let lastQuickSyncAt = 0;
    let lastSentActivityStatus = "";

    const touchSession = async (status = getVisibilityStatus(), { forceActivity = false } = {}) => {
      if (!sessionRpcAvailable || !sessionId) return;

      const activityStatus = getCurrentActivityStatus(status);
      const now = Date.now();
      const shouldSendActivity =
        Boolean(activityStatus) &&
        (forceActivity ||
          activityStatus !== lastSentActivityStatus ||
          now - lastActivitySyncAt >= EMPLOYEE_ACTIVITY_SYNC_THROTTLE_MS);

      if (shouldSendActivity) {
        lastActivitySyncAt = now;
        lastSentActivityStatus = activityStatus;
      }

      const { data, error } = await supabase.rpc("touch_employee_session", {
        p_session_id: sessionId,
        p_device_summary: deviceSummary,
        p_user_agent: userAgent,
        p_route: getCurrentRoute(),
        p_status: status,
        p_metadata: {
          role: user.role || "",
          name: user.nama || "",
          ...(shouldSendActivity ? { activity_status: activityStatus } : {}),
        },
      });

      if (error) {
        if (isMissingRpcError(error)) {
          sessionRpcAvailable = false;
          return;
        }
        console.warn("Gagal memperbarui session karyawan:", error.message || error);
      }

      if (data?.revoked_at) {
        void logout();
      }
    };

    const trackPresence = async () => {
      if (!presenceChannel) return;
      await presenceChannel.track({
        user_id: user.id,
        name: user.nama || "",
        role: user.role || "",
        session_id: sessionId,
        status: getVisibilityStatus(),
        route: getCurrentRoute(),
        activity_status: getCurrentActivityStatus(),
        device: deviceSummary,
        last_seen_at: new Date().toISOString(),
      });
    };

    const syncSession = (options = {}) => {
      const reason = options.reason || "heartbeat";
      if (reason === "focus" || reason === "visibility") {
        const now = Date.now();
        if (now - lastQuickSyncAt < EMPLOYEE_FOCUS_SYNC_THROTTLE_MS) return;
        lastQuickSyncAt = now;
      }

      touchSession(getVisibilityStatus(), {
        forceActivity: reason === "focus" || reason === "visibility",
      });
      trackPresence();
    };

    presenceChannel = supabase.channel("employee-presence", {
      config: { presence: { key: sessionId || user.id } },
    });

    presenceChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        syncSession({ reason: "subscribe" });
      }
    });

    const heartbeatTimer = window.setInterval(() => syncSession({ reason: "heartbeat" }), SESSION_HEARTBEAT_MS);
    const handleFocus = () => syncSession({ reason: "focus" });
    const handleVisibilityChange = () => syncSession({ reason: "visibility" });
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(heartbeatTimer);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (sessionRpcAvailable && sessionId) {
        void supabase.rpc("end_employee_session", { p_session_id: sessionId });
      }
      if (presenceChannel) {
        void presenceChannel.untrack();
        void supabase.removeChannel(presenceChannel);
      }
    };
  }, [logout, user]);

  useEffect(() => {
    if (!user) return undefined;

    const queueLargeRefresh = () => {
      if (largeRefreshTimerRef.current) return;

      largeRefreshTimerRef.current = window.setTimeout(() => {
        largeRefreshTimerRef.current = null;
        refreshEmployeeRoster().catch((error) => {
          console.warn("Gagal refresh roster karyawan:", error.message || error);
        });
      }, LARGE_REFRESH_THROTTLE_MS);
    };

    const presenceSyncChannel = supabase
      .channel("employee-presence-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_sessions" },
        (payload) => {
          const sessionRow = payload.new || payload.old;
          if (
            payload.new?.revoked_at &&
            sessionRow?.user_id === user.id &&
            sessionRow?.session_id ===
              (typeof window !== "undefined"
                ? window.sessionStorage?.getItem(SESSION_STORAGE_KEY)
                : "")
          ) {
            void logout();
          }
          setEmployeeRoster((rows) => patchRosterPresence(rows, sessionRow));
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, queueLargeRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, queueLargeRefresh)
      .subscribe();

    return () => {
      if (largeRefreshTimerRef.current) {
        window.clearTimeout(largeRefreshTimerRef.current);
        largeRefreshTimerRef.current = null;
      }
      void supabase.removeChannel(presenceSyncChannel);
    };
  }, [logout, refreshEmployeeRoster, user]);

  const value = useMemo(
    () => ({
      employeeRoster,
      refreshEmployeeRoster,
    }),
    [employeeRoster, refreshEmployeeRoster]
  );

  return (
    <EmployeePresenceContext.Provider value={value}>
      {children}
    </EmployeePresenceContext.Provider>
  );
}
