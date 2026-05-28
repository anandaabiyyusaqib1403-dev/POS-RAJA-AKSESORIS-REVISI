import { walletPlatformLabelMap, walletPlatforms } from "../../../data/businessOptions";
import { isLargeShiftDifference } from "../../../utils/shift";

export function getStatusBadgeClass(status) {
  if (status === "approved") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "approved_with_correction") {
    return "bg-amber-100 text-amber-700";
  }

  if (status === "flagged") {
    return "bg-rose-100 text-rose-700";
  }

  if (status === "pending") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-sky-100 text-sky-700";
}

export function getDifferenceClass(value) {
  if (value === null || value === undefined || value === 0) {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  if (isLargeShiftDifference(value)) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

const featuredDigitalMethods = ["dana", "bca", "pasar_kuota", "qris"];
const ignoredDigitalMethods = new Set(["cash", "tunai"]);
export const orderedDigitalMethods = [
  ...featuredDigitalMethods,
  ...walletPlatforms
    .map((item) => item.value)
    .filter((value) => !ignoredDigitalMethods.has(value) && !featuredDigitalMethods.includes(value)),
];

function normalizeBreakdownMethod(method) {
  return String(method || "other")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function normalizeDigitalBreakdown(breakdown) {
  if (!breakdown || typeof breakdown !== "object") {
    return {};
  }

  return Object.entries(breakdown).reduce((acc, [method, amount]) => {
    const normalizedMethod = normalizeBreakdownMethod(method);
    if (ignoredDigitalMethods.has(normalizedMethod)) {
      return acc;
    }

    const value = Number(amount || 0);
    acc[normalizedMethod] = (acc[normalizedMethod] || 0) + (Number.isFinite(value) ? value : 0);
    return acc;
  }, {});
}

export function formatDigitalMethodLabel(method) {
  if (method === "split") {
    return "Split Payment";
  }

  if (walletPlatformLabelMap[method]) {
    return walletPlatformLabelMap[method];
  }

  return String(method || "other")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getDigitalBreakdownRows(shift, { includeKnownMethods = false } = {}) {
  const breakdown = normalizeDigitalBreakdown(shift?.digital_breakdown || shift?.digitalBreakdown);
  const dynamicMethods = Object.keys(breakdown).filter(
    (method) => !ignoredDigitalMethods.has(method) && !orderedDigitalMethods.includes(method)
  );
  const methods = [...new Set([...(includeKnownMethods ? orderedDigitalMethods : []), ...dynamicMethods])];

  return methods
    .map((method) => ({
      method,
      label: formatDigitalMethodLabel(method),
      amount: breakdown[method] || 0,
    }))
    .filter((row) => includeKnownMethods || row.amount > 0);
}

export function getWalletBalanceMap(walletBalances = []) {
  return walletBalances.reduce((acc, wallet) => {
    acc[wallet.id] = Number(wallet.balance || 0);
    return acc;
  }, {});
}
