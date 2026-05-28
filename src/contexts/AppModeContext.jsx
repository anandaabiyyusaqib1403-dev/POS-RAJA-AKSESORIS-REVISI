import {
  createContext,
  useContext,
  useEffect,
  useMemo,
} from "react";

const AppModeContext = createContext(null);
const LEGACY_STORAGE_PREFIX = "raja-";
const LEGACY_STORAGE_KEYS = new Set(["pos_mode"]);

export function AppModeProvider({ children }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      Object.keys(window.localStorage || {}).forEach((key) => {
        if (key.startsWith(LEGACY_STORAGE_PREFIX) || LEGACY_STORAGE_KEYS.has(key)) {
          window.localStorage.removeItem(key);
        }
      });
    } catch {
      // Storage may be unavailable in hardened browser modes; the app can still continue.
    }
  }, []);

  const value = useMemo(
    () => ({
      mode: "real",
      isRealMode: true,
    }),
    []
  );

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
}

export function useAppMode() {
  const context = useContext(AppModeContext);
  if (!context) throw new Error("useAppMode harus dipakai di dalam AppModeProvider.");
  return context;
}
