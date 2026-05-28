type RefreshFn = () => Promise<unknown> | unknown;
type TimeoutWrapper = <T>(promise: Promise<T>, message: string) => Promise<T>;

export function createRealtimeRefreshGuard({
  withTimeout,
}: {
  withTimeout: TimeoutWrapper;
}) {
  const inFlight: Record<string, boolean> = {};
  const needsRerun: Record<string, boolean> = {};

  async function run(key: string, refreshFn: RefreshFn) {
    if (inFlight[key]) {
      needsRerun[key] = true;
      return;
    }

    inFlight[key] = true;
    needsRerun[key] = false;

    try {
      await withTimeout(
        Promise.resolve().then(refreshFn),
        `Realtime refresh ${key} terlalu lama.`
      );
    } finally {
      inFlight[key] = false;
      if (needsRerun[key]) {
        needsRerun[key] = false;
        await run(key, refreshFn);
      }
    }
  }

  return {
    run,
    isInFlight: (key: string) => Boolean(inFlight[key]),
    reset: () => {
      Object.keys(inFlight).forEach((key) => {
        inFlight[key] = false;
      });
      Object.keys(needsRerun).forEach((key) => {
        needsRerun[key] = false;
      });
    },
  };
}
