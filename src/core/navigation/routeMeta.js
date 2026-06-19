export const dashboardRoute = "/dashboard";
export const cashierRoute = "/kasir";
export const shiftRoute = "/shift";

export const routeMeta = {
  "/shift": {
    title: "Manajemen Shift",
    description: "Buka dan tutup shift dengan kontrol waktu, kasir aktif, dan approval pemilik toko.",
  },
  "/dashboard": {
    title: "Dashboard",
    description: "Ringkasan performa toko, profit, dan operasional harian.",
  },
  "/karyawan": {
    title: "Manajemen Karyawan",
    description: "Kelola akun kasir, akses operasional, performa, payroll sederhana, dan kontrol PIN.",
  },
  "/keuangan": {
    title: "Layanan Digital",
    description: "Input cepat pulsa, kuota, voucher game, token listrik, dan layanan digital lain.",
  },
  "/layanan-produk": {
    title: "Kelola Layanan",
    description: "Tambah, ubah, import, dan export daftar layanan digital.",
  },
  "/kasir": {
    title: "Kasir POS",
    description: "Alur transaksi cepat untuk aksesoris HP dengan checkout rapi dan cetak struk langsung.",
  },
  "/saldo": {
    title: "Saldo",
    description: "Kontrol saldo internal toko per platform dan mutasi dana.",
  },
  "/stok-barang": {
    title: "Stok Barang",
    description: "Master produk, stok fisik, margin, dan mutasi barang.",
  },
  "/stock-opname": {
    title: "Stock Opname",
    description: "Cocokkan stok fisik dengan catatan barang sebelum penyesuaian.",
  },
  "/retur-supplier": {
    title: "Retur & Garansi",
    description: "Kelola retur supplier dan klaim garansi konsumen dengan dampak stok yang jelas.",
  },
  "/history-produk": {
    title: "History Produk",
    description: "Produk terhapus, pemulihan data, dan pembersihan berkala.",
  },
  "/operasional": {
    title: "Catat Operasional",
    description: "Pemasukan dan pengeluaran toko harian dengan kontrol saldo kas.",
  },
  "/riwayat-transaksi": {
    title: "Riwayat Transaksi",
    description: "Cari transaksi dengan cepat dan lihat detail pemasukan, pengeluaran, serta laba.",
  },
  "/audit-log": {
    title: "Riwayat Aktivitas",
    description: "Jejak aksi sensitif pemilik toko, kasir, dan sistem untuk kontrol operasional.",
  },
  "/laporan-keuangan": {
    title: "Laporan Keuangan",
    description: "Omzet, modal, profit, pengeluaran, dan rekap kas toko.",
  },
  "/laporan-penjualan": {
    title: "Laporan Penjualan",
    description: "Kontrol penjualan produk, layanan, jasa, provider, pembayaran, dan kasir.",
  },
  "/kalkulator": {
    title: "Kalkulator",
    description: "Hitung pecahan uang dan cocokkan dengan catatan kas.",
  },
  "/bantuan": {
    title: "Bantuan",
    description: "Panduan alur kerja kasir dan pemilik toko untuk operasional toko.",
  },
};

export const defaultRouteMeta = {
  title: "Raja Aksesoris",
  description: "Tempat kerja harian untuk operasional Raja Aksesoris.",
};

export function normalizePathname(pathname = "") {
  const rawPathname = String(pathname || "").trim();
  if (!rawPathname) return "/";

  let normalizedPathname = rawPathname;
  const hashIndex = normalizedPathname.indexOf("#");
  if (hashIndex >= 0) normalizedPathname = normalizedPathname.slice(0, hashIndex);

  const queryIndex = normalizedPathname.indexOf("?");
  if (queryIndex >= 0) normalizedPathname = normalizedPathname.slice(0, queryIndex);

  if (!normalizedPathname.startsWith("/")) {
    normalizedPathname = `/${normalizedPathname}`;
  }

  normalizedPathname = normalizedPathname.replace(/\/+$/, "");
  return normalizedPathname || "/";
}

export function getRouteMeta(pathname) {
  return routeMeta[normalizePathname(pathname)] || defaultRouteMeta;
}
