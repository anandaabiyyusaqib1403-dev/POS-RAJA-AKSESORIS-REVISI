import { useMemo, useState } from "react";
import StatCard from "../components/StatCard";
import { useData } from "../contexts/DataContext";
import { serviceTypeLabelMap, walletPlatformLabelMap } from "../data/businessOptions";
import {
  downloadCsv,
  formatDateInput,
  formatDateTime,
  formatPlainNumber,
  formatRupiah,
  formatRupiahCsv,
  parseDateInput,
} from "../utils/format";

const periodOptions = [
  { value: "today", label: "Hari ini" },
  { value: "yesterday", label: "Kemarin" },
  { value: "7", label: "7 hari terakhir" },
  { value: "month", label: "Bulan ini" },
  { value: "lastMonth", label: "Bulan lalu" },
  { value: "year", label: "Tahun ini" },
  { value: "custom", label: "Custom" },
];

const monthNames = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function getMonthRange(year, month) {
  return {
    startDate: new Date(year, month - 1, 1),
    endDate: new Date(year, month, 0),
  };
}

function getYearRange(year) {
  return {
    startDate: new Date(year, 0, 1),
    endDate: new Date(year, 11, 31),
  };
}

function getPeriodRange(period, customRange, selectedYear, selectedMonth) {
  const today = new Date();

  if (period === "today") return { startDate: today, endDate: today };

  if (period === "yesterday") {
    const day = new Date(today);
    day.setDate(today.getDate() - 1);
    return { startDate: day, endDate: day };
  }

  if (period === "7") {
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 6);
    return { startDate, endDate: today };
  }

  if (period === "month") {
    return getMonthRange(today.getFullYear(), today.getMonth() + 1);
  }

  if (period === "lastMonth") {
    const target = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return getMonthRange(target.getFullYear(), target.getMonth() + 1);
  }

  if (period === "year") {
    return getYearRange(today.getFullYear());
  }

  if (period === "quick_month") {
    return getMonthRange(selectedYear, selectedMonth);
  }

  if (period === "quick_year") {
    return getYearRange(selectedYear);
  }

  return {
    startDate: parseDateInput(customRange.startDate),
    endDate: parseDateInput(customRange.endDate),
  };
}

function getPeriodLabel(period, range, selectedYear, selectedMonth) {
  if (period === "today") return "Hari ini";
  if (period === "yesterday") return "Kemarin";
  if (period === "7") return "7 hari terakhir";
  if (period === "year") return String(range.startDate.getFullYear());
  if (period === "quick_year") return `Tahun ${selectedYear}`;
  if (["month", "lastMonth", "quick_month"].includes(period)) {
    const monthIndex =
      period === "quick_month" ? selectedMonth - 1 : range.startDate.getMonth();
    const year = period === "quick_month" ? selectedYear : range.startDate.getFullYear();
    return `${monthNames[monthIndex]} ${year}`;
  }
  if (!range.startDate && !range.endDate) return "Semua periode";
  if (range.startDate && range.endDate) {
    return `${formatDateInput(range.startDate)} s.d. ${formatDateInput(range.endDate)}`;
  }
  if (range.startDate) return `Mulai ${formatDateInput(range.startDate)}`;
  return `Sampai ${formatDateInput(range.endDate)}`;
}

function slugifyLabel(value) {
  return String(value)
    .toLowerCase()
    .replaceAll(/[^\w\s-]/g, "")
    .trim()
    .replaceAll(/\s+/g, "-");
}

function TrendLineChart({ data }) {
  if (!data.length) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">Tren omzet</h3>
        <p className="mt-10 text-center text-sm text-slate-500">
          Belum ada data omzet pada periode ini.
        </p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((item) => item.omzet), 1);
  const points = data
    .map((item, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * 100;
      const y = 100 - (item.omzet / maxValue) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Tren omzet</h3>
          <p className="text-sm text-slate-500">Aksesoris + layanan + logistik</p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          {data.length} titik
        </span>
      </div>

      <svg viewBox="0 0 100 100" className="h-56 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="omzet-gradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke="#1e3a5f"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          points={points}
        />
        <polygon fill="url(#omzet-gradient)" points={`0,100 ${points} 100,100`} />
      </svg>

      <div
        className="mt-3 grid gap-1 text-center text-[11px] text-slate-500"
        style={{ gridTemplateColumns: `repeat(${Math.max(data.length, 1)}, minmax(0, 1fr))` }}
      >
        {data.map((item) => (
          <span key={item.key} className="truncate">
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProfitExpenseChart({ data }) {
  if (!data.length) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">Laba bersih vs pengeluaran</h3>
        <p className="mt-10 text-center text-sm text-slate-500">
          Belum ada data kas dan laba pada periode ini.
        </p>
      </div>
    );
  }

  const maxValue = Math.max(
    ...data.flatMap((item) => [Math.abs(item.laba_bersih), Math.abs(item.pengeluaran)]),
    1
  );

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900">Laba bersih vs pengeluaran</h3>
        <p className="text-sm text-slate-500">Per banding waktu dalam periode aktif</p>
      </div>

      <div className="flex h-56 items-end gap-3 overflow-x-auto pb-2">
        {data.map((item) => (
          <div key={item.key} className="flex min-w-[72px] flex-1 flex-col items-center gap-2">
            <div className="flex h-full items-end gap-2">
              <div className="flex flex-col items-center justify-end gap-2">
                <div
                  className={`w-5 rounded-t-full ${
                    item.laba_bersih >= 0 ? "bg-emerald-500" : "bg-red-400"
                  }`}
                  style={{
                    height: `${Math.max((Math.abs(item.laba_bersih) / maxValue) * 180, 6)}px`,
                  }}
                />
                <span className="text-[11px] font-semibold text-slate-500">L</span>
              </div>
              <div className="flex flex-col items-center justify-end gap-2">
                <div
                  className="w-5 rounded-t-full bg-amber-400"
                  style={{
                    height: `${Math.max((item.pengeluaran / maxValue) * 180, 6)}px`,
                  }}
                />
                <span className="text-[11px] font-semibold text-slate-500">P</span>
              </div>
            </div>
            <span className="text-center text-[11px] text-slate-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildWalletTotal(summaryRows) {
  return summaryRows.reduce(
    (acc, item) => {
      acc.masuk += item.masuk;
      acc.keluar += item.keluar;
      acc.biaya_admin += item.biaya_admin;
      acc.saldo_bersih += item.saldo_bersih;
      return acc;
    },
    { masuk: 0, keluar: 0, biaya_admin: 0, saldo_bersih: 0 }
  );
}

function buildLogisticsTotal(summaryRows) {
  return summaryRows.reduce(
    (acc, item) => {
      acc.jumlah_transaksi += item.jumlah_transaksi;
      acc.omzet += item.omzet;
      acc.modal += item.modal;
      acc.keuntungan += item.keuntungan;
      return acc;
    },
    { jumlah_transaksi: 0, omzet: 0, modal: 0, keuntungan: 0 }
  );
}

export default function Dashboard() {
  const {
    loading,
    accessoryTransactions,
    digitalTransactions,
    logisticsTransactions,
    walletTransactions,
    cashEntries,
    getDashboardSummary,
  } = useData();
  const today = new Date();
  const [period, setPeriod] = useState("today");
  const [customRange, setCustomRange] = useState({
    startDate: formatDateInput(today),
    endDate: formatDateInput(today),
  });
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);

  const yearOptions = useMemo(() => {
    const years = new Set([today.getFullYear()]);
    accessoryTransactions.forEach((transaction) =>
      years.add(new Date(transaction.created_at).getFullYear())
    );
    digitalTransactions.forEach((transaction) =>
      years.add(new Date(transaction.created_at).getFullYear())
    );
    logisticsTransactions.forEach((transaction) =>
      years.add(new Date(transaction.created_at).getFullYear())
    );
    walletTransactions.forEach((transaction) =>
      years.add(new Date(transaction.created_at).getFullYear())
    );
    cashEntries.forEach((entry) => years.add(parseDateInput(entry.tanggal).getFullYear()));
    return Array.from(years).sort((left, right) => right - left);
  }, [
    accessoryTransactions,
    cashEntries,
    digitalTransactions,
    logisticsTransactions,
    today,
    walletTransactions,
  ]);

  const range = useMemo(
    () => getPeriodRange(period, customRange, selectedYear, selectedMonth),
    [customRange, period, selectedMonth, selectedYear]
  );
  const summary = useMemo(() => getDashboardSummary(range), [getDashboardSummary, range]);
  const periodLabel = useMemo(
    () => getPeriodLabel(period, range, selectedYear, selectedMonth),
    [period, range, selectedMonth, selectedYear]
  );
  const walletTotal = useMemo(
    () => buildWalletTotal(summary.walletPlatformSummary),
    [summary.walletPlatformSummary]
  );
  const logisticsTotal = useMemo(
    () => buildLogisticsTotal(summary.logisticsSummary),
    [summary.logisticsSummary]
  );

  const exportReport = () => {
    const rows = [];
    const generatedAt = formatDateTime(new Date(), {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const accessoryDetailRows = summary.accessoryTransactions.flatMap((transaction) =>
      (transaction.items || []).map((item) => [
        formatDateTime(transaction.created_at, {
          dateStyle: "short",
          timeStyle: "short",
        }),
        transaction.no_transaksi,
        transaction.kasir_id || "",
        transaction.metode_bayar || "",
        item.nama_produk,
        item.qty,
        formatRupiahCsv(item.harga_satuan),
        formatRupiahCsv(item.subtotal),
        formatRupiahCsv(transaction.total_bayar),
      ])
    );

    rows.push(["Section 1 - Ringkasan Periode"]);
    rows.push(["Periode", periodLabel]);
    rows.push(["Mulai", range.startDate ? formatDateInput(range.startDate) : "-"]);
    rows.push(["Selesai", range.endDate ? formatDateInput(range.endDate) : "-"]);
    rows.push(["Digenerate", generatedAt]);
    rows.push(["Total Omzet", formatRupiahCsv(summary.omzet)]);
    rows.push(["Total Keuntungan Kotor", formatRupiahCsv(summary.keuntunganKotor)]);
    rows.push(["Total Pengeluaran Kas", formatRupiahCsv(summary.totalPengeluaranKas)]);
    rows.push(["Laba Bersih", formatRupiahCsv(summary.labaBersih)]);
    rows.push(["Total Transaksi", summary.totalTransaksi]);
    rows.push(["Produk Terjual", summary.produkTerjual]);
    rows.push([]);

    rows.push(["Section 2 - Breakdown Per Layanan"]);
    rows.push(["Layanan", "Omzet", "Modal", "Keuntungan", "Jumlah Transaksi", "Kontribusi"]);
    summary.breakdown.forEach((item) => {
      rows.push([
        item.label,
        formatRupiahCsv(item.omzet),
        formatRupiahCsv(item.modal),
        formatRupiahCsv(item.keuntungan),
        item.transaksi,
        `${item.kontribusi}%`,
      ]);
    });
    rows.push([]);

    rows.push(["Section 3 - Detail Transaksi Aksesoris"]);
    rows.push([
      "Waktu",
      "No. Transaksi",
      "Kasir ID",
      "Metode Bayar",
      "Produk",
      "Qty",
      "Harga Satuan",
      "Subtotal Item",
      "Total Transaksi",
    ]);
    accessoryDetailRows.forEach((row) => rows.push(row));
    rows.push([]);

    rows.push(["Section 4 - Detail Transaksi Layanan"]);
    rows.push([
      "Waktu",
      "No. Transaksi",
      "Jenis Layanan",
      "Provider / Bank / Platform",
      "Nomor Tujuan / Rekening / ID",
      "Nama Tujuan / Penerima",
      "Platform Sumber Toko",
      "Nominal",
      "Harga Jual",
      "Modal",
      "Keuntungan",
    ]);
    summary.digitalTransactions.forEach((transaction) => {
      rows.push([
        formatDateTime(transaction.created_at, { dateStyle: "short", timeStyle: "short" }),
        transaction.no_transaksi,
        serviceTypeLabelMap[transaction.jenis] || transaction.jenis,
        transaction.provider,
        transaction.nomor_tujuan,
        transaction.nama_tujuan || "",
        transaction.platform_sumber
          ? walletPlatformLabelMap[transaction.platform_sumber] || transaction.platform_sumber
          : "",
        formatRupiahCsv(transaction.nominal),
        formatRupiahCsv(transaction.harga_jual),
        formatRupiahCsv(transaction.modal),
        formatRupiahCsv(
          transaction.keuntungan ?? transaction.harga_jual - transaction.modal
        ),
      ]);
    });
    rows.push([]);

    rows.push(["Section 5 - Detail Transaksi Logistik"]);
    rows.push([
      "Waktu",
      "No. Transaksi",
      "Ekspedisi",
      "Harga Jual",
      "Modal",
      "Keuntungan",
      "No. Resi",
      "Catatan",
    ]);
    summary.logisticsTransactions.forEach((transaction) => {
      rows.push([
        formatDateTime(transaction.created_at, { dateStyle: "short", timeStyle: "short" }),
        transaction.no_transaksi,
        transaction.ekspedisi,
        formatRupiahCsv(transaction.harga_jual),
        formatRupiahCsv(transaction.modal),
        formatRupiahCsv(
          transaction.keuntungan ?? transaction.harga_jual - transaction.modal
        ),
        transaction.no_resi || "",
        transaction.catatan || "",
      ]);
    });
    rows.push([]);

    rows.push(["Section 6 - Rekap Dompet Per Platform"]);
    rows.push(["Platform", "Total Masuk", "Total Keluar", "Biaya Admin", "Saldo Bersih"]);
    summary.walletPlatformSummary.forEach((item) => {
      rows.push([
        walletPlatformLabelMap[item.platform] || item.platform,
        formatRupiahCsv(item.masuk),
        formatRupiahCsv(item.keluar),
        formatRupiahCsv(item.biaya_admin),
        formatRupiahCsv(item.saldo_bersih),
      ]);
    });
    rows.push([
      "TOTAL",
      formatRupiahCsv(walletTotal.masuk),
      formatRupiahCsv(walletTotal.keluar),
      formatRupiahCsv(walletTotal.biaya_admin),
      formatRupiahCsv(walletTotal.saldo_bersih),
    ]);
    rows.push([]);

    rows.push(["Section 7 - Detail Transaksi Dompet"]);
    rows.push([
      "Waktu",
      "Platform",
      "Jenis",
      "Platform Tujuan",
      "Nominal",
      "Biaya Admin",
      "Keterangan",
    ]);
    summary.walletTransactions.forEach((transaction) => {
      rows.push([
        formatDateTime(transaction.created_at, { dateStyle: "short", timeStyle: "short" }),
        walletPlatformLabelMap[transaction.platform] || transaction.platform,
        transaction.jenis,
        transaction.platform_tujuan
          ? walletPlatformLabelMap[transaction.platform_tujuan] || transaction.platform_tujuan
          : "",
        formatRupiahCsv(transaction.nominal),
        formatRupiahCsv(transaction.biaya_admin),
        transaction.keterangan || "",
      ]);
    });
    rows.push([]);

    rows.push(["Section 8 - Detail Kas"]);
    rows.push(["Tanggal", "Jenis", "Kategori", "Nominal", "Keterangan", "Created At"]);
    summary.cashEntries.forEach((entry) => {
      rows.push([
        entry.tanggal,
        entry.jenis,
        entry.kategori,
        formatRupiahCsv(entry.nominal),
        entry.keterangan || "",
        formatDateTime(entry.created_at, { dateStyle: "short", timeStyle: "short" }),
      ]);
    });
    rows.push([]);

    rows.push(["Section 9 - Top 5 Produk Terlaris"]);
    rows.push(["Nama Produk", "Qty"]);
    summary.topProducts.forEach((item) => {
      rows.push([item.nama, item.qty]);
    });

    downloadCsv(`laporan-raja-aksesoris-${slugifyLabel(periodLabel)}.csv`, rows);
  };

  if (loading) {
    return <div className="rounded-3xl bg-white p-8 text-slate-600">Memuat dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] bg-gradient-to-br from-[#1e3a5f] via-[#25486f] to-sky-500 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-100">
              Dashboard Laporan 2.0
            </p>
            <h2 className="mt-2 text-3xl font-black">Pusat analisis bisnis Raja Aksesoris</h2>
            <p className="mt-2 text-sm text-sky-50/90">
              {periodLabel} | Omzet gabungan aksesoris, layanan, logistik, plus rekap dompet
              internal dan kas harian.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPeriod(option.value)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  option.value === period
                    ? "bg-white text-[#1e3a5f]"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={exportReport}
              className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-200"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_auto]">
          {period === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="date"
                value={customRange.startDate}
                onChange={(event) =>
                  setCustomRange((prev) => ({ ...prev, startDate: event.target.value }))
                }
                className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white outline-none"
              />
              <input
                type="date"
                value={customRange.endDate}
                onChange={(event) =>
                  setCustomRange((prev) => ({ ...prev, endDate: event.target.value }))
                }
                className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white outline-none"
              />
            </div>
          ) : (
            <div className="hidden xl:block" />
          )}

          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(Number(event.target.value))}
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white outline-none"
            >
              {monthNames.map((month, index) => (
                <option key={month} value={index + 1} className="text-slate-900">
                  {month}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white outline-none"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year} className="text-slate-900">
                  {year}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setPeriod("quick_month")}
              className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/20"
            >
              Lihat Bulan
            </button>
            <button
              type="button"
              onClick={() => setPeriod("quick_year")}
              className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/20"
            >
              Lihat Tahun
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Total Omzet" value={summary.omzet} money />
        <StatCard title="Total Keuntungan Kotor" value={summary.keuntunganKotor} money />
        <StatCard title="Total Pengeluaran Kas" value={summary.totalPengeluaranKas} money />
        <StatCard title="Laba Bersih" value={summary.labaBersih} money />
        <StatCard title="Total Transaksi" value={formatPlainNumber(summary.totalTransaksi)} />
        <StatCard title="Produk Terjual" value={`${formatPlainNumber(summary.produkTerjual)} pcs`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <TrendLineChart data={summary.trendSeries} />
        <ProfitExpenseChart data={summary.trendSeries} />
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h3 className="text-2xl font-black text-[#1e3a5f]">Breakdown omzet per layanan</h3>
          <p className="mt-2 text-sm text-slate-500">
            Kontribusi aksesoris, layanan, dan logistik terhadap omzet periode aktif.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {summary.breakdown.map((item) => (
            <div key={item.key} className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-black text-[#1e3a5f]">
                    {formatRupiah(item.omzet)}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                  {item.kontribusi}%
                </span>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-[#1e3a5f]"
                  style={{ width: `${item.kontribusi}%` }}
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-slate-500">Modal</p>
                  <p className="font-semibold text-slate-900">{formatRupiah(item.modal)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Keuntungan</p>
                  <p className="font-semibold text-emerald-700">
                    {formatRupiah(item.keuntungan)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Jumlah transaksi</p>
                  <p className="font-semibold text-slate-900">{item.transaksi} trx</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-2xl font-black text-[#1e3a5f]">Rekap dompet internal per platform</h3>
          <p className="mt-2 text-sm text-slate-500">
            Posisi saldo bersih dihitung dari masuk, keluar, dan biaya admin.
          </p>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-3 py-2">Platform</th>
                  <th className="px-3 py-2 text-right">Total Masuk</th>
                  <th className="px-3 py-2 text-right">Total Keluar</th>
                  <th className="px-3 py-2 text-right">Biaya Admin</th>
                  <th className="px-3 py-2 text-right">Saldo Bersih</th>
                </tr>
              </thead>
              <tbody>
                {summary.walletPlatformSummary.map((item) => (
                  <tr key={item.platform} className="border-t border-slate-100">
                    <td className="px-3 py-3 font-semibold text-slate-900">
                      {walletPlatformLabelMap[item.platform] || item.platform}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatRupiah(item.masuk)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatRupiah(item.keluar)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatRupiah(item.biaya_admin)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">
                      {formatRupiah(item.saldo_bersih)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="px-3 py-3 font-bold text-slate-900">TOTAL</td>
                  <td className="px-3 py-3 text-right font-bold text-slate-900">
                    {formatRupiah(walletTotal.masuk)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-slate-900">
                    {formatRupiah(walletTotal.keluar)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-slate-900">
                    {formatRupiah(walletTotal.biaya_admin)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-slate-900">
                    {formatRupiah(walletTotal.saldo_bersih)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-2xl font-black text-[#1e3a5f]">Rekap logistik per ekspedisi</h3>
          <p className="mt-2 text-sm text-slate-500">
            Bandingkan omzet, modal, dan margin masing-masing ekspedisi.
          </p>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-3 py-2">Ekspedisi</th>
                  <th className="px-3 py-2 text-right">Jml Transaksi</th>
                  <th className="px-3 py-2 text-right">Omzet</th>
                  <th className="px-3 py-2 text-right">Modal</th>
                  <th className="px-3 py-2 text-right">Keuntungan</th>
                </tr>
              </thead>
              <tbody>
                {summary.logisticsSummary.map((item) => (
                  <tr key={item.ekspedisi} className="border-t border-slate-100">
                    <td className="px-3 py-3 font-semibold text-slate-900">{item.ekspedisi}</td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {item.jumlah_transaksi}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatRupiah(item.omzet)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatRupiah(item.modal)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-emerald-700">
                      {formatRupiah(item.keuntungan)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="px-3 py-3 font-bold text-slate-900">TOTAL</td>
                  <td className="px-3 py-3 text-right font-bold text-slate-900">
                    {logisticsTotal.jumlah_transaksi}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-slate-900">
                    {formatRupiah(logisticsTotal.omzet)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-slate-900">
                    {formatRupiah(logisticsTotal.modal)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-emerald-700">
                    {formatRupiah(logisticsTotal.keuntungan)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-2xl font-black text-[#1e3a5f]">Laporan kas harian</h3>
          <p className="mt-2 text-sm text-slate-500">
            Saldo awal, pemasukan, pengeluaran, dan sisa saldo per hari dalam periode aktif.
          </p>

          <div className="mt-5 max-h-[420px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-white text-slate-500">
                <tr>
                  <th className="px-3 py-2">Tanggal</th>
                  <th className="px-3 py-2 text-right">Saldo Awal</th>
                  <th className="px-3 py-2 text-right">Total Pemasukan</th>
                  <th className="px-3 py-2 text-right">Total Pengeluaran</th>
                  <th className="px-3 py-2 text-right">Sisa Saldo</th>
                </tr>
              </thead>
              <tbody>
                {summary.cashDailySummary.map((item) => (
                  <tr key={item.tanggal} className="border-t border-slate-100">
                    <td className="px-3 py-3 font-semibold text-slate-900">{item.tanggal}</td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatRupiah(item.saldo_awal)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatRupiah(item.total_pemasukan)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatRupiah(item.total_pengeluaran)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">
                      {formatRupiah(item.sisa_saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-2xl font-black text-[#1e3a5f]">Top 5 produk terlaris</h3>
          <p className="mt-2 text-sm text-slate-500">
            Produk aksesoris dengan jumlah penjualan tertinggi pada periode aktif.
          </p>

          <div className="mt-5 space-y-3">
            {summary.topProducts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
                Belum ada penjualan aksesoris untuk periode ini.
              </div>
            ) : (
              summary.topProducts.map((item, index) => (
                <div
                  key={item.nama}
                  className="flex items-center justify-between rounded-[24px] bg-slate-50 px-4 py-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1e3a5f] text-sm font-bold text-white">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-900">{item.nama}</p>
                      <p className="text-xs text-slate-500">Produk aksesoris</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-slate-600">{item.qty} pcs</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
