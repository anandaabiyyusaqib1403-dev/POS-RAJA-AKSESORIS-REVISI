import {
  cashierRoute,
  dashboardRoute,
  getRouteMeta,
  normalizePathname,
  routeMeta,
  shiftRoute,
} from "./routeMeta.js";
import {
  filterNavigationByFeatureFlags,
  filterNavigationByPermissions,
} from "./navigationFilters.js";

export { cashierRoute, dashboardRoute, getRouteMeta, normalizePathname, routeMeta, shiftRoute };
export { filterNavigationByFeatureFlags, filterNavigationByPermissions };

export const ownerNavigationSections = [
  {
    title: "Utama",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { to: "/karyawan", label: "Karyawan", icon: "users", feature: "employees" },
      { to: "/shift", label: "Shift", icon: "history", feature: "shift" },
      { to: "/keuangan", label: "Layanan Digital", icon: "wallet", feature: "digital" },
      { to: "/layanan-produk", label: "Kelola Layanan", icon: "settings", feature: "serviceProducts" },
      { to: "/kasir", label: "Kasir (POS)", icon: "pos", feature: "cashier" },
    ],
  },
  {
    title: "Operasional",
    items: [
      { to: "/saldo", label: "Saldo", icon: "coins", feature: "wallet" },
      {
        to: "/stok-barang",
        label: "Stok Barang",
        icon: "box",
        feature: "products",
        children: [
          { to: "/stok-barang#kelola-kategori", label: "Kelola Kategori", feature: "products" },
          { to: "/stok-barang#tambah-kelola", label: "Tambah & Kelola", feature: "products" },
          { to: "/stok-barang#tambah-produk", label: "Tambah Produk", feature: "products" },
        ],
      },
      { to: "/stock-opname", label: "Stock Opname", icon: "clipboard", feature: "stockOpname" },
      { to: "/retur-supplier", label: "Retur & Garansi", icon: "return", feature: "returns" },
      { to: "/operasional", label: "Catat Operasional", icon: "receipt", feature: "cash" },
    ],
  },
  {
    title: "Riwayat & Laporan",
    items: [
      { to: "/riwayat-transaksi", label: "Riwayat Transaksi", icon: "history", feature: "history" },
      { to: "/history-produk", label: "History Produk", icon: "history", feature: "products" },
      { to: "/audit-log", label: "Riwayat Aktivitas", icon: "clipboard", feature: "audit" },
      { to: "/laporan-keuangan", label: "Laporan Keuangan", icon: "chart", feature: "reports" },
      { to: "/laporan-penjualan", label: "Laporan Penjualan", icon: "trend", feature: "reports" },
    ],
  },
  {
    title: "Tools",
    items: [
      { to: "/kalkulator", label: "Kalkulator", icon: "calculator" },
      { to: "/bantuan", label: "Bantuan", icon: "help" },
    ],
  },
];

const cashierHiddenRoutes = new Set([
  "/dashboard",
  "/karyawan",
  "/history-produk",
  "/layanan-produk",
  "/audit-log",
  "/laporan-keuangan",
  "/laporan-penjualan",
  "/stock-opname",
  "/retur-supplier",
]);

const cashierStockChildren = new Set(["/stok-barang#tambah-kelola"]);

function buildCashierNavigationSections() {
  return ownerNavigationSections
    .map((section) => {
      const items = section.items
        .filter((item) => !cashierHiddenRoutes.has(item.to))
        .map((item) => {
          if (item.to !== "/stok-barang" || !Array.isArray(item.children)) return item;

          return {
            ...item,
            children: item.children.filter((child) => cashierStockChildren.has(child.to)),
          };
        });

      return { ...section, items };
    })
    .filter((section) => section.items.length > 0);
}

export const cashierNavigationSections = buildCashierNavigationSections();

export const navigationSections = {
  pemilik: ownerNavigationSections,
  kasir: cashierNavigationSections,
};

export function buildNavigationSections(role, flags, permissions) {
  const baseSections = navigationSections[role] || [];
  const featureFilteredSections = filterNavigationByFeatureFlags(baseSections, flags);
  return filterNavigationByPermissions(featureFilteredSections, permissions);
}

export function getDefaultRoute(role) {
  return role === "pemilik" ? dashboardRoute : cashierRoute;
}
