import { useMemo, useState } from "react";
import { useData } from "../contexts/DataContext";
import {
  walletOverviewPlatforms,
  walletPlatformLabelMap,
  walletPlatforms,
  walletTransactionTypeLabelMap,
  walletTransactionTypes,
} from "../data/businessOptions";
import {
  formatDateInput,
  formatDateTime,
  formatRupiah,
  parseDateInput,
} from "../utils/format";

const periodOptions = [
  { value: "today", label: "Hari ini" },
  { value: "7", label: "7 hari" },
  { value: "30", label: "30 hari" },
  { value: "custom", label: "Custom" },
];

const initialForm = {
  jenis: "masuk",
  platform: "dana",
  platform_tujuan: "",
  nominal: "",
  biaya_admin: "0",
  keterangan: "",
};

function getRange(period, customRange) {
  const today = new Date();

  if (period === "today") {
    return { startDate: today, endDate: today };
  }

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

export default function WalletPage() {
  const { loading, createWalletTransaction, getDashboardSummary } = useData();
  const [period, setPeriod] = useState("today");
  const [customRange, setCustomRange] = useState({
    startDate: formatDateInput(new Date()),
    endDate: formatDateInput(new Date()),
  });
  const [platformFilter, setPlatformFilter] = useState("semua");
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const range = useMemo(() => getRange(period, customRange), [customRange, period]);
  const summary = useMemo(() => getDashboardSummary(range), [getDashboardSummary, range]);

  const overviewCards = useMemo(() => {
    const summaryMap = summary.walletPlatformSummary.reduce((acc, item) => {
      acc[item.platform] = item;
      return acc;
    }, {});

    return walletOverviewPlatforms.map((platform) => ({
      platform,
      label: walletPlatformLabelMap[platform] || platform,
      masuk: summaryMap[platform]?.masuk || 0,
      keluar: summaryMap[platform]?.keluar || 0,
      saldo_bersih: summaryMap[platform]?.saldo_bersih || 0,
    }));
  }, [summary.walletPlatformSummary]);

  const filteredHistory = useMemo(() => {
    return summary.walletTransactions.filter((transaction) =>
      platformFilter === "semua" ? true : transaction.platform === platformFilter
    );
  }, [platformFilter, summary.walletTransactions]);

  const shouldShowTargetField =
    form.jenis === "transfer_antar" || form.jenis === "tarik_tunai";

  const handleChange = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "jenis") {
        if (value === "tarik_tunai") {
          next.platform_tujuan = "tunai";
        }
        if (value === "masuk" || value === "keluar") {
          next.platform_tujuan = "";
        }
      }
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (shouldShowTargetField && !form.platform_tujuan) {
      window.alert("Platform tujuan wajib dipilih.");
      return;
    }

    if (form.jenis === "transfer_antar" && form.platform === form.platform_tujuan) {
      window.alert("Platform asal dan tujuan tidak boleh sama.");
      return;
    }

    setSubmitting(true);
    try {
      await createWalletTransaction({
        jenis: form.jenis,
        platform: form.platform,
        platform_tujuan: shouldShowTargetField ? form.platform_tujuan : null,
        nominal: Number(form.nominal),
        biaya_admin: Number(form.biaya_admin || 0),
        keterangan: form.keterangan,
      });
      window.alert("Mutasi dompet internal berhasil disimpan.");
      setForm(initialForm);
    } catch (error) {
      window.alert(error.message || "Gagal menyimpan mutasi dompet internal.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="rounded-3xl bg-white p-8 text-slate-600">Memuat dompet internal...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] bg-gradient-to-br from-[#1e3a5f] via-[#29527d] to-sky-500 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-100">
              Dompet Internal
            </p>
            <h2 className="mt-2 text-3xl font-black">Rekonsiliasi saldo internal toko</h2>
            <p className="mt-2 text-sm text-sky-50/90">
              Dipakai untuk isi saldo toko, saldo keluar internal, tarik ke laci tunai, dan
              transfer antar platform milik toko sendiri.
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
          </div>
        </div>

        {period === "custom" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              type="date"
              value={customRange.startDate}
              onChange={(event) =>
                setCustomRange((prev) => ({ ...prev, startDate: event.target.value }))
              }
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-white/70"
            />
            <input
              type="date"
              value={customRange.endDate}
              onChange={(event) =>
                setCustomRange((prev) => ({ ...prev, endDate: event.target.value }))
              }
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-white/70"
            />
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((item) => (
          <div
            key={item.platform}
            className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  {item.label}
                </p>
                <p className="mt-3 text-2xl font-black text-[#1e3a5f]">
                  {formatRupiah(item.saldo_bersih)}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  item.saldo_bersih >= 0
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                Saldo
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-emerald-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  Masuk
                </p>
                <p className="mt-1 text-sm font-bold text-emerald-800">
                  {formatRupiah(item.masuk)}
                </p>
              </div>
              <div className="rounded-2xl bg-amber-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                  Keluar
                </p>
                <p className="mt-1 text-sm font-bold text-amber-800">
                  {formatRupiah(item.keluar)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
              Input Mutasi Dompet
            </p>
            <h3 className="mt-2 text-2xl font-black text-[#1e3a5f]">
              Catat perpindahan saldo toko
            </h3>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Jenis</label>
              <select
                value={form.jenis}
                onChange={(event) => handleChange("jenis", event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
              >
                {walletTransactionTypes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Platform asal
              </label>
              <select
                value={form.platform}
                onChange={(event) => handleChange("platform", event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
              >
                {walletPlatforms.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {shouldShowTargetField ? (
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Platform tujuan
                </label>
                <select
                  value={form.platform_tujuan}
                  onChange={(event) => handleChange("platform_tujuan", event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">Pilih tujuan</option>
                  {walletPlatforms
                    .filter((item) =>
                      form.jenis === "tarik_tunai" ? item.value === "tunai" : true
                    )
                    .map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                </select>
              </div>
            ) : null}

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Nominal</label>
              <input
                type="number"
                min="0"
                value={form.nominal}
                onChange={(event) => handleChange("nominal", event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Biaya admin
              </label>
              <input
                type="number"
                min="0"
                value={form.biaya_admin}
                onChange={(event) => handleChange("biaya_admin", event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Keterangan
              </label>
              <textarea
                value={form.keterangan}
                onChange={(event) => handleChange("keterangan", event.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                placeholder="Opsional"
              />
            </div>

            <div className="md:col-span-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p>
                Nilai bersih yang menambah saldo platform tujuan akan dikurangi biaya admin bila
                ada potongan.
              </p>
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-[#1e3a5f] px-4 py-3 text-sm font-semibold text-white hover:bg-[#274a75] disabled:opacity-60"
              >
                {submitting ? "Menyimpan..." : "Simpan Mutasi Dompet"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-2xl font-black text-[#1e3a5f]">Riwayat dompet internal</h3>
              <p className="text-sm text-slate-500">
                {filteredHistory.length} transaksi pada periode terpilih
              </p>
            </div>

            <select
              value={platformFilter}
              onChange={(event) => setPlatformFilter(event.target.value)}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
            >
              <option value="semua">Semua platform</option>
              {walletPlatforms.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
              Belum ada mutasi dompet internal untuk filter ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Waktu</th>
                    <th className="px-3 py-2">Platform</th>
                    <th className="px-3 py-2">Jenis</th>
                    <th className="px-3 py-2">Tujuan</th>
                    <th className="px-3 py-2 text-right">Nominal</th>
                    <th className="px-3 py-2 text-right">Biaya Admin</th>
                    <th className="px-3 py-2">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((transaction) => (
                    <tr key={transaction.id} className="border-t border-slate-100">
                      <td className="px-3 py-3 text-slate-600">
                        {formatDateTime(transaction.created_at, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">
                        {walletPlatformLabelMap[transaction.platform] || transaction.platform}
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
                          {walletTransactionTypeLabelMap[transaction.jenis] || transaction.jenis}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {transaction.platform_tujuan
                          ? walletPlatformLabelMap[transaction.platform_tujuan] ||
                            transaction.platform_tujuan
                          : "-"}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">
                        {formatRupiah(transaction.nominal)}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-600">
                        {formatRupiah(transaction.biaya_admin)}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {transaction.keterangan || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
