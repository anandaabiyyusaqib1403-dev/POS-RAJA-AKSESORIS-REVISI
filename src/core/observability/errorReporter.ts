import { recordTelemetryEventSoon } from "./telemetry";

export function reportError(error: unknown, context: Record<string, any> = {}) {
  const normalizedError = error instanceof Error ? error : new Error(String(error));

  recordTelemetryEventSoon({
    eventType: context.eventType || "frontend_error",
    severity: context.severity || "critical",
    source: context.source || "frontend",
    sourceId: context.sourceId || null,
    details: {
      message: normalizedError.message,
      stack: normalizedError.stack || "",
      ...context.details,
    },
  });
}
