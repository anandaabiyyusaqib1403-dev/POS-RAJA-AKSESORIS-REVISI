import { supabase } from "../../lib/supabase";
import { createEventQueue } from "./eventQueue";

const EVENT_SEVERITIES = new Set(["info", "warning", "critical"]);
const SESSION_STORAGE_KEY = "pos_session_id";

function normalizeSeverity(value: unknown) {
  return EVENT_SEVERITIES.has(String(value)) ? String(value) : "info";
}

function createId() {
  return crypto.randomUUID();
}

export function getTelemetrySessionId() {
  if (typeof window === "undefined") return "";

  try {
    const current = window.sessionStorage?.getItem(SESSION_STORAGE_KEY);
    if (current) return current;

    const next = createId();
    window.sessionStorage?.setItem(SESSION_STORAGE_KEY, next);
    return next;
  } catch (_error) {
    return "";
  }
}

export function createTraceId(prefix = "trace") {
  return `${prefix}_${createId()}`;
}

function normalizeTelemetryEvent({
  eventType,
  severity = "info",
  source = "frontend",
  sourceId = null,
  details = {},
}: Record<string, any> = {}) {
  const type = String(eventType || "").trim();
  if (!type) return null;

  const traceId = createTraceId(type.replace(/[^a-z0-9_]/gi, "_").toLowerCase());
  const sessionId = getTelemetrySessionId();

  return {
    event_type: type,
    severity: normalizeSeverity(severity),
    source: String(source || "frontend"),
    source_id: sourceId || null,
    trace_id: traceId,
    session_id: sessionId,
    details: {
      trace_id: traceId,
      session_id: sessionId,
      ...(details && typeof details === "object" ? details : { value: details }),
    },
  };
}

const telemetryQueue = createEventQueue({
  sendBatch: async (events) => {
    const payload = events.map(({ retry_count: _retryCount, ...event }) => event);
    const { error } = await supabase.from("operational_events").insert(payload);

    if (error) {
      if (["42P01", "PGRST205", "PGRST204"].includes(String(error.code || ""))) {
        return;
      }
      throw error;
    }
  },
});

export async function recordTelemetryEvent(event: Record<string, any> = {}) {
  const normalized = normalizeTelemetryEvent(event);
  if (!normalized) return null;
  telemetryQueue.enqueue(normalized);
  return normalized.trace_id;
}

export function recordTelemetryEventSoon(event: Record<string, any> = {}) {
  void recordTelemetryEvent(event);
}

export function flushTelemetryEvents() {
  return telemetryQueue.flush();
}
