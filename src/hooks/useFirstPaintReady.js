import { useEffect, useState } from "react";

export function useFirstPaintReady(delayMs = 400) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      setReady(true);
      return undefined;
    }

    let timeoutId;
    let idleId;

    timeoutId = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(() => setReady(true), { timeout: 1500 });
        return;
      }

      setReady(true);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
      if (idleId && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [delayMs]);

  return ready;
}
