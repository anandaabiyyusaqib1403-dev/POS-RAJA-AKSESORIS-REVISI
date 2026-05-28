export const DEFAULT_RUNTIME_FLAGS = Object.freeze({
  allowUnstableRuntime: true,
  safeMode: false,
  disablePresence: false,
  disableRealtime: false,
  disableReports: false,
  disableAnalytics: false,
  backgroundPreload: true,
  enableAnalytics: true,
  enableAudit: true,
  enableCash: true,
  enableCashier: true,
  enableDigital: true,
  enableEmployees: true,
  enableHistory: true,
  enablePresence: true,
  enableProducts: true,
  enableRealtime: true,
  enableReports: true,
  enableReturns: true,
  enableServiceProducts: true,
  enableShift: true,
  enableStockOpname: true,
  enableWallet: true,
  minimalDashboard: false,
  minimalDataProvider: false,
  minimalProducts: false,
});

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

const SAFE_MODE_FEATURES = Object.freeze({
  reports: false,
  analytics: false,
  realtime: false,
  presence: false,
  audit: false,
  cash: true,
  cashier: true,
  digital: true,
  employees: false,
  history: true,
  products: true,
  returns: false,
  serviceProducts: true,
  shift: true,
  stockOpname: false,
  wallet: true,
});

const FEATURE_CONFIG = Object.freeze({
  reports: { enableKey: "enableReports", disableKey: "disableReports" },
  analytics: { enableKey: "enableAnalytics", disableKey: "disableAnalytics", unstable: true },
  realtime: { enableKey: "enableRealtime", disableKey: "disableRealtime", unstable: true },
  presence: { enableKey: "enablePresence", disableKey: "disablePresence", unstable: true },
  audit: { enableKey: "enableAudit" },
  cash: { enableKey: "enableCash" },
  cashier: { enableKey: "enableCashier" },
  digital: { enableKey: "enableDigital" },
  employees: { enableKey: "enableEmployees" },
  history: { enableKey: "enableHistory" },
  products: { enableKey: "enableProducts" },
  returns: { enableKey: "enableReturns" },
  serviceProducts: { enableKey: "enableServiceProducts" },
  shift: { enableKey: "enableShift" },
  stockOpname: { enableKey: "enableStockOpname" },
  wallet: { enableKey: "enableWallet" },
});

function parseBoolean(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;

  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;

  return fallback;
}

function getSearchParam(name) {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

function getEnvValue(envName) {
  return import.meta.env?.[envName];
}

function getFlag(name, envName, fallback) {
  const queryValue = getSearchParam(name);
  if (queryValue !== null) {
    return parseBoolean(queryValue, fallback);
  }

  return parseBoolean(getEnvValue(envName), fallback);
}

function readRuntimeFlags() {
  const allowUnstableRuntime = getFlag(
    "allowUnstableRuntime",
    "VITE_ALLOW_UNSTABLE_RUNTIME",
    DEFAULT_RUNTIME_FLAGS.allowUnstableRuntime
  );

  return {
    allowUnstableRuntime,
    safeMode: getFlag("safeMode", "VITE_SAFE_MODE", DEFAULT_RUNTIME_FLAGS.safeMode),
    disablePresence: getFlag(
      "disablePresence",
      "VITE_DISABLE_PRESENCE",
      DEFAULT_RUNTIME_FLAGS.disablePresence
    ),
    disableRealtime: getFlag(
      "disableRealtime",
      "VITE_DISABLE_REALTIME",
      DEFAULT_RUNTIME_FLAGS.disableRealtime
    ),
    disableReports: getFlag(
      "disableReports",
      "VITE_DISABLE_REPORTS",
      DEFAULT_RUNTIME_FLAGS.disableReports
    ),
    disableAnalytics: getFlag(
      "disableAnalytics",
      "VITE_DISABLE_ANALYTICS",
      DEFAULT_RUNTIME_FLAGS.disableAnalytics
    ),
    backgroundPreload: getFlag(
      "backgroundPreload",
      "VITE_BACKGROUND_PRELOAD",
      DEFAULT_RUNTIME_FLAGS.backgroundPreload
    ),
    enableAnalytics: getFlag(
      "enableAnalytics",
      "VITE_ENABLE_ANALYTICS",
      DEFAULT_RUNTIME_FLAGS.enableAnalytics
    ),
    enableAudit: getFlag("enableAudit", "VITE_ENABLE_AUDIT", DEFAULT_RUNTIME_FLAGS.enableAudit),
    enableCash: getFlag("enableCash", "VITE_ENABLE_CASH", DEFAULT_RUNTIME_FLAGS.enableCash),
    enableCashier: getFlag(
      "enableCashier",
      "VITE_ENABLE_CASHIER",
      DEFAULT_RUNTIME_FLAGS.enableCashier
    ),
    enableDigital: getFlag(
      "enableDigital",
      "VITE_ENABLE_DIGITAL",
      DEFAULT_RUNTIME_FLAGS.enableDigital
    ),
    enableEmployees: getFlag(
      "enableEmployees",
      "VITE_ENABLE_EMPLOYEES",
      DEFAULT_RUNTIME_FLAGS.enableEmployees
    ),
    enableHistory: getFlag(
      "enableHistory",
      "VITE_ENABLE_HISTORY",
      DEFAULT_RUNTIME_FLAGS.enableHistory
    ),
    enablePresence: getFlag(
      "enablePresence",
      "VITE_ENABLE_PRESENCE",
      DEFAULT_RUNTIME_FLAGS.enablePresence
    ),
    enableProducts: getFlag(
      "enableProducts",
      "VITE_ENABLE_PRODUCTS",
      DEFAULT_RUNTIME_FLAGS.enableProducts
    ),
    enableRealtime: getFlag(
      "enableRealtime",
      "VITE_ENABLE_REALTIME",
      DEFAULT_RUNTIME_FLAGS.enableRealtime
    ),
    enableReports: getFlag(
      "enableReports",
      "VITE_ENABLE_REPORTS",
      DEFAULT_RUNTIME_FLAGS.enableReports
    ),
    enableReturns: getFlag(
      "enableReturns",
      "VITE_ENABLE_RETURNS",
      DEFAULT_RUNTIME_FLAGS.enableReturns
    ),
    enableServiceProducts: getFlag(
      "enableServiceProducts",
      "VITE_ENABLE_SERVICE_PRODUCTS",
      DEFAULT_RUNTIME_FLAGS.enableServiceProducts
    ),
    enableShift: getFlag("enableShift", "VITE_ENABLE_SHIFT", DEFAULT_RUNTIME_FLAGS.enableShift),
    enableStockOpname: getFlag(
      "enableStockOpname",
      "VITE_ENABLE_STOCK_OPNAME",
      DEFAULT_RUNTIME_FLAGS.enableStockOpname
    ),
    enableWallet: getFlag("enableWallet", "VITE_ENABLE_WALLET", DEFAULT_RUNTIME_FLAGS.enableWallet),
    minimalDashboard: getFlag(
      "minimalDashboard",
      "VITE_MINIMAL_DASHBOARD",
      DEFAULT_RUNTIME_FLAGS.minimalDashboard
    ),
    minimalDataProvider: getFlag(
      "minimalData",
      "VITE_MINIMAL_DATA_PROVIDER",
      DEFAULT_RUNTIME_FLAGS.minimalDataProvider
    ),
    minimalProducts: getFlag(
      "minimalProducts",
      "VITE_MINIMAL_PRODUCTS",
      DEFAULT_RUNTIME_FLAGS.minimalProducts
    ),
  };
}

function normalizeRuntimeFlags(flags = {}) {
  return {
    ...DEFAULT_RUNTIME_FLAGS,
    ...flags,
  };
}

function resolveFeature(flags, featureName, config) {
  if (flags.safeMode) {
    return Boolean(SAFE_MODE_FEATURES[featureName]);
  }

  if (config.unstable && !flags.allowUnstableRuntime) {
    return false;
  }

  if (config.disableKey && flags[config.disableKey]) {
    return false;
  }

  return Boolean(flags[config.enableKey]);
}

export function getEffectiveFeatures(flags = DEFAULT_RUNTIME_FLAGS) {
  const normalizedFlags = normalizeRuntimeFlags(flags);
  const features = {};

  for (const [featureName, config] of Object.entries(FEATURE_CONFIG)) {
    features[featureName] = resolveFeature(normalizedFlags, featureName, config);
  }

  return features;
}

export function isFeatureEnabled(flags, featureName) {
  const normalizedFeatureName = String(featureName || "").trim();
  if (!normalizedFeatureName) return false;
  return Boolean(getEffectiveFeatures(flags)[normalizedFeatureName]);
}

function applyRuntimeFlagPriority(flags) {
  const effectiveFeatures = getEffectiveFeatures(flags);

  // Runtime flags only control frontend visibility and diagnostic isolation.
  // They are not authorization. Sensitive actions still require role checks,
  // employee permissions, Supabase RLS, backend RPC policy, or server checks.
  const prioritizedFlags = {
    ...flags,
    disablePresence: !effectiveFeatures.presence,
    disableRealtime: !effectiveFeatures.realtime,
    disableReports: !effectiveFeatures.reports,
    disableAnalytics: !effectiveFeatures.analytics,
    enableAnalytics: effectiveFeatures.analytics,
    enableAudit: effectiveFeatures.audit,
    enableCash: effectiveFeatures.cash,
    enableCashier: effectiveFeatures.cashier,
    enableDigital: effectiveFeatures.digital,
    enableEmployees: effectiveFeatures.employees,
    enableHistory: effectiveFeatures.history,
    enablePresence: effectiveFeatures.presence,
    enableProducts: effectiveFeatures.products,
    enableRealtime: effectiveFeatures.realtime,
    enableReports: effectiveFeatures.reports,
    enableReturns: effectiveFeatures.returns,
    enableServiceProducts: effectiveFeatures.serviceProducts,
    enableShift: effectiveFeatures.shift,
    enableStockOpname: effectiveFeatures.stockOpname,
    enableWallet: effectiveFeatures.wallet,
  };

  if (flags.safeMode) {
    return {
      ...prioritizedFlags,
      safeMode: true,
      backgroundPreload: false,
      minimalDashboard: true,
      minimalDataProvider: true,
    };
  }

  if (!flags.allowUnstableRuntime) {
    return {
      ...prioritizedFlags,
      backgroundPreload: false,
    };
  }

  return prioritizedFlags;
}

export function getRuntimeFlags() {
  return applyRuntimeFlagPriority(readRuntimeFlags());
}
