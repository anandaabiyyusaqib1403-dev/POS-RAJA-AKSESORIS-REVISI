import {
  endOfDay,
  formatDateInput,
  startOfDay,
} from "../../../utils/format";

export function getAccessoryTransactionCost(transaction: Record<string, any>, products: Record<string, any>[]) {
  return (transaction.items || []).reduce((sum: number, item: Record<string, any>) => {
    const product = products.find((entry) => entry.id === item.produk_id);
    const snapshotCost = Number(item.cost ?? item.cost_total ?? item.modal);
    if (Number.isFinite(snapshotCost) && snapshotCost > 0) {
      return sum + snapshotCost;
    }
    return sum + (product?.harga_beli || 0) * item.qty;
  }, 0);
}

export function summarizeLogisticsByCourier(transactions: Record<string, any>[]) {
  const grouped: Record<string, any> = {};

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

  return Object.values(grouped).sort((a: any, b: any) => b.keuntungan - a.keuntungan);
}

function enumerateDates(startDate: string | Date, endDate: string | Date) {
  const dates = [];
  const cursor = startOfDay(startDate);
  const limit = endOfDay(endDate);

  while (cursor <= limit) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function buildCashDailySummary(
  entries: Record<string, any>[],
  startDate: string | Date,
  endDate: string | Date
) {
  if (!startDate || !endDate) return [];

  const sortedEntries = [...entries].sort((a, b) => {
    const left = `${a.tanggal}T${a.created_at || ""}`;
    const right = `${b.tanggal}T${b.created_at || ""}`;
    return new Date(left).getTime() - new Date(right).getTime();
  });

  const grouped = sortedEntries.reduce<Record<string, Record<string, any>[]>>((acc, entry) => {
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

function getTrendMode(startDate: string | Date, endDate: string | Date) {
  const diffDays =
    Math.max(1, Math.round((endOfDay(endDate).getTime() - startOfDay(startDate).getTime()) / 86400000) + 1);
  if (diffDays > 120) return "month";
  if (diffDays > 45) return "week";
  return "day";
}

function getWeekStart(value: string | Date) {
  const date = startOfDay(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function getMonthStart(value: string | Date) {
  const date = startOfDay(value);
  date.setDate(1);
  return date;
}

function getBucketStart(value: string | Date, mode: string) {
  if (mode === "month") return getMonthStart(value);
  if (mode === "week") return getWeekStart(value);
  return startOfDay(value);
}

function getBucketKey(value: string | Date, mode: string) {
  return formatDateInput(getBucketStart(value, mode));
}

function getBucketLabel(value: string | Date, mode: string) {
  const date = getBucketStart(value, mode);
  if (mode === "month") {
    return date.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
  }
  if (mode === "week") {
    return `Minggu ${date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}`;
  }
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

export function buildTrendSeries({
  startDate,
  endDate,
  accessoryTransactions = [],
  digitalTransactions = [],
  logisticsTransactions = [],
  cashEntries = [],
  products = [],
}: Record<string, any>) {
  if (!startDate || !endDate) return [];

  const mode = getTrendMode(startDate, endDate);
  const seriesMap = enumerateDates(startDate, endDate).reduce<Record<string, any>>((acc, date) => {
    const key = getBucketKey(date, mode);
    acc[key] ??= {
      key,
      label: getBucketLabel(date, mode),
      omzet: 0,
      laba_bersih: 0,
      pengeluaran: 0,
    };
    return acc;
  }, {});

  accessoryTransactions.forEach((transaction: Record<string, any>) => {
    const key = getBucketKey(transaction.created_at, mode);
    const profit = transaction.total_bayar - getAccessoryTransactionCost(transaction, products);
    seriesMap[key].omzet += transaction.total_bayar;
    seriesMap[key].laba_bersih += profit;
  });

  digitalTransactions.forEach((transaction: Record<string, any>) => {
    const key = getBucketKey(transaction.created_at, mode);
    seriesMap[key].omzet += transaction.harga_jual;
    seriesMap[key].laba_bersih += transaction.keuntungan ?? transaction.harga_jual - transaction.modal;
  });

  logisticsTransactions.forEach((transaction: Record<string, any>) => {
    const key = getBucketKey(transaction.created_at, mode);
    seriesMap[key].omzet += transaction.harga_jual;
    seriesMap[key].laba_bersih += transaction.keuntungan ?? transaction.harga_jual - transaction.modal;
  });

  cashEntries
    .filter((entry: Record<string, any>) => entry.jenis === "pengeluaran")
    .forEach((entry: Record<string, any>) => {
      const key = getBucketKey(entry.tanggal, mode);
      seriesMap[key].pengeluaran += entry.nominal;
      seriesMap[key].laba_bersih -= entry.nominal;
    });

  return Object.values(seriesMap).sort(
    (a: any, b: any) => new Date(a.key).getTime() - new Date(b.key).getTime()
  );
}
