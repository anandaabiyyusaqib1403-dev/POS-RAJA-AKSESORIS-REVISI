const DEFAULT_ERROR_MESSAGE = "Aksi belum berhasil. Coba ulang sebentar lagi.";

const TECHNICAL_MESSAGE_PATTERNS = [
  "permission denied",
  "row-level security",
  "violates row-level security",
  "schema cache",
  "could not find",
  "relation",
  "column",
  "table",
  "database",
  "supabase",
  "postgrest",
  "pgrst",
  "jwt",
  "rpc",
  "sqlstate",
];

export function toClientMessage(message, fallback = DEFAULT_ERROR_MESSAGE) {
  const raw = String(message || "").trim();
  if (!raw) return fallback;

  const normalized = raw.toLowerCase();

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out")
  ) {
    return "Koneksi sedang kurang stabil. Coba ulang sebentar lagi.";
  }

  if (normalized.includes("invalid login credentials") || normalized.includes("invalid_credentials")) {
    return "Email atau password belum cocok.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Email belum aktif. Minta pemilik toko mengecek akun ini dulu.";
  }

  if (normalized.includes("permission denied") || normalized.includes("row-level security")) {
    return "Akun ini belum punya akses untuk membuka atau mengubah data tersebut.";
  }

  if (
    normalized.includes("audit log") ||
    normalized.includes("audit_logs") ||
    normalized.includes("riwayat aktivitas")
  ) {
    return "Riwayat aktivitas belum siap ditampilkan. Minta pemilik toko mengecek pengaturan aplikasi.";
  }

  if (
    normalized.includes("schema") ||
    normalized.includes("migration") ||
    normalized.includes("could not find") ||
    normalized.includes("relation") ||
    normalized.includes("column") ||
    normalized.includes("table")
  ) {
    return "Data aplikasi sedang disiapkan. Muat ulang halaman, lalu coba lagi.";
  }

  if (TECHNICAL_MESSAGE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return fallback;
  }

  return raw
    .replace(/\bowner\b/gi, "pemilik toko")
    .replace(/\bOwner\b/g, "Pemilik toko");
}
