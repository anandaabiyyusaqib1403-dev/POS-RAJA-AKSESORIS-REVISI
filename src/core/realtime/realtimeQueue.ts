type RefreshFn = () => Promise<unknown> | unknown;

export function createRealtimeRefreshQueue({
  runRefresh,
  onError,
}: {
  runRefresh: (key: string, refreshFn: RefreshFn) => Promise<unknown>;
  onError?: (key: string, error: unknown) => void;
}) {
  const refreshTimers: Record<string, number> = {};
  const lastRefreshAt: Record<string, number> = {};

  function queueRefresh(
    key: string,
    refreshFn: RefreshFn,
    { delayMs = 650, minIntervalMs = 0 } = {}
  ) {
    window.clearTimeout(refreshTimers[key]);
    const elapsedMs = Date.now() - (lastRefreshAt[key] || 0);
    const throttleWaitMs = minIntervalMs ? Math.max(0, minIntervalMs - elapsedMs) : 0;

    refreshTimers[key] = window.setTimeout(() => {
      lastRefreshAt[key] = Date.now();
      runRefresh(key, refreshFn).catch((error) => {
        onError?.(key, error);
      });
    }, Math.max(delayMs, throttleWaitMs));
  }

  function dispose() {
    Object.values(refreshTimers).forEach((timer) => window.clearTimeout(timer));
  }

  return {
    queueRefresh,
    dispose,
  };
}
