const browserPatterns = [
  { name: "Edge", pattern: /Edg\/([\d.]+)/ },
  { name: "Edge", pattern: /EdgiOS\/([\d.]+)/ },
  { name: "Edge", pattern: /EdgA\/([\d.]+)/ },
  { name: "Chrome", pattern: /Chrome\/([\d.]+)/ },
  { name: "Chrome", pattern: /CriOS\/([\d.]+)/ },
  { name: "Firefox", pattern: /Firefox\/([\d.]+)/ },
  { name: "Firefox", pattern: /FxiOS\/([\d.]+)/ },
  { name: "Safari", pattern: /Version\/([\d.]+).*Safari/ },
];

const osPatterns = [
  { name: "Win", pattern: /Windows NT/ },
  { name: "macOS", pattern: /Mac OS X/ },
  { name: "Android", pattern: /Android/ },
  { name: "iPhone", pattern: /iPhone/ },
  { name: "iPad", pattern: /iPad/ },
  { name: "iOS", pattern: /iPod/ },
  { name: "Linux", pattern: /Linux/ },
];

function resolveBrowser(userAgent) {
  const browser = browserPatterns.find((item) => item.pattern.test(userAgent));
  return browser?.name || "Browser";
}

function resolveOs(userAgent) {
  const os = osPatterns.find((item) => item.pattern.test(userAgent));
  return os?.name || "Device";
}

export function getUserAgent() {
  if (typeof navigator === "undefined") return "";
  return navigator.userAgent || "";
}

export function getDeviceSummary(userAgent = getUserAgent()) {
  const safeUserAgent = String(userAgent || "");
  if (!safeUserAgent) return "Unknown device";
  return `${resolveBrowser(safeUserAgent)} \u00b7 ${resolveOs(safeUserAgent)}`;
}

export function summarizeDevice(value, fallback = "Belum tercatat") {
  const safeValue = String(value || "").trim();
  if (!safeValue) return fallback;

  if (
    /Mozilla\/|AppleWebKit\/|Chrome\/|CriOS\/|Safari\/|Firefox\/|FxiOS\/|Edg\/|EdgiOS\/|EdgA\//.test(safeValue)
  ) {
    return getDeviceSummary(safeValue);
  }

  const compactKnownDevice = safeValue
    .replace(/\s+-\s+/g, " \u00b7 ")
    .replace(/\bWindows\b/g, "Win")
    .replace(/\s+/g, " ");

  return compactKnownDevice.length > 24
    ? `${compactKnownDevice.slice(0, 21)}...`
    : compactKnownDevice;
}
