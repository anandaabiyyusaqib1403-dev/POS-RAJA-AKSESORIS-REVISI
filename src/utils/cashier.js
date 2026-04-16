export const DEFAULT_CASHIER_NAME = "Sriyati";

const knownCashierAliases = new Set([
  "demo-kasir",
  "demo kasir",
  "kasir",
  "kasir raja aksesoris",
  "sriyati",
]);

export function formatCashierName(value, fallback = DEFAULT_CASHIER_NAME) {
  const normalized = String(value || "").trim();

  if (!normalized) return fallback;

  const cleaned = normalized.replace(/[-_]+/g, " ").trim();
  const lower = cleaned.toLowerCase();

  if (knownCashierAliases.has(normalized.toLowerCase()) || knownCashierAliases.has(lower)) {
    return DEFAULT_CASHIER_NAME;
  }

  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(normalized)) {
    return DEFAULT_CASHIER_NAME;
  }

  return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
