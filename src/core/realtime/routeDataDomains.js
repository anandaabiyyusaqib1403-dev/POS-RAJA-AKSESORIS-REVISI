import { normalizePathname } from "../navigation/routeMeta.js";

export const DATA_DOMAINS = Object.freeze({
  SHIFT: "shift",
  SETTINGS: "settings",
  INVENTORY: "inventory",
  SERVICE_PRODUCTS: "service_products",
  ACCESSORY_SALES: "accessory_sales",
  DIGITAL_SALES: "digital_sales",
  LOGISTICS_SALES: "logistics_sales",
  WALLET: "wallet",
  CASH: "cash",
  RETURNS: "returns",
  STOCK_OPNAME: "stock_opname",
  PRODUCT_ACTIVITY: "product_activity",
  EMPLOYEES: "employees",
});

const CORE_DOMAINS = [DATA_DOMAINS.SHIFT, DATA_DOMAINS.SETTINGS];
const TRANSACTION_DOMAINS = [
  DATA_DOMAINS.ACCESSORY_SALES,
  DATA_DOMAINS.DIGITAL_SALES,
  DATA_DOMAINS.LOGISTICS_SALES,
  DATA_DOMAINS.WALLET,
  DATA_DOMAINS.CASH,
];
const OWNER_OPERATIONAL_DOMAINS = [
  DATA_DOMAINS.INVENTORY,
  DATA_DOMAINS.SERVICE_PRODUCTS,
  DATA_DOMAINS.RETURNS,
  DATA_DOMAINS.STOCK_OPNAME,
  DATA_DOMAINS.PRODUCT_ACTIVITY,
  DATA_DOMAINS.EMPLOYEES,
  ...TRANSACTION_DOMAINS,
];

const ROUTE_DOMAINS = Object.freeze({
  "/kasir": [DATA_DOMAINS.INVENTORY, DATA_DOMAINS.ACCESSORY_SALES, DATA_DOMAINS.WALLET],
  "/keuangan": [DATA_DOMAINS.SERVICE_PRODUCTS, DATA_DOMAINS.DIGITAL_SALES, DATA_DOMAINS.WALLET],
  "/shift": [
    DATA_DOMAINS.ACCESSORY_SALES,
    DATA_DOMAINS.DIGITAL_SALES,
    DATA_DOMAINS.LOGISTICS_SALES,
    DATA_DOMAINS.WALLET,
  ],
  "/stok-barang": [DATA_DOMAINS.INVENTORY],
  "/saldo": TRANSACTION_DOMAINS,
  "/operasional": TRANSACTION_DOMAINS,
  "/kalkulator": TRANSACTION_DOMAINS,
  "/riwayat-transaksi": [DATA_DOMAINS.INVENTORY, ...TRANSACTION_DOMAINS],
  "/dashboard": OWNER_OPERATIONAL_DOMAINS,
  "/karyawan": [DATA_DOMAINS.EMPLOYEES, DATA_DOMAINS.RETURNS, ...TRANSACTION_DOMAINS],
  "/laporan-keuangan": [
    DATA_DOMAINS.INVENTORY,
    DATA_DOMAINS.RETURNS,
    ...TRANSACTION_DOMAINS,
  ],
  "/laporan-penjualan": [
    DATA_DOMAINS.INVENTORY,
    DATA_DOMAINS.SERVICE_PRODUCTS,
    ...TRANSACTION_DOMAINS,
  ],
  "/history-produk": [DATA_DOMAINS.INVENTORY, DATA_DOMAINS.PRODUCT_ACTIVITY],
  "/layanan-produk": [DATA_DOMAINS.SERVICE_PRODUCTS],
  "/stock-opname": [DATA_DOMAINS.INVENTORY, DATA_DOMAINS.STOCK_OPNAME],
  "/retur-supplier": [DATA_DOMAINS.INVENTORY, DATA_DOMAINS.ACCESSORY_SALES, DATA_DOMAINS.RETURNS],
});

export function getRouteDataDomains(pathname, role = "") {
  const routeDomains = ROUTE_DOMAINS[normalizePathname(pathname)] || [];
  const domains = new Set([...CORE_DOMAINS, ...routeDomains]);

  if (role !== "pemilik") {
    domains.delete(DATA_DOMAINS.EMPLOYEES);
    domains.delete(DATA_DOMAINS.PRODUCT_ACTIVITY);
    domains.delete(DATA_DOMAINS.STOCK_OPNAME);
    domains.delete(DATA_DOMAINS.RETURNS);
  }

  return domains;
}

export function hasDataDomain(domains, domain) {
  return domains instanceof Set && domains.has(domain);
}
