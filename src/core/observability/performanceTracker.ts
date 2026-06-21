import { recordTelemetryEventSoon } from "./telemetry";

export function startPerformanceTrace(name: string, details: Record<string, any> = {}) {
  const startedAt = performance.now();

  return {
    end(extraDetails: Record<string, any> = {}) {
      recordTelemetryEventSoon({
        eventType: "performance_trace",
        severity: "info",
        source: "frontend_performance",
        details: {
          name,
          duration_ms: Math.round(performance.now() - startedAt),
          ...details,
          ...extraDetails,
        },
      });
    },
  };
}
