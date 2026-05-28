import {
  recordTelemetryEvent,
  recordTelemetryEventSoon,
} from "../core/observability/telemetry";

export async function recordOperationalEvent(event = {}) {
  return recordTelemetryEvent(event);
}

export function recordOperationalEventSoon(event) {
  recordTelemetryEventSoon(event);
}
