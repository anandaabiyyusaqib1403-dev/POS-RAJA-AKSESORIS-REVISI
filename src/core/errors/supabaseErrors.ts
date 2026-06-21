import { SERVICE_PRODUCT_STALE_MESSAGE } from "../constants/migrationMessages";
import { toClientMessage } from "../../utils/clientMessages";

export function getSupabaseErrorText(error: Record<string, any> = {}) {
  return [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function isMissingRpcError(error: Record<string, any> = {}) {
  return (
    error?.code === "PGRST202" ||
    error?.code === "42883" ||
    String(error?.message || "").toLowerCase().includes("could not find the function")
  );
}

export function isServiceProductNotFoundError(error: Record<string, any> = {}) {
  return (
    error?.isServiceProductNotFound === true ||
    (
      String(error?.code || "") === "P0001" &&
      getSupabaseErrorText(error).includes("layanan tidak ditemukan")
    )
  );
}

export function createSupabaseError(
  error: Record<string, any> = {},
  fallbackMessage = "Aksi belum berhasil."
) {
  if (
    String(error?.code || "") === "P0001" &&
    getSupabaseErrorText(error).includes("produk tidak ditemukan")
  ) {
    const productError = new Error("Produk ini baru saja berubah. Pilih ulang produknya ya.") as Error & Record<string, any>;
    productError.code = error?.code;
    productError.details = error?.details;
    productError.hint = error?.hint;
    return productError;
  }

  if (isServiceProductNotFoundError(error)) {
    const serviceError = new Error(SERVICE_PRODUCT_STALE_MESSAGE) as Error & Record<string, any>;
    serviceError.code = error?.code;
    serviceError.details = error?.details;
    serviceError.hint = error?.hint;
    serviceError.isServiceProductNotFound = true;
    return serviceError;
  }

  const parts = [error?.message || fallbackMessage, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .filter(Boolean);
  const enrichedError = new Error(toClientMessage([...new Set(parts)].join(" | "), fallbackMessage)) as Error & Record<string, any>;
  enrichedError.code = error?.code;
  enrichedError.details = error?.details;
  enrichedError.hint = error?.hint;
  return enrichedError;
}

export function isMissingShiftApprovalSchemaError(error: Record<string, any> = {}) {
  const text = getSupabaseErrorText(error);

  return (
    ["42703", "PGRST204", "PGRST205"].includes(String(error?.code || "")) &&
    text.includes("shifts") &&
    (
      text.includes("approval_notes") ||
      text.includes("approved_at") ||
      text.includes("correction_difference") ||
      text.includes("correction_type") ||
      text.includes("closed_by")
    )
  );
}
