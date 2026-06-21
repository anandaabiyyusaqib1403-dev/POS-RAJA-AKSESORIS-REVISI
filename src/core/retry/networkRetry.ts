export function isNetworkError(error: unknown) {
  const message = String((error as Error)?.message || error || "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timed out") ||
    message.includes("timeout")
  );
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function withRetry<T>(operation: () => Promise<T>, retries = 2) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isNetworkError(error)) {
        throw error;
      }
      await wait(400 * (attempt + 1));
    }
  }

  throw lastError;
}
