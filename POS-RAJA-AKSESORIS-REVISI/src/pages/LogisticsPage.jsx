import { useMemo, useState } from "react";
import { useData } from "../contexts/DataContext";
import { logisticsCouriers } from "../data/businessOptions";
import {
  formatDateKey,
  formatDateTime,
  formatRupiah,
  generateTransactionNumber,
} from "../utils/format";

const initialForm = {
  ekspedisi: logisticsCouriers[0],
  harga_jual: "",
  modal: "",
  no_resi: "",
  catatan: "",
};

function summarizeCouriers(transactions) {
  const grouped = transactions.reduce((acc, transaction) => {
    const key = transaction.ekspedisi || "Lainnya";
    acc[key] ??= {
      ekspedisi: key,
      jumlah_transaksi: 0,
      omzet: 0,
      modal: 0,
      keuntungan: 0,
    };
    acc[key].jumlah_transaksi += 1;
    acc[key].omzet += transaction.harga_jual;
    acc[key].modal += transaction.modal;
    acc[key].keuntungan +=
      transaction.keuntungan ?? transaction.harga_jual - transaction.modal;
    return acc;
  }, {});

  return Object.values(grouped).sort((left, right) => right.keuntungan - left.keuntungan);
}

export default function LogisticsPage() {
  const { loading, logisticsTransactions, createLogisticsTransaction } = useData();
  const [form, setForm] = useState(initialForm);
  const [courierFilter, setCourierFilter] = useState("semua");
  const [submitting, setSubmitting] = useState(false);

  const todayCount = useMemo(
    () =>
      logisticsTransactions.filter(
        (transaction) => formatDateKey(transaction.created_at) === formatDateKey(new Date())
      ).length,
    [logisticsTransactions]
  );

  const previewNumber = useMemo(
    () => generateTransactionNumber("LOG", todayCount + 1),
    [todayCount]
  );

  const filteredTransactions = useMemo(() => {
    return logisticsTransactions.filter((transaction) =>
      courierFilter === "semua" ? true : transaction.ekspedisi === courierFilter
    );
  }, [courierFilter, logisticsTransactions]);

  const courierSummary = useMemo(
    () => summarizeCouriers(filteredTransactions),
    [filteredTransactions]
  );

  const totals = useMemo(
    () =>
      filteredTransactions.reduce(
        (acc, transaction) => {
          acc.transaksi += 1;
          acc.omzet += transaction.harga_jual;
          acc.modal += transaction.modal;
          acc.keuntungan +=
            transaction.keuntungan ?? transaction.harga_jual - transaction.modal;
          return acc;
        },
        { transaksi: 0, omzet: 0, modal: 0, keuntungan: 0 }
      ),
    [filteredTransactions]
  );

  const keuntungan = Number(form.harga_jual || 0) - Number(form.modal || 0);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const transaction = await createLogisticsTransaction({
        ekspedisi: form.ekspedisi,
        harga_jual: Number(form.harga_jual),
        modal: Number(form.modal),
        no_resi: form.no_resi,
        catatan: form.catatan,
      });
      window.alert(`Transaksi logistik tersimpan dengan nomor ${transaction.no_transaksi}.`);
      setForm(initialForm);
    } catch (error) {
      window.alert(error.message || "Gagal menyimpan transaksi logistik.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="rounded-3xl bg-white p-8 text-slate-600">Memuat data logistik...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] bg-gradient-to-br from-[#1e3a5f] via-[#26486e] to-emerald-500 p-6 text-white shadow-xl">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-100">
              Input Logistik
            </p>
            <h2 className="mt-2 text-3xl font-black">Pencatatan paket fokus pada keuntungan</h2>
            <p className="mt-2 text-sm text-emerald-50/90">
              Nomor resi dan detail pengiriman tetap ditangani aplikasi ekspedisi. POS cukup
              menyimpan harga jual, modal, dan margin per transaksi.
            </p>
          </div>

          <div className="rounded-[28px] bg-white/10 p-5 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100">
              No. transaksi berikutnya
            </p>
            <p className="mt-3 text-2xl font-black">{previewNumber}</p>
            <p className="mt-2 text-sm text-emerald-50/90">
              Format otomatis `LOG-YYYYMMDD-XXXX`
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h3 className="text-2xl font-black text-[#1e3a5f]">Catat pengiriman paket</h3>
            <p className="mt-2 text-sm text-slate-500">
              Keuntungan dihitung otomatis dari harga jual dikurangi modal aplikasi.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Ekspedisi
              </label>
              <input
                list="logistics-couriers"
                value={form.ekspedisi}
                onChange={(event) => handleChange("ekspedisi", event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                placeholder="JNE / Wahana / SiCepat"
                required
              />
              <datalist id="logistics-couriers">
                {logisticsCouriers.map((courier) => (
                  <option key={courier} value={courier} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Harga jual
              </label>
              <input
                type="number"
                min="0"
                value={form.harga_jual}
                onChange={(event) => handleChange("harga_jual", event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Modal</label>
              <input
                type="number"
                min="0"
                value={form.modal}
                onChange={(event) => handleChange("modal", event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                required
              />
            </div>

            <div className="md:col-span-2 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Keuntungan
              </p>
              <p className="mt-1 text-2xl font-black text-emerald-800">
                {formatRupiah(keuntungan)}
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">No. resi</label>
              <input
                value={form.no_resi}
                onChange={(event) => handleChange("no_resi", event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                placeholder="Opsional"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Catatan</label>
              <input
                value={form.catatan}
                onChange={(event) => handleChange("catatan", event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                placeholder="Opsional"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-[#1e3a5f] px-4 py-3 text-sm font-semibold text-white hover:bg-[#274a75] disabled:opacity-60"
              >
                {submitting ? "Menyimpan..." : "Simpan Transaksi Logistik"}
              </button>
            </div>
          </form>
        </section>

        <section className="space-y-6">
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-2xl font-black text-[#1e3a5f]">Rekap logistik</h3>
                <p className="text-sm text-slate-500">
                  Filter per ekspedisi untuk melihat kinerja channel pengiriman.
                </p>
              </div>

              <select
                value={courierFilter}
                onChange={(event) => setCourierFilter(event.target.value)}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
              >
                <option value="semua">Semua ekspedisi</option>
                {Array.from(new Set(logisticsTransactions.map((item) => item.ekspedisi)))
                  .filter(Boolean)
                  .map((courier) => (
                    <option key={courier} value={courier}>
                      {courier}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total transaksi
                </p>
                <p className="mt-2 text-2xl font-black text-[#1e3a5f]">{totals.transaksi}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Omzet
                </p>
                <p className="mt-2 text-2xl font-black text-[#1e3a5f]">
                  {formatRupiah(totals.omzet)}
                </p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Modal
                </p>
                <p className="mt-2 text-2xl font-black text-[#1e3a5f]">
                  {formatRupiah(totals.modal)}
                </p>
              </div>
              <div className="rounded-3xl bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Keuntungan
                </p>
                <p className="mt-2 text-2xl font-black text-emerald-800">
                  {formatRupiah(totals.keuntungan)}
                </p>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
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
                  {courierSummary.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-3 py-10 text-center text-slate-500">
                        Belum ada transaksi logistik.
                      </td>
                    </tr>
                  ) : (
                    courierSummary.map((item) => (
                      <tr key={item.ekspedisi} className="border-t border-slate-100">
                        <td className="px-3 py-3 font-semibold text-slate-900">
                          {item.ekspedisi}
                        </td>
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-2xl font-black text-[#1e3a5f]">Riwayat pengiriman</h3>
            <p className="mt-2 text-sm text-slate-500">
              {filteredTransactions.length} transaksi tampil
            </p>

            {filteredTransactions.length === 0 ? (
              <div className="mt-5 rounded-3xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
                Belum ada riwayat logistik untuk filter ini.
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Waktu</th>
                      <th className="px-3 py-2">No. Transaksi</th>
                      <th className="px-3 py-2">Ekspedisi</th>
                      <th className="px-3 py-2 text-right">Harga Jual</th>
                      <th className="px-3 py-2 text-right">Modal</th>
                      <th className="px-3 py-2 text-right">Keuntungan</th>
                      <th className="px-3 py-2">No. Resi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((transaction) => (
                      <tr key={transaction.id} className="border-t border-slate-100">
                        <td className="px-3 py-3 text-slate-600">
                          {formatDateTime(transaction.created_at, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-900">
                          {transaction.no_transaksi}
                        </td>
                        <td className="px-3 py-3 text-slate-700">{transaction.ekspedisi}</td>
                        <td className="px-3 py-3 text-right text-slate-600">
                          {formatRupiah(transaction.harga_jual)}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-600">
                          {formatRupiah(transaction.modal)}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-emerald-700">
                          {formatRupiah(
                            transaction.keuntungan ??
                              transaction.harga_jual - transaction.modal
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {transaction.no_resi || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
