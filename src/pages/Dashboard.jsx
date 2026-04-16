import { useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { useData } from "../contexts/DataContext";
import { formatDateInput, formatRupiah, parseDateInput, formatDisplayDate } from "../utils/format";

const MetricCard = ({ label, value, accent }) => (
  <Card className="hover:border-[#D4AF37]/30 transition-colors">
    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
    <p className={`mt-2 text-3xl font-black ${accent === 'success' ? 'text-emerald-500' : 'text-[var(--brand-gold)]'}`}>
      {value}
    </p>
  </Card>
);

function getRange(period, customRange) {
  const today = new Date();

  if (period === "today") return { startDate: today, endDate: today };
  if (period === "7") {
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 6);
    return { startDate, endDate: today };
  }
  if (period === "30") {
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 29);
    return { startDate, endDate: today };
  }

  return {
    startDate: parseDateInput(customRange.startDate),
    endDate: parseDateInput(customRange.endDate),
  };
}

function TrendBars({ data }) {
  if (!data.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-16 text-center text-sm text-slate-500">
        Belum ada data tren penjualan pada periode ini.
      </div>
    );
  }

  const maxValue = Math.max(...data.map((item) => item.omzet), 1);

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      {data.map((item) => (
        <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex h-36 items-end">
            <div
              className="w-full rounded-t-2xl bg-[var(--brand-gold)]"
              style={{ height: `${Math.max((item.omzet / maxValue) * 144, 12)}px` }}
            />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-950">{item.label}</p>
          <p className="mt-1 text-xs text-slate-500">{formatRupiah(item.omzet)}</p>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { loading, getDashboardSummary } = useData();
  const [period, setPeriod] = useState("today");
  const [customRange, setCustomRange] = useState({
    startDate: formatDateInput(new Date()),
    endDate: formatDateInput(new Date()),
  });

  const range = useMemo(() => getRange(period, customRange), [customRange, period]);
  const summary = useMemo(() => getDashboardSummary(range), [getDashboardSummary, range]);

  if (loading) {
    return <div className="text-slate-400 animate-pulse">Memuat dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-100">Overview</h2>
          <p className="text-sm text-slate-500">Pemantauan operasional {formatDisplayDate(new Date())}</p>
        </div>
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
          {["today", "7", "30", "custom"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                period === p ? "bg-[#D4AF37] text-black" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {p === 'today' ? 'Hari Ini' : p === '7' ? '7 Hari' : p === '30' ? '30 Hari' : 'Custom'}
            </button>
          ))}
        </div>
      </div>

      {period === "custom" ? (
        <Card className="grid gap-4 md:grid-cols-2">
          <input
            type="date"
            value={customRange.startDate}
            onChange={(e) => setCustomRange((prev) => ({ ...prev, startDate: e.target.value }))}
            className="bg-slate-950 border-slate-800 rounded-lg text-white p-2"
          />
          <input
            type="date"
            value={customRange.endDate}
            onChange={(e) => setCustomRange((prev) => ({ ...prev, endDate: e.target.value }))}
            className="bg-slate-950 border-slate-800 rounded-lg text-white p-2"
          />
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard label="Omzet" value={formatRupiah(summary.omzet)} />
        <MetricCard label="Profit bersih" value={formatRupiah(summary.labaBersih)} accent="success" />
        <MetricCard label="Transaksi" value={String(summary.totalTransaksi)} />
        <MetricCard label="Produk terjual" value={`${summary.produkTerjual} pcs`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-6">
          <div className="mb-5">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--brand-gold)]">
              Tren Penjualan
            </p>
            <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
              Pergerakan omzet
            </h3>
          </div>
          <TrendBars data={summary.trendSeries.slice(-6)} />
        </Card>

        <Card className="p-6">
          <div className="mb-5">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--brand-gold)]">
              Top Produk
            </p>
            <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
              Produk terlaris
            </h3>
          </div>

          <div className="space-y-3">
            {summary.topProducts.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
                Belum ada data penjualan aksesoris.
              </div>
            ) : (
              summary.topProducts.map((item, index) => (
                <div
                  key={item.nama}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-gold)]/14 font-bold text-[var(--brand-gold)]">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-950">{item.nama}</p>
                      <p className="text-sm text-slate-500">Penjualan aksesoris</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{item.qty} pcs</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Breakdown channel
          </h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {summary.breakdown.map((item) => (
              <div
                key={item.key}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-gold)]">
                  {item.label}
                </p>
                <p className="mt-3 text-xl font-bold text-slate-950">{formatRupiah(item.omzet)}</p>
                <p className="mt-2 text-sm text-slate-500">{item.transaksi} transaksi</p>
                <p className="mt-2 text-xs text-[var(--brand-gold)]">
                  Profit {formatRupiah(item.keuntungan)}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 border-t-4 border-[#D4AF37]">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Snapshot kas
          </h3>
          <div className="mt-5 space-y-3">
            {summary.cashDailySummary.slice(0, 5).map((item) => (
              <div
                key={item.tanggal}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <div>
                  <p className="font-semibold text-slate-950">{item.tanggal}</p>
                  <p className="text-sm text-slate-500">
                    Masuk {formatRupiah(item.total_pemasukan)} | Keluar{" "}
                    {formatRupiah(item.total_pengeluaran)}
                  </p>
                </div>
                <span className="text-sm font-semibold text-[var(--brand-gold)]">
                  {formatRupiah(item.sisa_saldo)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
