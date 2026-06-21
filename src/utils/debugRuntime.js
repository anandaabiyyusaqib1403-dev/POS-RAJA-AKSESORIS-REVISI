// Lightweight runtime diagnostics.
// Avoid logging in render paths; only emit on transitions/events.

export const DEBUG_RUNTIME_DEFAULTS = {
  // Enable via URL: ?debugRuntime=1
  runtime: false,
  realtime: false,
  requests: false,
};

function getSearchParam(name) {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

function parseBool(val, fallback) {
  if (val === null || val === undefined) return fallback;
  const normalized = String(val).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function getDebugRuntimeFlags() {
  if (typeof window === "undefined") {
    return { ...DEBUG_RUNTIME_DEFAULTS };
  }

  const runtime = parseBool(getSearchParam("debugRuntime"), DEBUG_RUNTIME_DEFAULTS.runtime);
  const realtime = parseBool(getSearchParam("debugRealtime"), DEBUG_RUNTIME_DEFAULTS.realtime);
  const requests = parseBool(getSearchParam("debugRequests"), DEBUG_RUNTIME_DEFAULTS.requests);

  return { runtime, realtime, requests };
}

function nowTs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

export function debugLog(scope, message, meta) {
  const { runtime } = getDebugRuntimeFlags();
  if (!runtime) return;

  // Keep meta tiny: never stringify giant arrays/objects.
  const payload = meta && typeof meta === "object" ? {
    ...meta,
  } : undefined;

  // One-line logs only.
  if (payload) {
    console.log(`[runtime:${scope}] ${message}`, payload);
  } else {
    console.log(`[runtime:${scope}] ${message}`);
  }
}

export function debugRealtimeLog(scope, message, meta) {
  const { realtime } = getDebugRuntimeFlags();
  if (!realtime) return;

  const payload = meta && typeof meta === "object" ? { ...meta } : undefined;

  if (payload) {
    console.log(`[realtime:${scope}] ${message}`, payload);
  } else {
    console.log(`[realtime:${scope}] ${message}`);
  }
}

export function debugRequestLog(scope, message, meta) {
  const { requests } = getDebugRuntimeFlags();
  if (!requests) return;

  const payload = meta && typeof meta === "object" ? { ...meta } : undefined;

  if (payload) {
    console.log(`[requests:${scope}] ${message}`, payload);
  } else {
    console.log(`[requests:${scope}] ${message}`);
  }
}

export function instrumentRequestStart(label, extra) {
  const { requests } = getDebugRuntimeFlags();
  if (!requests) return null;
  return { label, startedAt: nowTs(), extra };
}

export function instrumentRequestEnd(ctx, ok, err) {
  if (!ctx) return;
  const elapsedMs = nowTs() - ctx.startedAt;
  const meta = {
    label: ctx.label,
    elapsedMs,
    ok: Boolean(ok),
    ...(ctx.extra && typeof ctx.extra === "object" ? ctx.extra : null),
  };
  if (ok) {
    debugRequestLog("end", "success", meta);
  } else {
    debugRequestLog("end", "failed", {
      ...meta,
      error: err?.message ? String(err.message).slice(0, 160) : String(err || "error").slice(0, 160),
    });
  }
}

