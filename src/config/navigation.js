export const dashboardRoute = "/dashboard";
export const cashierRoute = "/kasir";

export const routeMeta = {
  "/dashboard": {
    title: "Dashboard",
    description: "Ringkasan performa toko, profit, dan operasional harian.",
  },
  "/keuangan": {
    title: "Transaksi Keuangan",
    description: "Pencatatan pulsa, paket data, top up game, dan layanan digital lain.",
  },
  "/kasir": {
    title: "Kasir POS",
    description: "Alur transaksi cepat untuk aksesoris HP dan shortcut pencatatan digital.",
  },
  "/pelanggan": {
    title: "Data Pelanggan",
    description: "Daftar pelanggan prioritas, kebutuhan repeat order, dan histori singkat.",
  },
  "/saldo": {
    title: "Saldo",
    description: "Kontrol saldo internal toko per platform dan mutasi dana.",
  },
  "/stok-barang": {
    title: "Stok Barang",
    description: "Master produk, stok fisik, margin, dan mutasi barang.",
  },
  "/operasional": {
    title: "Catat Operasional",
    description: "Pemasukan dan pengeluaran toko harian dengan kontrol saldo kas.",
  },
  "/hutang": {
    title: "Hutang",
    description: "Pantau piutang pelanggan dan kewajiban supplier dari satu tempat.",
  },
  "/riwayat-transaksi": {
    title: "Riwayat Transaksi",
    description: "Cari transaksi dengan cepat dan lihat detail pemasukan, pengeluaran, serta laba.",
  },
  "/laporan-keuangan": {
    title: "Laporan Keuangan",
    description: "Omzet, modal, profit, pengeluaran, dan rekap kas toko.",
  },
  "/laporan-penjualan": {
    title: "Laporan Penjualan",
    description: "Breakdown penjualan per channel, produk terlaris, dan tren performa.",
  },
  "/kalkulator": {
    title: "Kalkulator",
    description: "Hitung pecahan uang dan bandingkan dengan saldo kas sistem.",
  },
  "/bantuan": {
    title: "Bantuan",
    description: "Panduan alur kerja kasir dan owner untuk operasional toko.",
  },
};

export const navigationSections = {
  pemilik: [
    {
      title: "Utama",
      items: [
        { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
        { to: "/keuangan", label: "Transaksi Keuangan", icon: "wallet" },
        { to: "/kasir", label: "Kasir (POS)", icon: "pos" },
        { to: "/pelanggan", label: "Data Pelanggan", icon: "users" },
      ],
    },
    {
      title: "Operasional",
      items: [
        { to: "/saldo", label: "Saldo", icon: "coins" },
        { to: "/stok-barang", label: "Stok Barang", icon: "box" },
        { to: "/operasional", label: "Catat Operasional", icon: "receipt" },
        { to: "/logistik", label: "Logistik", icon: "truck" },
        { to: "/hutang", label: "Hutang", icon: "debt" },
      ],
    },
    {
      title: "Riwayat & Laporan",
      items: [
        { to: "/riwayat-transaksi", label: "Riwayat Transaksi", icon: "history" },
        { to: "/laporan-keuangan", label: "Laporan Keuangan", icon: "chart" },
        { to: "/laporan-penjualan", label: "Laporan Penjualan", icon: "trend" },
      ],
    },
    {
      title: "Tools",
      items: [
        { to: "/kalkulator", label: "Kalkulator", icon: "calculator" },
        { to: "/bantuan", label: "Bantuan", icon: "help" },
      ],
    },
  ],
  kasir: [
    {
      title: "Kasir",
      items: [
        { to: "/kasir", label: "Kasir (POS)", icon: "pos" },
        { to: "/riwayat-transaksi", label: "Riwayat Transaksi", icon: "history" },
      ],
    },
    {
      title: "Tools",
      items: [
        { to: "/kalkulator", label: "Kalkulator", icon: "calculator" },
        { to: "/bantuan", label: "Bantuan", icon: "help" },
      ],
    },
  ],
};

export function getDefaultRoute(role) {
  return role === "pemilik" ? dashboardRoute : cashierRoute;
}

export function getRouteMeta(pathname) {
  return (
    routeMeta[pathname] || {
      title: "Raja Aksesoris",
      description: "Workspace operasional premium untuk counter Raja Aksesoris.",
    }
  );
}
