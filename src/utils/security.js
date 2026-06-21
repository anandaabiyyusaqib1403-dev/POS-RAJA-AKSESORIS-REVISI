const encoder = new TextEncoder();

export async function hashSecret(value) {
  const safeValue = String(value || "");

  if (!globalThis.crypto?.subtle) {
    throw new Error("Perangkat ini belum mendukung verifikasi PIN.");
  }

  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(safeValue));
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}
