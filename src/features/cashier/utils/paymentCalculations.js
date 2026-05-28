import { walletPlatformLabelMap } from "../../../data/businessOptions";
import { formatRupiah } from "../../../utils/format";

export function getResolvedPaymentMethod(paymentGroup, bankWallet, ewalletWallet) {
  if (paymentGroup === "transfer_bank") {
    return bankWallet || "bca";
  }

  if (paymentGroup === "ewallet") {
    return ewalletWallet || "dana";
  }

  return paymentGroup;
}

export function getPaymentLabel(paymentGroup, bankWallet, ewalletWallet) {
  const resolvedMethod = getResolvedPaymentMethod(paymentGroup, bankWallet, ewalletWallet);

  if (paymentGroup === "transfer_bank") {
    return `Transfer Bank - ${walletPlatformLabelMap[resolvedMethod] || resolvedMethod}`;
  }

  if (paymentGroup === "ewallet") {
    return `E-Wallet - ${walletPlatformLabelMap[resolvedMethod] || resolvedMethod}`;
  }

  return walletPlatformLabelMap[resolvedMethod] || resolvedMethod;
}

export function createSplitPaymentRow(method = "cash", amount = "") {
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    method,
    amount,
  };
}

export function getSplitPaymentAmount(row) {
  return Number(row.amount || 0);
}

export function getCashInputDisplay(cashReceived, total) {
  if (!cashReceived) {
    return {
      label: "Masukkan uang diterima",
      tone: "border-slate-200 bg-slate-50 text-slate-600",
    };
  }

  const safePaid = Number(cashReceived || 0);
  if (safePaid < total) {
    return {
      label: `Kurang ${formatRupiah(total - safePaid)}`,
      tone: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  return {
    label: `Kembalian ${formatRupiah(safePaid - total)}`,
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}
