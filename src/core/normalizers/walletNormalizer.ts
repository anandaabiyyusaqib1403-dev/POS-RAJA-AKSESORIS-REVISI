import type { WalletTransaction } from "../../types/Wallet";
import { normalizeWalletId } from "./shared";

export { normalizeWalletId } from "./shared";

export function normalizeWalletTransaction(transaction: Record<string, any>): WalletTransaction {
  return {
    ...transaction,
    platform: normalizeWalletId(transaction.platform),
    jenis: transaction.jenis || "masuk",
    platform_tujuan: transaction.platform_tujuan
      ? normalizeWalletId(transaction.platform_tujuan)
      : null,
    nominal: Number(transaction.nominal || 0),
    biaya_admin: Number(transaction.biaya_admin || 0),
    keterangan: transaction.keterangan || "",
    source_type: transaction.source_type || "",
    source_id: transaction.source_id || null,
    source_ref: transaction.source_ref || "",
    balance_before:
      transaction.balance_before === null || transaction.balance_before === undefined
        ? null
        : Number(transaction.balance_before || 0),
    balance_after:
      transaction.balance_after === null || transaction.balance_after === undefined
        ? null
        : Number(transaction.balance_after || 0),
    reversal_of: transaction.reversal_of || null,
    deleted_at: transaction.deleted_at || null,
    deleted_by: transaction.deleted_by || null,
  };
}
