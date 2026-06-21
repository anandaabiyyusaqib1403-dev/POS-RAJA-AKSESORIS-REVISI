import {
  customerPaymentPlatformIds,
  walletAliasMap,
  walletPlatformIds,
} from "../../data/businessOptions";
import { productServiceCategoryIds, serviceCategories } from "../../data/serviceProducts";

const serviceCategoryByLabel = serviceCategories.reduce<Record<string, string>>(
  (acc, category) => {
    acc[category.value] = category.value;
    acc[category.label.toLowerCase()] = category.value;
    acc[category.label.toLowerCase().replace(/\s+/g, "_")] = category.value;
    return acc;
  },
  {
    token: "token_listrik",
    listrik: "token_listrik",
    token_pln: "token_listrik",
    voucher: "voucher_game",
    game: "voucher_game",
  }
);

export const pasarKuotaServiceCategorySet = new Set(productServiceCategoryIds);

export function toSafeInteger(value: unknown, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(number);
}

export function normalizeServiceCategory(value: unknown) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  return serviceCategoryByLabel[key] || key;
}

export function normalizeWalletId(value: unknown, fallback = "cash") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  const spaced = String(value || "").trim().toLowerCase();
  const mapped = walletAliasMap[normalized] || walletAliasMap[spaced] || normalized;

  if (mapped === "split") return "split";

  return walletPlatformIds.includes(mapped) ? mapped : fallback;
}

export function normalizePaymentMethodId(value: unknown, fallback = "cash") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  const spaced = String(value || "").trim().toLowerCase();
  const mapped = walletAliasMap[normalized] || walletAliasMap[spaced] || normalized;

  if (mapped === "split") return "split";

  return customerPaymentPlatformIds.includes(mapped) ? mapped : fallback;
}
