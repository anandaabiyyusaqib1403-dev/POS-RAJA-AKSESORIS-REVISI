const DEFAULT_RETENTION_MS = 8 * 60 * 60 * 1000;

function normalizeIntentValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeIntentValue);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) {
          result[key] = normalizeIntentValue(value[key]);
        }
        return result;
      }, {});
  }

  return value;
}

export function serializeMoneyIntent(intent) {
  return JSON.stringify(normalizeIntentValue(intent || {}));
}

export function createMoneyRequestKeyStore({
  createId = () => globalThis.crypto.randomUUID(),
  now = () => Date.now(),
  retentionMs = DEFAULT_RETENTION_MS,
} = {}) {
  const requests = new Map();

  function removeExpired() {
    const cutoff = now() - retentionMs;
    requests.forEach((entry, key) => {
      if (entry.createdAt < cutoff) {
        requests.delete(key);
      }
    });
  }

  function getKey(operationType, intent) {
    return `${operationType}:${serializeMoneyIntent(intent)}`;
  }

  function reserve(operationType, intent) {
    removeExpired();
    const key = getKey(operationType, intent);
    const existing = requests.get(key);

    if (existing) {
      return existing.requestId;
    }

    const requestId = createId();
    requests.set(key, { requestId, createdAt: now() });
    return requestId;
  }

  function complete(operationType, intent, requestId) {
    const key = getKey(operationType, intent);
    const existing = requests.get(key);

    if (existing?.requestId === requestId) {
      requests.delete(key);
    }
  }

  return {
    reserve,
    complete,
  };
}
