import { nonValidatedWalletIds } from "../../../data/businessOptions";
import {
  normalizeServiceCategory,
  normalizeWalletId,
  pasarKuotaServiceCategorySet,
} from "../../../core/normalizers/shared";

export function getDigitalServiceWalletDeduction(transaction: Record<string, any>) {
  const category = normalizeServiceCategory(transaction.category || transaction.jenis);

  if (["transfer_bank", "transfer_ewallet"].includes(category)) {
    const sourcePlatform = normalizeWalletId(transaction.platform_sumber, "");
    if (!sourcePlatform || nonValidatedWalletIds.includes(sourcePlatform)) {
      return null;
    }

    return {
      platform: sourcePlatform,
      amount:
        sourcePlatform === "pasar_kuota"
          ? Number(transaction.selling_price ?? transaction.harga_jual ?? 0)
          : Number(transaction.cost ?? transaction.modal ?? 0),
    };
  }

  if (!pasarKuotaServiceCategorySet.has(category)) {
    return null;
  }

  return {
    platform: "pasar_kuota",
    amount: Number(transaction.cost ?? transaction.modal ?? 0),
  };
}
