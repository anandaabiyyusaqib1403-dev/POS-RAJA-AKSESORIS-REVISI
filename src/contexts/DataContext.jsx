import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { supabase, supabaseEnabled } from "../lib/supabase";
import {
  endOfDay,
  formatDateInput,
  formatDateKey,
  formatDateTime,
  generateTransactionNumber,
  isDateInRange,
  startOfDay,
} from "../utils/format";
import { productCategoryGroups } from "../data/productCategories";
import {
  nonValidatedWalletIds,
  walletAliasMap,
  walletOverviewPlatforms,
  walletPlatformIds,
  walletPlatformLabelMap,
  walletPlatformTypeMap,
} from "../data/businessOptions";
import importedProductsSeed from "../data/importedProducts.generated.json";

const DataContext = createContext(null);
const seedNow = new Date().toISOString();
const todayDate = formatDateInput(new Date());
const INSUFFICIENT_WALLET_BALANCE_MESSAGE =
  "Saldo tidak mencukupi, silakan isi saldo terlebih dahulu";

const legacySeedProducts = [
  {
    id: "prd-1",
    kode_produk: "RAJA-CS-A15-001",
    nama: "Casing Samsung A15 Anti Crack",
    kategori: "Casing",
    stok: 8,
    stok_minimum: 3,
    harga_beli: 18000,
    harga_jual: 30000,
    satuan: "pcs",
    aktif: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "prd-2",
    kode_produk: "RAJA-TG-A38-001",
    nama: "Tempered Glass Oppo A38",
    kategori: "Tempered Glass",
    stok: 5,
    stok_minimum: 2,
    harga_beli: 7000,
    harga_jual: 15000,
    satuan: "pcs",
    aktif: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "prd-3",
    kode_produk: "RAJA-CHR-20W-001",
    nama: "Charger Fast Charging 20W",
    kategori: "Charger",
    stok: 2,
    stok_minimum: 3,
    harga_beli: 28000,
    harga_jual: 45000,
    satuan: "pcs",
    aktif: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "prd-4",
    kode_produk: "RAJA-KBL-TC-001",
    nama: "Kabel Type-C Braided 1 Meter",
    kategori: "Kabel",
    stok: 0,
    stok_minimum: 2,
    harga_beli: 10000,
    harga_jual: 18000,
    satuan: "pcs",
    aktif: true,
    created_at: new Date().toISOString(),
  },
];

const seedProducts = (importedProductsSeed.length ? importedProductsSeed : legacySeedProducts).map(
  (product, index) => ({
    ...sanitizeImportedProduct(product),
    id: product.id || `seed-prd-${String(index + 1).padStart(4, "0")}`,
    created_at: product.created_at || seedNow,
  })
);

const legacySeedCodes = new Set(
  legacySeedProducts.map((product) => normalizeProductCode(product.kode_produk))
);

const seedDigitalTransactions = [
  {
    id: "dig-1",
    kasir_id: "demo-kasir",
    no_transaksi: `LYN-${formatDateKey(new Date())}-0001`,
    jenis: "pulsa",
    provider: "Telkomsel",
    nomor_tujuan: "081234567890",
    nama_tujuan: "Pelanggan Counter",
    platform_sumber: null,
    nominal: 25000,
    harga_jual: 27000,
    modal: 25200,
    keuntungan: 1800,
    catatan: "Demo pulsa",
    created_at: seedNow,
  },
  {
    id: "dig-2",
    kasir_id: "demo-kasir",
    no_transaksi: `LYN-${formatDateKey(new Date())}-0002`,
    jenis: "transfer_bank",
    provider: "BCA",
    nomor_tujuan: "1234567890",
    nama_tujuan: "Andi Saputra",
    platform_sumber: "bca",
    nominal: 100000,
    harga_jual: 105000,
    modal: 102500,
    keuntungan: 2500,
    catatan: "Transfer pelanggan via aplikasi pihak ketiga",
    created_at: seedNow,
  },
];

const seedWalletTransactions = [
  {
    id: "dom-1",
    kasir_id: "demo-kasir",
    platform: "dana",
    jenis: "masuk",
    platform_tujuan: null,
    nominal: 150000,
    biaya_admin: 0,
    keterangan: "Isi saldo internal toko",
    created_at: seedNow,
  },
  {
    id: "dom-2",
    kasir_id: "demo-kasir",
    platform: "dana",
    jenis: "transfer_antar",
    platform_tujuan: "cash",
    nominal: 100000,
    biaya_admin: 2000,
    keterangan: "Tarik saldo internal ke laci tunai",
    created_at: seedNow,
  },
];

const seedLogisticsTransactions = [
  {
    id: "log-1",
    kasir_id: "demo-kasir",
    no_transaksi: `LOG-${formatDateKey(new Date())}-0001`,
    type: "logistik",
    ekspedisi: "JNE",
    courier: "JNE",
    sender: "Raja Aksesoris",
    receiver: "Budi Santoso",
    destination: "Jakarta Selatan",
    packageType: "Regular",
    weight: 1.2,
    price: 18000,
    paymentMethod: "cash",
    platform_sumber: "cash",
    harga_jual: 18000,
    modal: 0,
    keuntungan: 18000,
    no_resi: "JNE1234567890",
    catatan: "Paket kecil",
    created_at: seedNow,
  },
];

const seedCashEntries = [
  {
    id: "kas-1",
    kasir_id: "demo-owner",
    jenis: "pemasukan",
    kategori: "saldo_awal",
    nominal: 500000,
    keterangan: "Saldo awal demo",
    tanggal: todayDate,
    created_at: seedNow,
  },
  {
    id: "kas-2",
    kasir_id: "demo-owner",
    jenis: "pengeluaran",
    kategori: "operasional",
    nominal: 25000,
    keterangan: "Air minum dan kebersihan",
    tanggal: todayDate,
    created_at: seedNow,
  },
];

function loadDemoState(key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

function normalizeWalletId(value, fallback = "cash") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  const spaced = String(value || "").trim().toLowerCase();
  const mapped = walletAliasMap[normalized] || walletAliasMap[spaced] || normalized;

  return walletPlatformIds.includes(mapped) ? mapped : fallback;
}

function isWalletValidated(walletId) {
  const id = normalizeWalletId(walletId);
  return !nonValidatedWalletIds.includes(id);
}

function createEmptyWalletBalanceMap() {
  return walletPlatformIds.reduce((acc, walletId) => {
    acc[walletId] = 0;
    return acc;
  }, {});
}

function getWalletImpactAmount(transaction) {
  return Number(transaction.nominal || 0) + Number(transaction.biaya_admin || 0);
}

function buildWalletBalanceMap(transactions = []) {
  const balances = createEmptyWalletBalanceMap();

  transactions.forEach((rawTransaction) => {
    const transaction = normalizeWalletTransaction(rawTransaction);
    const platform = normalizeWalletId(transaction.platform);
    const targetPlatform = transaction.platform_tujuan
      ? normalizeWalletId(transaction.platform_tujuan)
      : null;
    const nominal = Number(transaction.nominal || 0);
    const biayaAdmin = Number(transaction.biaya_admin || 0);
    const outgoing = nominal + biayaAdmin;
    const incoming = Math.max(nominal - biayaAdmin, 0);

    if (transaction.jenis === "masuk") {
      balances[platform] += incoming;
      return;
    }

    if (transaction.jenis === "keluar") {
      balances[platform] -= outgoing;
      return;
    }

    if (transaction.jenis === "tarik_tunai" || transaction.jenis === "transfer_antar") {
      balances[platform] -= outgoing;
      if (targetPlatform) {
        balances[targetPlatform] += incoming;
      }
    }
  });

  return balances;
}

function buildWalletCards(transactions = []) {
  const balances = buildWalletBalanceMap(transactions);

  return walletPlatformIds.map((walletId) => ({
    id: walletId,
    name: walletPlatformLabelMap[walletId] || walletId,
    type: walletPlatformTypeMap[walletId] || "validated",
    balance: balances[walletId] || 0,
  }));
}

function validateWalletBalance(walletId, amount, transactions = []) {
  const normalizedWalletId = normalizeWalletId(walletId);
  const safeAmount = Math.max(0, Number(amount || 0));

  if (!isWalletValidated(normalizedWalletId) || safeAmount <= 0) {
    return;
  }

  const balance = buildWalletBalanceMap(transactions)[normalizedWalletId] || 0;
  if (balance === 0 && safeAmount > 0) {
    throw new Error(
      "Saldo 0. Isi saldo manual terlebih dahulu agar transaksi dapat divalidasi."
    );
  }
  if (balance < safeAmount) {
    throw new Error(INSUFFICIENT_WALLET_BALANCE_MESSAGE);
  }
}

function normalizeProductCode(value) {
  return String(value || "").trim().toUpperCase();
}

function createGeneratedProductCode(name) {
  const compactName = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `RAJA-${compactName || "PRODUK"}-${suffix}`;
}

function normalizeProduct(product) {
  return {
    ...product,
    kode_produk: normalizeProductCode(product.kode_produk),
  };
}

function sanitizeImportedProduct(product) {
  return normalizeProduct({
    ...product,
    nama: String(product.nama || "").trim(),
    kategori: String(product.kategori || "").trim() || "Aksesoris Lainnya",
    stok: Math.max(0, Number(product.stok || 0)),
    stok_minimum: Math.max(0, Number(product.stok_minimum ?? 3)),
    harga_beli: Math.max(0, Number(product.harga_beli || 0)),
    harga_jual: Math.max(0, Number(product.harga_jual || 0)),
    satuan: String(product.satuan || "pcs").trim() || "pcs",
    aktif: product.aktif ?? true,
  });
}

function shouldResetLegacyDemoProducts(products) {
  if (!Array.isArray(products) || products.length === 0) {
    return true;
  }

  if (products.length > legacySeedProducts.length) {
    return false;
  }

  return products.every((product) => legacySeedCodes.has(normalizeProductCode(product.kode_produk)));
}

function loadDemoProducts() {
  const storedProducts = loadDemoState("raja-products-demo", null);

  if (shouldResetLegacyDemoProducts(storedProducts)) {
    localStorage.setItem("raja-products-demo", JSON.stringify(seedProducts));
    return seedProducts;
  }

  return storedProducts.map(normalizeProduct);
}

function normalizeStockLog(log) {
  return {
    ...log,
    tipe: log.tipe || "masuk",
    jumlah: Number(log.jumlah || 0),
    stok_sebelum:
      typeof log.stok_sebelum === "number" ? log.stok_sebelum : null,
    stok_sesudah:
      typeof log.stok_sesudah === "number" ? log.stok_sesudah : null,
    referensi: log.referensi || "",
    catatan: log.catatan || "",
  };
}

function normalizeDigitalTransaction(transaction) {
  return {
    ...transaction,
    jenis: transaction.jenis || "lainnya",
    nominal: Number(transaction.nominal || 0),
    harga_jual: Number(transaction.harga_jual || 0),
    modal: Number(transaction.modal || 0),
    keuntungan:
      typeof transaction.keuntungan === "number"
        ? transaction.keuntungan
        : Number(transaction.harga_jual || 0) - Number(transaction.modal || 0),
    provider: transaction.provider || "",
    nomor_tujuan: transaction.nomor_tujuan || "",
    nama_tujuan: transaction.nama_tujuan || "",
    platform_sumber: transaction.platform_sumber
      ? normalizeWalletId(transaction.platform_sumber)
      : null,
    catatan: transaction.catatan || "",
  };
}

function normalizeWalletTransaction(transaction) {
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
  };
}

function normalizeLogisticsTransaction(transaction) {
  const courier = transaction.courier || transaction.ekspedisi || "";
  const sender = transaction.sender || transaction.sender_name || "";
  const receiver = transaction.receiver || transaction.receiver_name || "";
  const destination = transaction.destination || "";
  const packageType = transaction.packageType || transaction.package_type || "Regular";
  const weight = Number(transaction.weight || 0);
  const price = Number(transaction.price ?? transaction.harga_jual ?? 0);
  const paymentMethod = transaction.paymentMethod || transaction.payment_method || transaction.platform_sumber;
  const normalizedPaymentMethod = paymentMethod ? normalizeWalletId(paymentMethod) : null;
  const modal = Number(transaction.modal || 0);

  return {
    ...transaction,
    type: transaction.type || "logistik",
    courier,
    ekspedisi: courier,
    sender,
    sender_name: sender,
    receiver,
    receiver_name: receiver,
    destination,
    packageType,
    package_type: packageType,
    weight,
    price,
    paymentMethod: normalizedPaymentMethod,
    payment_method: normalizedPaymentMethod,
    harga_jual: price,
    modal,
    keuntungan:
      typeof transaction.keuntungan === "number"
        ? transaction.keuntungan
        : price - modal,
    platform_sumber: normalizedPaymentMethod,
    date: transaction.date || transaction.created_at || seedNow,
    cashier: transaction.cashier || transaction.kasir_id || null,
    no_resi: transaction.no_resi || "",
    catatan: transaction.catatan || "",
  };
}

function normalizeCashEntry(entry) {
  return {
    ...entry,
    jenis: entry.jenis || "pengeluaran",
    kategori: entry.kategori || "lainnya",
    nominal: Number(entry.nominal || 0),
    keterangan: entry.keterangan || "",
    tanggal: entry.tanggal || todayDate,
  };
}

function getOptionalRows(result) {
  if (result.error?.code === "42P01") return [];
  if (result.error) throw result.error;
  return result.data || [];
}

function getAccessoryTransactionCost(transaction, products) {
  return (transaction.items || []).reduce((sum, item) => {
    const product = products.find((entry) => entry.id === item.produk_id);
    return sum + (product?.harga_beli || 0) * item.qty;
  }, 0);
}

function createPlatformSummarySeed() {
  return { masuk: 0, keluar: 0, biaya_admin: 0, saldo_bersih: 0 };
}

function applyWalletImpact(summary, platform, next) {
  summary[platform] ??= createPlatformSummarySeed();
  summary[platform].masuk += next.masuk || 0;
  summary[platform].keluar += next.keluar || 0;
  summary[platform].biaya_admin += next.biaya_admin || 0;
  summary[platform].saldo_bersih += next.saldo_bersih || 0;
}

function summarizeWalletPlatforms(transactions) {
  const balances = buildWalletBalanceMap(transactions);
  const summary = walletOverviewPlatforms.reduce((acc, platform) => {
    acc[platform] = createPlatformSummarySeed();
    acc[platform].saldo_bersih = balances[platform] || 0;
    return acc;
  }, {});

  transactions.forEach((transaction) => {
    const normalized = normalizeWalletTransaction(transaction);
    const platform = normalizeWalletId(normalized.platform);
    const targetPlatform = normalized.platform_tujuan
      ? normalizeWalletId(normalized.platform_tujuan)
      : null;
    const nominal = Number(normalized.nominal || 0);
    const biayaAdmin = Number(normalized.biaya_admin || 0);
    const outgoing = nominal + biayaAdmin;
    const incoming = Math.max(nominal - biayaAdmin, 0);

    if (normalized.jenis === "masuk") {
      applyWalletImpact(summary, platform, {
        masuk: incoming,
        biaya_admin: biayaAdmin,
      });
      return;
    }

    if (normalized.jenis === "keluar") {
      applyWalletImpact(summary, platform, {
        keluar: outgoing,
        biaya_admin: biayaAdmin,
      });
      return;
    }

    if (normalized.jenis === "tarik_tunai" || normalized.jenis === "transfer_antar") {
      applyWalletImpact(summary, platform, {
        keluar: outgoing,
        biaya_admin: biayaAdmin,
      });
      if (targetPlatform) {
        applyWalletImpact(summary, targetPlatform, {
          masuk: incoming,
        });
      }
    }
  });

  return walletOverviewPlatforms.map((platform) => ({
    platform,
    ...(summary[platform] || createPlatformSummarySeed()),
  }));
}

function summarizeLogisticsByCourier(transactions) {
  const grouped = {};

  transactions.forEach((transaction) => {
    const courier = transaction.courier || transaction.ekspedisi || "Lainnya";
    grouped[courier] ??= {
      ekspedisi: courier,
      jumlah_transaksi: 0,
      omzet: 0,
      modal: 0,
      keuntungan: 0,
    };

    grouped[courier].jumlah_transaksi += 1;
    grouped[courier].omzet += transaction.harga_jual;
    grouped[courier].modal += transaction.modal;
    grouped[courier].keuntungan +=
      transaction.keuntungan ?? transaction.harga_jual - transaction.modal;
  });

  return Object.values(grouped).sort((a, b) => b.keuntungan - a.keuntungan);
}

function enumerateDates(startDate, endDate) {
  const dates = [];
  const cursor = startOfDay(startDate);
  const limit = endOfDay(endDate);

  while (cursor <= limit) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function buildCashDailySummary(entries, startDate, endDate) {
  if (!startDate || !endDate) return [];

  const sortedEntries = [...entries].sort((a, b) => {
    const left = `${a.tanggal}T${a.created_at || ""}`;
    const right = `${b.tanggal}T${b.created_at || ""}`;
    return new Date(left) - new Date(right);
  });

  const grouped = sortedEntries.reduce((acc, entry) => {
    acc[entry.tanggal] ??= [];
    acc[entry.tanggal].push(entry);
    return acc;
  }, {});

  let runningBalance = sortedEntries
    .filter((entry) => new Date(entry.tanggal) < startOfDay(startDate))
    .reduce((sum, entry) => {
      return sum + (entry.jenis === "pemasukan" ? entry.nominal : -entry.nominal);
    }, 0);

  return enumerateDates(startDate, endDate).map((date) => {
    const tanggal = formatDateInput(date);
    const dayEntries = grouped[tanggal] || [];
    const tambahSaldo = dayEntries
      .filter(
        (entry) =>
          entry.jenis === "pemasukan" &&
          ["saldo_awal", "tambah_saldo"].includes(entry.kategori)
      )
      .map((entry) => entry.nominal)
      .slice(0, 4);
    const totalPemasukan = dayEntries
      .filter((entry) => entry.jenis === "pemasukan")
      .reduce((sum, entry) => sum + entry.nominal, 0);
    const totalPengeluaran = dayEntries
      .filter((entry) => entry.jenis === "pengeluaran")
      .reduce((sum, entry) => sum + entry.nominal, 0);
    const saldoAwal = runningBalance;
    const totalSaldo = saldoAwal + totalPemasukan;
    const sisaSaldo = totalSaldo - totalPengeluaran;

    runningBalance = sisaSaldo;

    return {
      tanggal,
      saldo_awal: saldoAwal,
      tambah_saldo: tambahSaldo,
      total_pemasukan: totalPemasukan,
      total_pengeluaran: totalPengeluaran,
      total_saldo: totalSaldo,
      sisa_saldo: sisaSaldo,
      entries: dayEntries,
    };
  });
}

function getTrendMode(startDate, endDate) {
  const diffDays =
    Math.max(1, Math.round((endOfDay(endDate) - startOfDay(startDate)) / 86400000) + 1);
  if (diffDays > 180) return "month";
  if (diffDays > 27) return "week";
  return "day";
}

function getWeekStart(value) {
  const date = startOfDay(value);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}

function getMonthStart(value) {
  const date = startOfDay(value);
  date.setDate(1);
  return date;
}

function getBucketStart(value, mode) {
  if (mode === "month") return getMonthStart(value);
  if (mode === "week") return getWeekStart(value);
  return startOfDay(value);
}

function getBucketKey(value, mode) {
  const date = getBucketStart(value, mode);
  if (mode === "month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  return formatDateInput(date);
}

function getBucketLabel(value, mode) {
  const date = getBucketStart(value, mode);
  if (mode === "month") {
    return formatDateTime(date, { month: "short" });
  }
  if (mode === "week") {
    return `Mg ${formatDateTime(date, { day: "2-digit", month: "short" })}`;
  }
  return formatDateTime(date, { day: "2-digit", month: "short" });
}

function buildTrendSeries({
  startDate,
  endDate,
  accessoryTransactions,
  digitalTransactions,
  logisticsTransactions,
  cashEntries,
  products,
}) {
  if (!startDate || !endDate) return [];

  const mode = getTrendMode(startDate, endDate);
  const seriesMap = {};

  enumerateDates(startDate, endDate).forEach((date) => {
    const key = getBucketKey(date, mode);
    seriesMap[key] ??= {
      key,
      label: getBucketLabel(date, mode),
      omzet: 0,
      pengeluaran: 0,
      laba_bersih: 0,
    };
  });

  accessoryTransactions.forEach((transaction) => {
    const key = getBucketKey(transaction.created_at, mode);
    const profit = transaction.total_bayar - getAccessoryTransactionCost(transaction, products);
    seriesMap[key].omzet += transaction.total_bayar;
    seriesMap[key].laba_bersih += profit;
  });

  digitalTransactions.forEach((transaction) => {
    const key = getBucketKey(transaction.created_at, mode);
    seriesMap[key].omzet += transaction.harga_jual;
    seriesMap[key].laba_bersih += transaction.keuntungan ?? transaction.harga_jual - transaction.modal;
  });

  logisticsTransactions.forEach((transaction) => {
    const key = getBucketKey(transaction.created_at, mode);
    seriesMap[key].omzet += transaction.harga_jual;
    seriesMap[key].laba_bersih += transaction.keuntungan ?? transaction.harga_jual - transaction.modal;
  });

  cashEntries
    .filter((entry) => entry.jenis === "pengeluaran")
    .forEach((entry) => {
      const key = getBucketKey(entry.tanggal, mode);
      seriesMap[key].pengeluaran += entry.nominal;
      seriesMap[key].laba_bersih -= entry.nominal;
    });

  return Object.values(seriesMap).sort((a, b) => new Date(a.key) - new Date(b.key));
}

export function DataProvider({ children }) {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [accessoryTransactions, setAccessoryTransactions] = useState([]);
  const [digitalTransactions, setDigitalTransactions] = useState([]);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [logisticsTransactions, setLogisticsTransactions] = useState([]);
  const [cashEntries, setCashEntries] = useState([]);
  const [stockLogs, setStockLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const dataMode = supabaseEnabled ? "supabase" : "demo";

  const persistDemo = useCallback((next) => {
    if (supabaseEnabled) return;
    localStorage.setItem("raja-products-demo", JSON.stringify(next.products));
    localStorage.setItem(
      "raja-accessory-transactions-demo",
      JSON.stringify(next.accessoryTransactions)
    );
    localStorage.setItem(
      "raja-digital-transactions-demo",
      JSON.stringify(next.digitalTransactions)
    );
    localStorage.setItem("raja-wallet-transactions-demo", JSON.stringify(next.walletTransactions));
    localStorage.setItem(
      "raja-logistics-transactions-demo",
      JSON.stringify(next.logisticsTransactions)
    );
    localStorage.setItem("raja-cash-entries-demo", JSON.stringify(next.cashEntries));
    localStorage.setItem("raja-stock-logs-demo", JSON.stringify(next.stockLogs));
  }, []);

  // Notifikasi stok rendah
  const checkLowStockNotifications = useCallback(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const lowStockProducts = products.filter(
      (product) => product.aktif && product.stok > 0 && product.stok <= product.stok_minimum
    );

    if (lowStockProducts.length > 0) {
      const notification = new Notification("Stok Rendah - Raja Aksesoris", {
        body: `${lowStockProducts.length} produk mendekati stok minimum. Cek halaman produk.`,
        tag: "low-stock",
      });

      notification.onclick = () => {
        window.focus();
        window.location.href = "/produk";
      };
    }
  }, [products]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (supabaseEnabled) {
        const [
          productRes,
          transaksiRes,
          itemRes,
          digitalRes,
          stockMutationRes,
          walletRes,
          logisticsRes,
          cashRes,
        ] = await Promise.all([
          supabase.from("produk").select("*").order("created_at", { ascending: false }),
          supabase.from("transaksi").select("*").order("created_at", { ascending: false }),
          supabase.from("item_transaksi").select("*"),
          supabase.from("transaksi_digital").select("*").order("created_at", { ascending: false }),
          supabase.from("stok_mutasi").select("*").order("created_at", { ascending: false }),
          supabase.from("transaksi_dompet").select("*").order("created_at", { ascending: false }),
          supabase.from("transaksi_logistik").select("*").order("created_at", { ascending: false }),
          supabase
            .from("kas")
            .select("*")
            .order("tanggal", { ascending: false })
            .order("created_at", { ascending: false }),
        ]);

        if (productRes.error) throw productRes.error;
        if (transaksiRes.error) throw transaksiRes.error;
        if (itemRes.error) throw itemRes.error;
        if (digitalRes.error) throw digitalRes.error;
        let stockRows = [];
        if (stockMutationRes.error?.code === "42P01") {
          const legacyStockRes = await supabase
            .from("stok_masuk")
            .select("*")
            .order("created_at", { ascending: false });
          if (legacyStockRes.error) throw legacyStockRes.error;
          stockRows = (legacyStockRes.data || []).map((log) =>
            normalizeStockLog({
              ...log,
              tipe: "masuk",
              catatan: "Migrasi dari stok masuk",
            })
          );
        } else if (stockMutationRes.error) {
          throw stockMutationRes.error;
        } else {
          stockRows = (stockMutationRes.data || []).map(normalizeStockLog);
        }

        const walletRows = getOptionalRows(walletRes).map(normalizeWalletTransaction);
        const logisticsRows = getOptionalRows(logisticsRes).map(normalizeLogisticsTransaction);
        const cashRows = getOptionalRows(cashRes).map(normalizeCashEntry);

        const itemsByTransaction = (itemRes.data || []).reduce((acc, item) => {
          acc[item.transaksi_id] ??= [];
          acc[item.transaksi_id].push(item);
          return acc;
        }, {});

        setProducts((productRes.data || []).map(normalizeProduct));
        setAccessoryTransactions(
          (transaksiRes.data || []).map((trx) => ({
            ...trx,
            items: itemsByTransaction[trx.id] || [],
          }))
        );
        setDigitalTransactions((digitalRes.data || []).map(normalizeDigitalTransaction));
        setWalletTransactions(walletRows);
        setLogisticsTransactions(logisticsRows);
        setCashEntries(cashRows);
        setStockLogs(stockRows);
      } else {
        setProducts(loadDemoProducts());
        setAccessoryTransactions(loadDemoState("raja-accessory-transactions-demo", []));
        setDigitalTransactions(
          loadDemoState("raja-digital-transactions-demo", seedDigitalTransactions).map(
            normalizeDigitalTransaction
          )
        );
        setWalletTransactions(
          loadDemoState("raja-wallet-transactions-demo", seedWalletTransactions).map(
            normalizeWalletTransaction
          )
        );
        setLogisticsTransactions(
          loadDemoState("raja-logistics-transactions-demo", seedLogisticsTransactions).map(
            normalizeLogisticsTransaction
          )
        );
        setCashEntries(
          loadDemoState("raja-cash-entries-demo", seedCashEntries).map(normalizeCashEntry)
        );
        setStockLogs(loadDemoState("raja-stock-logs-demo", []).map(normalizeStockLog));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Request permission notification
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Check notifikasi stok rendah saat data loaded
  useEffect(() => {
    if (!loading) {
      checkLowStockNotifications();
    }
  }, [loading, checkLowStockNotifications]);

  const categories = useMemo(
    () => [...new Set(products.map((item) => item.kategori).filter(Boolean))],
    [products]
  );

  const categoryGroups = useMemo(
    () => productCategoryGroups.map((group) => ({
      ...group,
      categories: group.categories.filter((name) => name && name.trim()),
    })),
    []
  );

  const walletBalances = useMemo(
    () => buildWalletCards(walletTransactions),
    [walletTransactions]
  );

  const createAccessoryTransaction = useCallback(
    async ({ items, metodeBayar, uangDiterima, catatan }) => {
      const todayCount = accessoryTransactions.filter(
        (trx) => formatDateKey(trx.created_at) === formatDateKey(new Date())
      ).length;
      const transactionId = crypto.randomUUID();
      const totalBayar = items.reduce((sum, item) => sum + item.subtotal, 0);
      const normalizedPaymentMethod = normalizeWalletId(metodeBayar);
      // Note: Accessory transactions do not validate wallet balance

      const finalUangDiterima = normalizedPaymentMethod === "cash" ? uangDiterima : totalBayar;
      const transaction = {
        id: transactionId,
        kasir_id: user?.id || null,
        no_transaksi: generateTransactionNumber("TRX", todayCount + 1),
        total_bayar: totalBayar,
        uang_diterima: finalUangDiterima,
        kembalian: normalizedPaymentMethod === "cash" ? finalUangDiterima - totalBayar : 0,
        metode_bayar: normalizedPaymentMethod,
        catatan: catatan || "",
        created_at: new Date().toISOString(),
        items: items.map((item) => ({
          id: crypto.randomUUID(),
          transaksi_id: transactionId,
          produk_id: item.id,
          nama_produk: item.nama,
          qty: item.qty,
          harga_satuan: item.harga_jual,
          subtotal: item.subtotal,
        })),
      };

      if (supabaseEnabled) {
        const { error: trxError } = await supabase.from("transaksi").insert({
          id: transaction.id,
          kasir_id: transaction.kasir_id,
          no_transaksi: transaction.no_transaksi,
          total_bayar: transaction.total_bayar,
          uang_diterima: transaction.uang_diterima,
          kembalian: transaction.kembalian,
          metode_bayar: transaction.metode_bayar,
          catatan: transaction.catatan,
        });
        if (trxError) throw trxError;

        const { error: itemError } = await supabase.from("item_transaksi").insert(transaction.items);
        if (itemError) throw itemError;

        for (const item of items) {
          const nextStock = Math.max(0, item.stok - item.qty);
          const { error } = await supabase
            .from("produk")
            .update({ stok: nextStock })
            .eq("id", item.id);
          if (error) throw error;
        }

        const stockMutations = items.map((item) => ({
          id: crypto.randomUUID(),
          produk_id: item.id,
          tipe: "keluar",
          jumlah: -item.qty,
          stok_sebelum: item.stok,
          stok_sesudah: Math.max(0, item.stok - item.qty),
          referensi: transaction.no_transaksi,
          catatan: "Penjualan aksesoris",
          created_at: transaction.created_at,
        }));

        if (stockMutations.length) {
          const { error: mutationError } = await supabase
            .from("stok_mutasi")
            .insert(stockMutations);
          if (mutationError && mutationError.code !== "42P01") {
            throw mutationError;
          }
        }

        await loadData();
        return transaction;
      }

      const nextProducts = products.map((product) => {
        const sold = items.find((item) => item.id === product.id);
        if (!sold) return product;
        return { ...product, stok: Math.max(0, product.stok - sold.qty) };
      });
      const nextAccessoryTransactions = [transaction, ...accessoryTransactions];
      const nextStockLogs = [
        ...items.map((item) =>
          normalizeStockLog({
            id: crypto.randomUUID(),
            produk_id: item.id,
            tipe: "keluar",
            jumlah: -item.qty,
            stok_sebelum: item.stok,
            stok_sesudah: Math.max(0, item.stok - item.qty),
            referensi: transaction.no_transaksi,
            catatan: "Penjualan aksesoris",
            created_at: transaction.created_at,
          })
        ),
        ...stockLogs,
      ];

      setProducts(nextProducts.map(normalizeProduct));
      setAccessoryTransactions(nextAccessoryTransactions);
      setStockLogs(nextStockLogs);
      persistDemo({
        products: nextProducts.map(normalizeProduct),
        accessoryTransactions: nextAccessoryTransactions,
        digitalTransactions,
        walletTransactions,
        logisticsTransactions,
        cashEntries,
        stockLogs: nextStockLogs,
      });
      return transaction;
    },
    [
      accessoryTransactions,
      cashEntries,
      digitalTransactions,
      loadData,
      logisticsTransactions,
      persistDemo,
      products,
      stockLogs,
      user?.id,
      walletTransactions,
    ]
  );

  const createDigitalTransaction = useCallback(
    async (payload) => {
      const todayCount = digitalTransactions.filter(
        (trx) => formatDateKey(trx.created_at) === formatDateKey(new Date())
      ).length;
      const transaction = normalizeDigitalTransaction({
        id: crypto.randomUUID(),
        kasir_id: user?.id || null,
        no_transaksi: generateTransactionNumber("LYN", todayCount + 1),
        ...payload,
        created_at: new Date().toISOString(),
      });
      const walletAmount = Number(transaction.modal || 0);
      const sourceWallet = transaction.platform_sumber
        ? normalizeWalletId(transaction.platform_sumber)
        : null;

      if (walletAmount > 0 && !sourceWallet) {
        throw new Error("Pilih sumber saldo toko.");
      }

      if (sourceWallet) {
        validateWalletBalance(sourceWallet, walletAmount, walletTransactions);
      }

      if (supabaseEnabled) {
        const { error } = await supabase.from("transaksi_digital").insert(transaction);
        if (
          error?.code === "PGRST204" ||
          error?.code === "42703" ||
          error?.message?.includes("platform_sumber") ||
          error?.message?.includes("nama_tujuan") ||
          error?.message?.includes("transfer_bank") ||
          error?.message?.includes("transfer_ewallet") ||
          error?.message?.includes("tarik_tunai")
        ) {
          throw new Error(
            "Migration layanan baru belum dijalankan di Supabase. Jalankan migration tambahan untuk transaksi_digital."
          );
        }
        if (error) throw error;
        await loadData();
        return transaction;
      }

      const nextDigitalTransactions = [transaction, ...digitalTransactions];
      setDigitalTransactions(nextDigitalTransactions);
      persistDemo({
        products,
        accessoryTransactions,
        digitalTransactions: nextDigitalTransactions,
        walletTransactions,
        logisticsTransactions,
        cashEntries,
        stockLogs,
      });
      return transaction;
    },
    [
      accessoryTransactions,
      cashEntries,
      digitalTransactions,
      loadData,
      logisticsTransactions,
      persistDemo,
      products,
      stockLogs,
      user?.id,
      walletTransactions,
    ]
  );

  const createWalletTransaction = useCallback(
    async (payload) => {
      const transaction = normalizeWalletTransaction({
        id: crypto.randomUUID(),
        kasir_id: user?.id || null,
        ...payload,
        created_at: new Date().toISOString(),
      });
      const nominal = Number(transaction.nominal || 0);
      const biayaAdmin = Number(transaction.biaya_admin || 0);

      if (!Number.isFinite(nominal) || nominal <= 0) {
        throw new Error("Nominal mutasi harus lebih besar dari 0.");
      }

      if (biayaAdmin < 0) {
        throw new Error("Biaya admin tidak boleh negatif.");
      }

      if (transaction.jenis === "masuk" && biayaAdmin > nominal) {
        throw new Error("Biaya admin tidak boleh lebih besar dari nominal masuk.");
      }

      if (transaction.jenis === "transfer_antar") {
        if (!transaction.platform_tujuan) {
          throw new Error("Pilih tujuan transfer wallet.");
        }
        if (transaction.platform === transaction.platform_tujuan) {
          throw new Error("Wallet asal dan tujuan tidak boleh sama.");
        }
      }

      if (transaction.jenis === "keluar" || transaction.jenis === "transfer_antar") {
        validateWalletBalance(transaction.platform, getWalletImpactAmount(transaction), walletTransactions);
      }

      if (supabaseEnabled) {
        const { error } = await supabase.from("transaksi_dompet").insert(transaction);
        if (error?.code === "42P01") {
          throw new Error("Migration POS v2 untuk tabel transaksi_dompet belum dijalankan.");
        }
        if (error) throw error;
        await loadData();
        return transaction;
      }

      const nextWalletTransactions = [transaction, ...walletTransactions];
      setWalletTransactions(nextWalletTransactions);
      persistDemo({
        products,
        accessoryTransactions,
        digitalTransactions,
        walletTransactions: nextWalletTransactions,
        logisticsTransactions,
        cashEntries,
        stockLogs,
      });
      return transaction;
    },
    [
      accessoryTransactions,
      cashEntries,
      digitalTransactions,
      loadData,
      logisticsTransactions,
      persistDemo,
      products,
      stockLogs,
      user?.id,
      walletTransactions,
    ]
  );

  const createLogisticsTransaction = useCallback(
    async (payload) => {
      const todayCount = logisticsTransactions.filter(
        (trx) => formatDateKey(trx.created_at) === formatDateKey(new Date())
      ).length;
      const transaction = normalizeLogisticsTransaction({
        id: crypto.randomUUID(),
        kasir_id: user?.id || null,
        no_transaksi: generateTransactionNumber("LOG", todayCount + 1),
        ...payload,
        created_at: new Date().toISOString(),
      });
      const walletAmount = Number(transaction.price || transaction.harga_jual || 0);
      const sourceWallet = transaction.paymentMethod || transaction.payment_method;

      if (!transaction.receiver.trim()) {
        throw new Error("Nama penerima wajib diisi.");
      }

      if (!transaction.destination.trim()) {
        throw new Error("Tujuan wajib diisi.");
      }

      if (transaction.weight <= 0) {
        throw new Error("Berat paket harus lebih besar dari 0.");
      }

      if (walletAmount <= 0) {
        throw new Error("Ongkir harus lebih besar dari 0.");
      }

      if (walletAmount > 0 && !sourceWallet) {
        throw new Error("Pilih metode pembayaran.");
      }

      if (sourceWallet) {
        validateWalletBalance(sourceWallet, walletAmount, walletTransactions);
      }

      if (supabaseEnabled) {
        const insertPayload = {
          id: transaction.id,
          kasir_id: transaction.kasir_id,
          no_transaksi: transaction.no_transaksi,
          ekspedisi: transaction.ekspedisi,
          harga_jual: transaction.harga_jual,
          modal: transaction.modal,
          no_resi: transaction.no_resi,
          catatan: transaction.catatan,
          created_at: transaction.created_at,
          type: transaction.type,
          sender_name: transaction.sender,
          receiver_name: transaction.receiver,
          destination: transaction.destination,
          package_type: transaction.packageType,
          weight: transaction.weight,
          price: transaction.price,
          payment_method: transaction.paymentMethod,
        };
        const { error } = await supabase.from("transaksi_logistik").insert(insertPayload);
        if (error?.code === "42P01") {
          throw new Error("Migration POS v2 untuk tabel transaksi_logistik belum dijalankan.");
        }
        if (
          error?.code === "PGRST204" ||
          error?.code === "42703" ||
          error?.message?.includes("type") ||
          error?.message?.includes("receiver_name") ||
          error?.message?.includes("payment_method")
        ) {
          throw new Error(
            "Migration logistik terbaru belum dijalankan di Supabase. Jalankan migration fitur logistik."
          );
        }
        if (error) throw error;
        await loadData();
        return transaction;
      }

      const nextLogisticsTransactions = [transaction, ...logisticsTransactions];
      setLogisticsTransactions(nextLogisticsTransactions);
      persistDemo({
        products,
        accessoryTransactions,
        digitalTransactions,
        walletTransactions,
        logisticsTransactions: nextLogisticsTransactions,
        cashEntries,
        stockLogs,
      });
      return transaction;
    },
    [
      accessoryTransactions,
      cashEntries,
      digitalTransactions,
      loadData,
      logisticsTransactions,
      persistDemo,
      products,
      stockLogs,
      user?.id,
      walletTransactions,
    ]
  );

  const createCashEntry = useCallback(
    async (payload) => {
      const entry = normalizeCashEntry({
        id: crypto.randomUUID(),
        kasir_id: user?.id || null,
        ...payload,
        tanggal: payload.tanggal || todayDate,
        created_at: new Date().toISOString(),
      });

      if (supabaseEnabled) {
        const { error } = await supabase.from("kas").insert(entry);
        if (error?.code === "42P01") {
          throw new Error("Migration POS v2 untuk tabel kas belum dijalankan.");
        }
        if (error) throw error;
        await loadData();
        return entry;
      }

      const nextCashEntries = [entry, ...cashEntries];
      setCashEntries(nextCashEntries);
      persistDemo({
        products,
        accessoryTransactions,
        digitalTransactions,
        walletTransactions,
        logisticsTransactions,
        cashEntries: nextCashEntries,
        stockLogs,
      });
      return entry;
    },
    [
      accessoryTransactions,
      cashEntries,
      digitalTransactions,
      loadData,
      logisticsTransactions,
      persistDemo,
      products,
      stockLogs,
      user?.id,
      walletTransactions,
    ]
  );

  const updateCashEntry = useCallback(
    async (id, payload) => {
      const nextEntry = normalizeCashEntry({ id, ...payload });

      if (supabaseEnabled) {
        const { error } = await supabase.from("kas").update(nextEntry).eq("id", id);
        if (error) throw error;
        await loadData();
        return;
      }

      const nextCashEntries = cashEntries.map((entry) =>
        entry.id === id ? { ...entry, ...nextEntry } : entry
      );
      setCashEntries(nextCashEntries);
      persistDemo({
        products,
        accessoryTransactions,
        digitalTransactions,
        walletTransactions,
        logisticsTransactions,
        cashEntries: nextCashEntries,
        stockLogs,
      });
    },
    [
      accessoryTransactions,
      cashEntries,
      digitalTransactions,
      loadData,
      logisticsTransactions,
      persistDemo,
      products,
      stockLogs,
      walletTransactions,
    ]
  );

  const deleteCashEntry = useCallback(
    async (id) => {
      if (supabaseEnabled) {
        const { error } = await supabase.from("kas").delete().eq("id", id);
        if (error) throw error;
        await loadData();
        return;
      }

      const nextCashEntries = cashEntries.filter((entry) => entry.id !== id);
      setCashEntries(nextCashEntries);
      persistDemo({
        products,
        accessoryTransactions,
        digitalTransactions,
        walletTransactions,
        logisticsTransactions,
        cashEntries: nextCashEntries,
        stockLogs,
      });
    },
    [
      accessoryTransactions,
      cashEntries,
      digitalTransactions,
      loadData,
      logisticsTransactions,
      persistDemo,
      products,
      stockLogs,
      walletTransactions,
    ]
  );

  const saveProduct = useCallback(
    async (payload) => {
      const existingProduct = payload.id
        ? products.find((item) => item.id === payload.id)
        : null;
      const productCode =
        normalizeProductCode(payload.kode_produk) ||
        existingProduct?.kode_produk ||
        createGeneratedProductCode(payload.nama);

      const product = {
        ...payload,
        kode_produk: productCode,
        harga_beli: Number(payload.harga_beli),
        harga_jual: Number(payload.harga_jual),
        stok: Number(payload.stok),
        stok_minimum: Number(payload.stok_minimum),
      };

      const duplicateCode = products.find(
        (item) =>
          normalizeProductCode(item.kode_produk) === product.kode_produk &&
          item.id !== product.id
      );
      if (duplicateCode) {
        throw new Error(`Kode produk ${product.kode_produk} sudah dipakai produk lain.`);
      }

      if (supabaseEnabled) {
        const query = product.id
          ? supabase.from("produk").update(product).eq("id", product.id)
          : supabase.from("produk").insert(product);
        const { error } = await query;
        if (error) throw error;
        await loadData();
        return;
      }

      const nextProducts = product.id
        ? products.map((item) => (item.id === product.id ? { ...item, ...product } : item))
        : [
            {
              ...product,
              id: crypto.randomUUID(),
              aktif: product.aktif ?? true,
              created_at: new Date().toISOString(),
            },
            ...products,
          ];

      setProducts(nextProducts.map(normalizeProduct));
      persistDemo({
        products: nextProducts.map(normalizeProduct),
        accessoryTransactions,
        digitalTransactions,
        walletTransactions,
        logisticsTransactions,
        cashEntries,
        stockLogs,
      });
    },
    [
      accessoryTransactions,
      cashEntries,
      digitalTransactions,
      loadData,
      logisticsTransactions,
      persistDemo,
      products,
      stockLogs,
      walletTransactions,
    ]
  );

  const importProducts = useCallback(
    async (payload) => {
      if (!payload?.length) {
        throw new Error("Belum ada produk valid untuk diimpor.");
      }

      const importedAt = new Date().toISOString();
      const existingByCode = new Map(
        products.map((product) => [normalizeProductCode(product.kode_produk), product])
      );

      const mergedProducts = payload.map((entry) => {
        const importedProduct = sanitizeImportedProduct(entry);
        if (!importedProduct.kode_produk) {
          throw new Error("Setiap produk impor wajib memiliki kode atau barcode.");
        }

        const existingProduct = existingByCode.get(importedProduct.kode_produk);
        return normalizeProduct({
          ...existingProduct,
          ...importedProduct,
          id: existingProduct?.id || crypto.randomUUID(),
          created_at: existingProduct?.created_at || importedAt,
          stok_minimum: Number.isFinite(Number(entry.stok_minimum))
            ? Math.max(0, Number(entry.stok_minimum))
            : existingProduct?.stok_minimum ?? 3,
          satuan: importedProduct.satuan || existingProduct?.satuan || "pcs",
          aktif:
            typeof entry.aktif === "boolean"
              ? entry.aktif
              : existingProduct?.aktif ?? importedProduct.aktif,
        });
      });

      const createdCount = mergedProducts.filter(
        (product) => !existingByCode.has(product.kode_produk)
      ).length;
      const updatedCount = mergedProducts.length - createdCount;

      if (supabaseEnabled) {
        for (let index = 0; index < mergedProducts.length; index += 200) {
          const chunk = mergedProducts.slice(index, index + 200).map((product) => ({
            id: product.id,
            kode_produk: product.kode_produk,
            nama: product.nama,
            kategori: product.kategori,
            stok: product.stok,
            stok_minimum: product.stok_minimum,
            harga_beli: product.harga_beli,
            harga_jual: product.harga_jual,
            satuan: product.satuan,
            aktif: product.aktif,
            created_at: product.created_at,
          }));

          const { error } = await supabase.from("produk").upsert(chunk);
          if (error) throw error;
        }

        await loadData();
        return {
          total: mergedProducts.length,
          created: createdCount,
          updated: updatedCount,
        };
      }

      const existingIds = new Set(products.map((product) => product.id));
      const nextProductsMap = new Map(
        mergedProducts.map((product) => [product.id, normalizeProduct(product)])
      );
      const nextProducts = [
        ...mergedProducts
          .filter((product) => !existingIds.has(product.id))
          .map((product) => normalizeProduct(product)),
        ...products.map((product) => nextProductsMap.get(product.id) || product),
      ];

      setProducts(nextProducts);
      persistDemo({
        products: nextProducts,
        accessoryTransactions,
        digitalTransactions,
        walletTransactions,
        logisticsTransactions,
        cashEntries,
        stockLogs,
      });

      return {
        total: mergedProducts.length,
        created: createdCount,
        updated: updatedCount,
      };
    },
    [
      accessoryTransactions,
      cashEntries,
      digitalTransactions,
      loadData,
      logisticsTransactions,
      persistDemo,
      products,
      stockLogs,
      walletTransactions,
    ]
  );

  const updateProductStatus = useCallback(
    async (id, aktif) => {
      if (supabaseEnabled) {
        const { error } = await supabase.from("produk").update({ aktif }).eq("id", id);
        if (error) throw error;
        await loadData();
        return;
      }

      const nextProducts = products.map((product) =>
        product.id === id ? { ...product, aktif } : product
      );
      setProducts(nextProducts.map(normalizeProduct));
      persistDemo({
        products: nextProducts.map(normalizeProduct),
        accessoryTransactions,
        digitalTransactions,
        walletTransactions,
        logisticsTransactions,
        cashEntries,
        stockLogs,
      });
    },
    [
      accessoryTransactions,
      cashEntries,
      digitalTransactions,
      loadData,
      logisticsTransactions,
      persistDemo,
      products,
      stockLogs,
      walletTransactions,
    ]
  );

  const saveStockMutation = useCallback(
    async ({ productId, tipe, jumlah, catatan, referensi }) => {
      const product = products.find((item) => item.id === productId);
      if (!product) throw new Error("Produk tidak ditemukan.");

      const rawJumlah = Number(jumlah);
      if (!Number.isFinite(rawJumlah) || rawJumlah === 0) {
        throw new Error("Jumlah mutasi harus diisi dan tidak boleh 0.");
      }

      const delta =
        tipe === "masuk" ? Math.abs(rawJumlah) : tipe === "keluar" ? -Math.abs(rawJumlah) : rawJumlah;
      const nextStock = product.stok + delta;
      if (nextStock < 0) {
        throw new Error("Stok tidak cukup untuk mutasi ini.");
      }

      const mutation = normalizeStockLog({
        id: crypto.randomUUID(),
        produk_id: productId,
        tipe,
        jumlah: delta,
        stok_sebelum: product.stok,
        stok_sesudah: nextStock,
        referensi: referensi || "",
        catatan: catatan || "",
        created_at: new Date().toISOString(),
      });

      if (supabaseEnabled) {
        const mutationProbe = await supabase.from("stok_mutasi").select("id").limit(1);
        const useLegacyIncomingTable =
          mutationProbe.error?.code === "42P01" && tipe === "masuk" && delta > 0;

        if (mutationProbe.error && !useLegacyIncomingTable) {
          throw new Error(
            mutationProbe.error.code === "42P01"
              ? "Migration stok mutasi belum dijalankan di Supabase."
              : mutationProbe.error.message
          );
        }

        const { error: updateError } = await supabase
          .from("produk")
          .update({ stok: nextStock })
          .eq("id", productId);
        if (updateError) throw updateError;

        const { error: mutationError } = useLegacyIncomingTable
          ? await supabase.from("stok_masuk").insert({
              id: mutation.id,
              produk_id: productId,
              jumlah: delta,
              created_at: mutation.created_at,
            })
          : await supabase.from("stok_mutasi").insert(mutation);

        if (mutationError?.code === "42P01" && tipe === "masuk" && delta > 0) {
          const { error: fallbackError } = await supabase.from("stok_masuk").insert({
            id: mutation.id,
            produk_id: productId,
            jumlah: delta,
            created_at: mutation.created_at,
          });
          if (fallbackError) throw fallbackError;
        } else if (mutationError) {
          throw mutationError;
        }

        await loadData();
        return mutation;
      }

      const nextProducts = products.map((item) =>
        item.id === productId ? { ...item, stok: nextStock } : item
      );
      const nextStockLogs = [mutation, ...stockLogs];
      setProducts(nextProducts.map(normalizeProduct));
      setStockLogs(nextStockLogs.map(normalizeStockLog));
      persistDemo({
        products: nextProducts.map(normalizeProduct),
        accessoryTransactions,
        digitalTransactions,
        walletTransactions,
        logisticsTransactions,
        cashEntries,
        stockLogs: nextStockLogs.map(normalizeStockLog),
      });
      return mutation;
    },
    [
      accessoryTransactions,
      cashEntries,
      digitalTransactions,
      loadData,
      logisticsTransactions,
      persistDemo,
      products,
      stockLogs,
      walletTransactions,
    ]
  );

  const addStock = useCallback(
    async (productId, jumlah) =>
      saveStockMutation({
        productId,
        tipe: "masuk",
        jumlah,
        catatan: "Stok masuk",
      }),
    [saveStockMutation]
  );

  const getDashboardSummary = useCallback(
    ({ startDate, endDate }) => {
      const filteredAccessoryTransactions = accessoryTransactions.filter((transaction) =>
        isDateInRange(transaction.created_at, startDate, endDate)
      );
      const filteredDigitalTransactions = digitalTransactions.filter((transaction) =>
        isDateInRange(transaction.created_at, startDate, endDate)
      );
      const filteredLogisticsTransactions = logisticsTransactions.filter((transaction) =>
        isDateInRange(transaction.created_at, startDate, endDate)
      );
      const filteredWalletTransactions = walletTransactions.filter((transaction) =>
        isDateInRange(transaction.created_at, startDate, endDate)
      );
      const filteredCashEntries = cashEntries.filter((entry) =>
        isDateInRange(entry.tanggal, startDate, endDate)
      );

      const accessoryMetrics = filteredAccessoryTransactions.reduce(
        (acc, transaction) => {
          const modal = getAccessoryTransactionCost(transaction, products);
          acc.omzet += transaction.total_bayar;
          acc.modal += modal;
          acc.keuntungan += transaction.total_bayar - modal;
          acc.transaksi += 1;
          acc.produkTerjual += (transaction.items || []).reduce((sum, item) => sum + item.qty, 0);
          return acc;
        },
        { omzet: 0, modal: 0, keuntungan: 0, transaksi: 0, produkTerjual: 0 }
      );

      const digitalMetrics = filteredDigitalTransactions.reduce(
        (acc, transaction) => {
          acc.omzet += transaction.harga_jual;
          acc.modal += transaction.modal;
          acc.keuntungan += transaction.keuntungan ?? transaction.harga_jual - transaction.modal;
          acc.transaksi += 1;
          return acc;
        },
        { omzet: 0, modal: 0, keuntungan: 0, transaksi: 0 }
      );

      const logisticsMetrics = filteredLogisticsTransactions.reduce(
        (acc, transaction) => {
          acc.omzet += transaction.harga_jual;
          acc.modal += transaction.modal;
          acc.keuntungan += transaction.keuntungan ?? transaction.harga_jual - transaction.modal;
          acc.transaksi += 1;
          return acc;
        },
        { omzet: 0, modal: 0, keuntungan: 0, transaksi: 0 }
      );

      const totalOmzet =
        accessoryMetrics.omzet + digitalMetrics.omzet + logisticsMetrics.omzet;
      const keuntunganKotor =
        accessoryMetrics.keuntungan + digitalMetrics.keuntungan + logisticsMetrics.keuntungan;
      const totalPengeluaranKas = filteredCashEntries
        .filter((entry) => entry.jenis === "pengeluaran")
        .reduce((sum, entry) => sum + entry.nominal, 0);

      const breakdown = [
        { key: "aksesoris", label: "Aksesoris", ...accessoryMetrics },
        { key: "digital", label: "Layanan", ...digitalMetrics },
        { key: "logistik", label: "Logistik", ...logisticsMetrics },
      ].map((item) => ({
        ...item,
        kontribusi: totalOmzet ? Math.round((item.omzet / totalOmzet) * 100) : 0,
      }));

      const topProductMap = {};
      filteredAccessoryTransactions.forEach((transaction) => {
        (transaction.items || []).forEach((item) => {
          topProductMap[item.nama_produk] = (topProductMap[item.nama_produk] || 0) + item.qty;
        });
      });

      const topProducts = Object.entries(topProductMap)
        .map(([nama, qty]) => ({ nama, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      return {
        omzet: totalOmzet,
        keuntunganKotor,
        totalPengeluaranKas,
        labaBersih: keuntunganKotor - totalPengeluaranKas,
        totalTransaksi:
          filteredAccessoryTransactions.length +
          filteredDigitalTransactions.length +
          filteredLogisticsTransactions.length +
          filteredWalletTransactions.length +
          filteredCashEntries.length,
        produkTerjual: accessoryMetrics.produkTerjual,
        breakdown,
        walletPlatformSummary: summarizeWalletPlatforms(filteredWalletTransactions),
        logisticsSummary: summarizeLogisticsByCourier(filteredLogisticsTransactions),
        cashDailySummary: buildCashDailySummary(cashEntries, startDate, endDate),
        trendSeries: buildTrendSeries({
          startDate,
          endDate,
          accessoryTransactions: filteredAccessoryTransactions,
          digitalTransactions: filteredDigitalTransactions,
          logisticsTransactions: filteredLogisticsTransactions,
          cashEntries: filteredCashEntries,
          products,
        }),
        topProducts,
        accessoryTransactions: filteredAccessoryTransactions,
        digitalTransactions: filteredDigitalTransactions,
        logisticsTransactions: filteredLogisticsTransactions,
        walletTransactions: filteredWalletTransactions,
        cashEntries: filteredCashEntries,
      };
    },
    [accessoryTransactions, cashEntries, digitalTransactions, logisticsTransactions, products, walletTransactions]
  );

  const value = useMemo(
    () => ({
      dataMode,
      loading,
      products,
      categories,
      categoryGroups,
      accessoryTransactions,
      digitalTransactions,
      walletTransactions,
      walletBalances,
      logisticsTransactions,
      cashEntries,
      stockLogs,
      stockMutations: stockLogs,
      loadData,
      createAccessoryTransaction,
      createDigitalTransaction,
      createWalletTransaction,
      createLogisticsTransaction,
      createCashEntry,
      updateCashEntry,
      deleteCashEntry,
      saveProduct,
      importProducts,
      updateProductStatus,
      addStock,
      saveStockMutation,
      getDashboardSummary,
    }),
    [
      accessoryTransactions,
      addStock,
      cashEntries,
      categories,
      categoryGroups,
      createAccessoryTransaction,
      createCashEntry,
      createDigitalTransaction,
      createLogisticsTransaction,
      createWalletTransaction,
      dataMode,
      deleteCashEntry,
      digitalTransactions,
      getDashboardSummary,
      importProducts,
      logisticsTransactions,
      loadData,
      loading,
      products,
      saveProduct,
      saveStockMutation,
      stockLogs,
      updateCashEntry,
      updateProductStatus,
      walletTransactions,
      walletBalances,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData harus dipakai di dalam DataProvider.");
  return context;
}
