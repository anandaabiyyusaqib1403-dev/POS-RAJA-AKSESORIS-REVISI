type QueuedEvent = Record<string, any> & {
  trace_id: string;
  retry_count?: number;
};

type SendBatch = (events: QueuedEvent[]) => Promise<unknown>;

function createDedupeKey(event: QueuedEvent) {
  return JSON.stringify({
    event_type: event.event_type,
    severity: event.severity,
    source: event.source,
    source_id: event.source_id || null,
    details: event.details || {},
  });
}

export function createEventQueue({
  sendBatch,
  flushMs = 1200,
  maxBatchSize = 20,
  maxRetries = 2,
  dedupeWindowMs = 10000,
}: {
  sendBatch: SendBatch;
  flushMs?: number;
  maxBatchSize?: number;
  maxRetries?: number;
  dedupeWindowMs?: number;
}) {
  let queue: QueuedEvent[] = [];
  let flushTimer: number | null = null;
  let isFlushing = false;
  const dedupeMap = new Map<string, number>();

  function pruneDedupe(now = Date.now()) {
    dedupeMap.forEach((expiresAt, key) => {
      if (expiresAt <= now) {
        dedupeMap.delete(key);
      }
    });
  }

  function scheduleFlush() {
    if (flushTimer !== null || typeof window === "undefined") return;
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      void flush();
    }, flushMs);
  }

  function enqueue(event: QueuedEvent) {
    const now = Date.now();
    pruneDedupe(now);

    const dedupeKey = createDedupeKey(event);
    if (dedupeMap.has(dedupeKey)) {
      return false;
    }

    dedupeMap.set(dedupeKey, now + dedupeWindowMs);
    queue.push(event);

    if (queue.length >= maxBatchSize) {
      void flush();
    } else {
      scheduleFlush();
    }

    return true;
  }

  async function flush() {
    if (isFlushing || !queue.length) return;
    isFlushing = true;

    const batch = queue.splice(0, maxBatchSize);
    try {
      await sendBatch(batch);
    } catch (error) {
      const retryable = batch
        .map((event) => ({
          ...event,
          retry_count: Number(event.retry_count || 0) + 1,
        }))
        .filter((event) => event.retry_count <= maxRetries);
      queue = [...retryable, ...queue];
      if (retryable.length) {
        scheduleFlush();
      }
      console.warn("Telemetry batch failed:", error);
    } finally {
      isFlushing = false;
      if (queue.length) {
        scheduleFlush();
      }
    }
  }

  return {
    enqueue,
    flush,
    size: () => queue.length,
  };
}
