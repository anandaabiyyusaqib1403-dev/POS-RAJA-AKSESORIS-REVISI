import { formatDateTime } from "../../../utils/format";

function normalizeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function getProductSupplier(product) {
  return (
    product.supplier ||
    product.supplier_name ||
    product.nama_supplier ||
    product.pemasok ||
    "Supplier belum diisi"
  );
}

export function getLastSoldLabel(value) {
  if (!value) return "Belum pernah laku";
  return formatDateTime(value, { dateStyle: "medium" });
}

function classifyAbc(rows) {
  const totalOmzet = rows.reduce((sum, row) => sum + row.omzet, 0);
  let running = 0;

  return [...rows]
    .sort((left, right) => right.omzet - left.omzet)
    .map((row) => {
      running += row.omzet;
      const cumulative = totalOmzet ? (running / totalOmzet) * 100 : 0;
      const abcClass = cumulative <= 80 ? "A" : cumulative <= 95 ? "B" : "C";
      return { ...row, cumulative, abcClass };
    });
}

export function buildProductPerformance(products = [], transactions = []) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const rowsByProduct = new Map();

  products.forEach((product) => {
    rowsByProduct.set(product.id, {
      id: product.id,
      kode: product.kode_produk || "-",
      nama: product.nama,
      kategori: product.kategori,
      supplier: getProductSupplier(product),
      stok: normalizeNumber(product.stok),
      modalSatuan: normalizeNumber(product.harga_beli),
      hargaJualSatuan: normalizeNumber(product.harga_jual),
      qty: 0,
      omzet: 0,
      modal: 0,
      profit: 0,
      marginPercent: 0,
      lastSoldAt: null,
    });
  });

  transactions.forEach((transaction) => {
    (transaction.items || []).forEach((item) => {
      const product = productMap.get(item.produk_id);
      const key = product?.id || item.produk_id || item.nama_produk;
      const qty = normalizeNumber(item.qty);
      const subtotal = normalizeNumber(item.subtotal || qty * normalizeNumber(item.harga_satuan));
      const modal = normalizeNumber(product?.harga_beli) * qty;

      if (!rowsByProduct.has(key)) {
        rowsByProduct.set(key, {
          id: key,
          kode: product?.kode_produk || "-",
          nama: item.nama_produk || product?.nama || "Produk",
          kategori: product?.kategori || "Tanpa kategori",
          supplier: product ? getProductSupplier(product) : "Supplier belum diisi",
          stok: normalizeNumber(product?.stok),
          modalSatuan: normalizeNumber(product?.harga_beli),
          hargaJualSatuan: normalizeNumber(item.harga_satuan || product?.harga_jual),
          qty: 0,
          omzet: 0,
          modal: 0,
          profit: 0,
          marginPercent: 0,
          lastSoldAt: null,
        });
      }

      const row = rowsByProduct.get(key);
      row.qty += qty;
      row.omzet += subtotal;
      row.modal += modal;
      row.profit += subtotal - modal;
      row.lastSoldAt =
        !row.lastSoldAt || new Date(transaction.created_at) > new Date(row.lastSoldAt)
          ? transaction.created_at
          : row.lastSoldAt;
    });
  });

  return [...rowsByProduct.values()].map((row) => ({
    ...row,
    marginPercent: row.omzet ? (row.profit / row.omzet) * 100 : 0,
  }));
}

function buildSlowMovingRows(productRows) {
  const limit = Date.now() - 60 * 24 * 60 * 60 * 1000;

  return productRows
    .filter((row) => row.stok > 0 && (!row.lastSoldAt || new Date(row.lastSoldAt).getTime() < limit))
    .sort((left, right) => right.stok * right.modalSatuan - left.stok * left.modalSatuan)
    .slice(0, 12);
}

function buildSupplierRows(productRows) {
  const grouped = new Map();

  productRows.forEach((row) => {
    const current = grouped.get(row.supplier) || {
      supplier: row.supplier,
      produk: 0,
      qty: 0,
      omzet: 0,
      profit: 0,
      marginPercent: 0,
    };

    current.produk += 1;
    current.qty += row.qty;
    current.omzet += row.omzet;
    current.profit += row.profit;
    grouped.set(row.supplier, current);
  });

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      marginPercent: row.omzet ? (row.profit / row.omzet) * 100 : 0,
    }))
    .sort((left, right) => right.marginPercent - left.marginPercent)
    .slice(0, 10);
}

function buildSummary(productRows, slowMovingRows, abcRows) {
  const totalProfit = productRows.reduce((sum, row) => sum + row.profit, 0);
  const totalOmzet = productRows.reduce((sum, row) => sum + row.omzet, 0);

  return {
    totalProfit,
    avgMargin: totalOmzet ? (totalProfit / totalOmzet) * 100 : 0,
    slowMoving: slowMovingRows.length,
    classA: abcRows.filter((row) => row.abcClass === "A").length,
  };
}

function buildOperationalInsights({ profitRows, slowMovingRows, supplierRows, summary }) {
  const insights = [];
  const topProduct = profitRows[0];
  const highestStockRisk = slowMovingRows[0];
  const topSupplier = supplierRows[0];

  if (topProduct?.profit > 0) {
    insights.push({
      tone: "success",
      title: "Prioritaskan produk laba tinggi",
      detail: `${topProduct.nama} sedang menjadi kontributor laba teratas. Pastikan stok dan etalase tetap aman.`,
    });
  }

  if (highestStockRisk) {
    insights.push({
      tone: "warning",
      title: "Modal tertahan di stok lambat",
      detail: `${highestStockRisk.nama} punya nilai stok tertahan terbesar. Pertimbangkan paket penjualan atau promo ringan.`,
    });
  }

  if (topSupplier?.produk) {
    insights.push({
      tone: "info",
      title: "Pemasok paling efisien",
      detail: `${topSupplier.supplier} mencatat margin ${topSupplier.marginPercent.toFixed(1)}% dari ${topSupplier.produk} produk.`,
    });
  }

  if (summary.avgMargin < 12 && profitRows.length) {
    insights.push({
      tone: "danger",
      title: "Margin rata-rata perlu dijaga",
      detail: "Margin produk rendah. Audit harga beli, harga jual, dan diskon manual sebelum restock besar.",
    });
  }

  return insights.slice(0, 4);
}

export function buildBusinessAnalytics(products = [], transactions = []) {
  const productRows = buildProductPerformance(products, transactions);
  const abcRows = classifyAbc(productRows.filter((row) => row.omzet > 0));
  const profitRows = [...productRows]
    .sort((left, right) => right.profit - left.profit)
    .slice(0, 12);
  const slowMovingRows = buildSlowMovingRows(productRows);
  const supplierRows = buildSupplierRows(productRows);
  const summary = buildSummary(productRows, slowMovingRows, abcRows);

  return {
    productRows,
    abcRows,
    profitRows,
    slowMovingRows,
    supplierRows,
    summary,
    insights: buildOperationalInsights({ profitRows, slowMovingRows, supplierRows, summary }),
  };
}

export function getBusinessAnalyticsRows(analytics, view) {
  if (view === "slow") return analytics.slowMovingRows;
  if (view === "abc") return analytics.abcRows.slice(0, 12);
  return analytics.profitRows;
}
