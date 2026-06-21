export const DEFAULT_CASHIER_NAME = "Kasir tidak tercatat";
export const DEFAULT_OWNER_NAME = "Amri Syowfial";

const knownCashierAliases = new Set([
  "kasir",
  "kasir raja aksesoris",
]);

const knownOwnerAliases = new Set([
  "owner",
  "pemilik",
  "pemilik raja aksesoris",
  "amri syowfial",
]);

export function formatCashierName(value, fallback = DEFAULT_CASHIER_NAME) {
  const normalized = String(value || "").trim();

  if (!normalized) return fallback;

  const cleaned = normalized.replace(/[-_]+/g, " ").trim();
  const lower = cleaned.toLowerCase();

  if (knownOwnerAliases.has(normalized.toLowerCase()) || knownOwnerAliases.has(lower)) {
    return DEFAULT_OWNER_NAME;
  }

  if (knownCashierAliases.has(normalized.toLowerCase()) || knownCashierAliases.has(lower)) {
    return DEFAULT_CASHIER_NAME;
  }

  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(normalized)) {
    return DEFAULT_CASHIER_NAME;
  }

  return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
