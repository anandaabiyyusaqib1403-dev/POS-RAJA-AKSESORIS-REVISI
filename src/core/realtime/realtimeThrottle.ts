export const DEFAULT_REALTIME_REFRESH_DELAY_MS = 650;
export const LARGE_REALTIME_REFRESH_THROTTLE_MS = 15000;

export function getThrottleDelay({
  lastRefreshAt = 0,
  minIntervalMs = 0,
  delayMs = DEFAULT_REALTIME_REFRESH_DELAY_MS,
  now = Date.now(),
} = {}) {
  const elapsedMs = now - lastRefreshAt;
  const throttleWaitMs = minIntervalMs ? Math.max(0, minIntervalMs - elapsedMs) : 0;
  return Math.max(delayMs, throttleWaitMs);
}
