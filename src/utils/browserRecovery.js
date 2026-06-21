const STORAGE_KEEP_KEYS = new Set([
  "raja_pos_receipt_printer_settings",
  "raja_pos_last_auth_user",
]);

function isAuthStorageKey(key) {
  return (
    key === "raja_pos_last_auth_user" ||
    key.startsWith("sb-") ||
    key.includes("supabase") ||
    key.includes("auth-token")
  );
}

function shouldKeepStorageKey(key, preserveAuth) {
  if (STORAGE_KEEP_KEYS.has(key)) {
    return preserveAuth || key !== "raja_pos_last_auth_user";
  }

  return preserveAuth && isAuthStorageKey(key);
}

function cleanStorage(storage, { preserveAuth }) {
  Object.keys(storage || {}).forEach((key) => {
    if (!shouldKeepStorageKey(key, preserveAuth)) {
      storage.removeItem(key);
    }
  });
}

export function resetBrowserAppState({ preserveAuth = true } = {}) {
  if (typeof window === "undefined") return;

  try {
    cleanStorage(window.localStorage, { preserveAuth });
  } catch {
    // Continue with session cleanup and reload.
  }

  try {
    cleanStorage(window.sessionStorage, { preserveAuth });
  } catch {
    // Reloading is still the best recovery path.
  }

  if (import.meta.env.DEV) {
    console.info("Browser recovery cleanup", { preserveAuth });
  }
}

export function resetBrowserAppStateAndReload(options = {}) {
  const preserveAuth = options.preserveAuth !== false;
  resetBrowserAppState({ preserveAuth });
  const url = new URL(window.location.href);
  url.searchParams.set("reset", preserveAuth ? String(Date.now()) : "hard");
  window.location.replace(url.toString());
}
