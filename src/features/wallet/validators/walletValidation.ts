import { nonValidatedWalletIds } from "../../../data/businessOptions";
import { normalizeWalletId } from "../../../core/normalizers/shared";
import { buildWalletBalanceMap } from "../calculators/walletBalances";

const INSUFFICIENT_WALLET_BALANCE_MESSAGE = "Saldonya kurang. Isi saldo dulu ya.";

export function isWalletValidated(walletId: unknown) {
  const id = normalizeWalletId(walletId);
  return !nonValidatedWalletIds.includes(id);
}

export function validateWalletBalance(
  walletId: unknown,
  amount: unknown,
  transactions: Record<string, any>[] = [],
  options: Record<string, any> = {}
) {
  const normalizedWalletId = normalizeWalletId(walletId);
  const safeAmount = Math.max(0, Number(amount || 0));

  if (!isWalletValidated(normalizedWalletId) || safeAmount <= 0) {
    return;
  }

  const insufficientMessage =
    options.insufficientMessage || INSUFFICIENT_WALLET_BALANCE_MESSAGE;
  const balance = buildWalletBalanceMap(transactions)[normalizedWalletId] || 0;
  if (balance === 0 && safeAmount > 0) {
    throw new Error(
      options.zeroMessage ||
        "Saldo 0. Isi saldo manual terlebih dahulu agar transaksi dapat divalidasi."
    );
  }
  if (balance < safeAmount) {
    throw new Error(insufficientMessage);
  }
}
