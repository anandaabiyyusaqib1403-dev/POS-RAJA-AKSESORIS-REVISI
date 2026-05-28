import { parseDateInput } from "../../../utils/format";

export function normalizeDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date, days) {
  const nextDate = normalizeDate(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function getDashboardRange(period, customRange) {
  const today = normalizeDate(new Date());

  if (period === "today") {
    return { startDate: today, endDate: today };
  }

  if (period === "7") {
    return { startDate: addDays(today, -6), endDate: today };
  }

  if (period === "30") {
    return { startDate: addDays(today, -29), endDate: today };
  }

  return {
    startDate: parseDateInput(customRange.startDate),
    endDate: parseDateInput(customRange.endDate),
  };
}

export function getPreviousRange(range) {
  const startDate = normalizeDate(range.startDate);
  const endDate = normalizeDate(range.endDate);
  const spanDays = Math.max(
    1,
    Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1
  );
  const previousEnd = addDays(startDate, -1);
  const previousStart = addDays(previousEnd, -(spanDays - 1));

  return { startDate: previousStart, endDate: previousEnd };
}

export function formatCount(value) {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function getComparisonLabel(period) {
  return period === "today" ? "kemarin" : "periode sebelumnya";
}

export function getMetricComparison(currentValue, previousValue, formatter, comparisonLabel) {
  const current = Number(currentValue || 0);
  const previous = Number(previousValue || 0);
  const diff = current - previous;

  if (diff === 0) {
    return {
      tone: "neutral",
      label: "Stabil",
      detail: previous ? `Tidak berubah vs ${comparisonLabel}` : `Belum ada data ${comparisonLabel}`,
    };
  }

  const isUp = diff > 0;
  const percent = previous
    ? ` ${Math.round((Math.abs(diff) / Math.abs(previous)) * 100)}%`
    : "";

  return {
    tone: isUp ? "up" : "down",
    label: `${isUp ? "Naik" : "Turun"}${percent}`,
    detail: `${isUp ? "+" : "-"}${formatter(Math.abs(diff))} vs ${comparisonLabel}`,
  };
}

export function getTrendTextClass(tone) {
  if (tone === "up") return "text-emerald-700";
  if (tone === "down") return "text-red-700";
  return "text-slate-500";
}

export function isActiveProduct(product) {
  return product.aktif && product.status !== "deleted";
}

export function isLowStockProduct(product) {
  const stock = Number(product.stok || 0);
  const minimum = Math.max(Number(product.stok_minimum ?? 0), 1);
  return stock <= minimum;
}

export function buildOperationalInsights({
  summary,
  lowStockProducts,
  criticalWallets,
  shiftDifferenceAlerts,
  pendingReturnCount,
}) {
  const insights = [];
  const trendSeries = summary?.trendSeries || [];
  const lastTrend = trendSeries.at(-1);
  const previousTrend = trendSeries.at(-2);
  const revenueDrop =
    lastTrend && previousTrend && Number(previousTrend.omzet || 0) > 0
      ? ((Number(lastTrend.omzet || 0) - Number(previousTrend.omzet || 0)) /
          Number(previousTrend.omzet || 0)) *
        100
      : 0;

  if (lowStockProducts.length) {
    const critical = lowStockProducts.filter((product) => Number(product.stok || 0) <= 0).length;
    insights.push({
      tone: critical ? "danger" : "warning",
      title: "Anomali stok menipis",
      detail: `${lowStockProducts.length} produk berada di batas minimum; ${critical} produk sudah habis.`,
    });
  }

  if (revenueDrop <= -20) {
    insights.push({
      tone: "danger",
      title: "Omzet turun tajam",
      detail: `Omzet hari terakhir turun ${Math.abs(Math.round(revenueDrop))}% dibanding titik sebelumnya. Cek produk utama dan shift aktif.`,
    });
  }

  if (shiftDifferenceAlerts.length) {
    insights.push({
      tone: "danger",
      title: "Aktivitas kasir perlu audit",
      detail: `${shiftDifferenceAlerts.length} shift memiliki selisih kas besar. Review closing dan otorisasi PIN.`,
    });
  }

  if (criticalWallets.length) {
    insights.push({
      tone: "warning",
      title: "Saldo digital berisiko",
      detail: `${criticalWallets.length} wallet layanan digital kosong atau minus. Top up sebelum transaksi ramai.`,
    });
  }

  if (pendingReturnCount > 0) {
    insights.push({
      tone: "info",
      title: "Retur bisa menahan profit",
      detail: `${pendingReturnCount} retur belum selesai. Finalisasi agar stok dan laporan margin tetap bersih.`,
    });
  }

  if (!insights.length) {
    insights.push({
      tone: "success",
      title: "Operasional stabil",
      detail: "Tidak ada pola stok, saldo, shift, atau retur yang membutuhkan tindakan cepat.",
    });
  }

  return insights;
}
