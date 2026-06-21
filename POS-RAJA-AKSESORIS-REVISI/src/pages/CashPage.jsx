import { useMemo, useState } from "react";
import { useData } from "../contexts/DataContext";
import { useAuth } from "../contexts/AuthContext";
import {
  cashCategories,
  cashCategoryLabelMap,
  cashTypes,
} from "../data/businessOptions";
import {
  formatDateInput,
  formatDateTime,
  formatRupiah,
  parseDateInput,
} from "../utils/format";

function createInitialForm() {
  return {
    jenis: "pengeluaran",
    kategori: "operasional",
    nominal: "",
    keterangan: "",
    tanggal: formatDateInput(new Date()),
  };
}

function createEmptyDailySummary(date) {
  return {
    tanggal: date,
    saldo_awal: 0,
    tambah_saldo: [],
    total_pemasukan: 0,
    total_pengeluaran: 0,
    total_saldo: 0,
    sisa_saldo: 0,
    entries: [],
  };
}

export default function CashPage() {
  const { user } = useAuth();
  const { loading, cashEntries, createCashEntry, updateCashEntry, deleteCashEntry, getDashboardSummary } =
    useData();
  const [summaryDate, setSummaryDate] = useState(formatDateInput(new Date()));
  const [filterDate, setFilterDate] = useState("");
  const [form, setForm] = useState(createInitialForm());
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const dailySummary = useMemo(() => {
    const selectedDate = parseDateInput(summaryDate);
    const summary = getDashboardSummary({
      startDate: selectedDate,
      endDate: selectedDate,
    });
    return summary.cashDailySummary[0] || createEmptyDailySummary(summaryDate);
  }, [getDashboardSummary, summaryDate]);

  const historyRows = useMemo(() => {
    return cashEntries.filter((entry) =>
      filterDate ? entry.tanggal === filterDate : true
    );
  }, [cashEntries, filterDate]);

  const tambahSaldoSlots = [...dailySummary.tambah_saldo];
  while (tambahSaldoSlots.length < 4) {
    tambahSaldoSlots.push(0);
  }

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(createInitialForm());
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (form.jenis === "pengeluaran" && !form.keterangan.trim()) {
      window.alert("Keterangan wajib diisi untuk pengeluaran.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        jenis: form.jenis,
        kategori: form.kategori,
        nominal: Number(form.nominal),
        keterangan: form.keterangan.trim(),
        tanggal: form.tanggal,
      };

      if (editingId) {
        await updateCashEntry(editingId, payload);
        window.alert("Entri kas berhasil diperbarui.");
      } else {
        await createCashEntry(payload);
        window.alert("Entri kas berhasil disimpan.");
      }

      resetForm();
    } catch (error) {
      window.alert(error.message || "Gagal menyimpan entri kas.");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setForm({
      jenis: entry.jenis,
      kategori: entry.kategori,
      nominal: String(entry.nominal),
      keterangan: entry.keterangan || "",
      tanggal: entry.tanggal,
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Hapus entri kas ini?")) {
      return;
    }

    try {
      await deleteCashEntry(id);
    } catch (error) {
      window.alert(error.message || "Gagal menghapus entri kas.");
    }
  };

  if (loading) {
    return <div className="rounded-3xl bg-white p-8 text-slate-600">Memuat buku kas...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] bg-gradient-to-br from-[#1e3a5f] via-[#214466] to-amber-500 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-100">
              Buku Kas
            </p>
            <h2 className="mt-2 text-3xl font-black">Ringkasan Harian</h2>
            <p className="mt-2 text-sm text-amber-50/90">
              Saldo awal, pemasukan, pengeluaran, dan sisa kas per hari.
            </p>
          </div>

          <div className="rounded-[28px] bg-white/10 p-5 backdrop-blur">
            <label className="block text-xs font-semibold uppercase tracking-[0.25em] text-amber-100">
              Tanggal ringkasan
            </label>
            <input
              type="date"
              value={summaryDate}
              onChange={(event) => setSummaryDate(event.target.value)}
              className="mt-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white outline-none"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Saldo awal
          </p>
          <p className="mt-3 text-2xl font-black text-[#1e3a5f]">
            {formatRupiah(dailySummary.saldo_awal)}
          </p>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Total pemasukan
          </p>
          <p className="mt-3 text-2xl font-black text-[#1e3a5f]">
            {formatRupiah(dailySummary.total_pemasukan)}
          </p>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Total pengeluaran
          </p>
          <p className="mt-3 text-2xl font-black text-[#1e3a5f]">
            {formatRupiah(dailySummary.total_pengeluaran)}
          </p>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">
            Sisa saldo
          </p>
          <p className="mt-3 text-2xl font-black text-emerald-800">
            {formatRupiah(dailySummary.sisa_saldo)}
          </p>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="space-y-6">
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black text-[#1e3a5f]">
                  {editingId ? "Edit entri kas" : "Catat kas"}
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Pengeluaran wajib punya keterangan. Pemilik bisa koreksi tanggal lama.
                </p>
              </div>
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal edit
                </button>
              ) : null}
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Jenis</label>
                <select
                  value={form.jenis}
                  onChange={(event) => handleChange("jenis", event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                >
                  {cashTypes.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Kategori
                </label>
                <select
                  value={form.kategori}
                  onChange={(event) => handleChange("kategori", event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                >
                  {cashCategories.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

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
                <label className="mb-2 block text-sm font-semibold text-slate-700">Tanggal</label>
                <input
                  type="date"
                  value={form.tanggal}
                  onChange={(event) => handleChange("tanggal", event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                  required
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
                  placeholder={
                    form.jenis === "pengeluaran"
                      ? "Wajib untuk pengeluaran"
                      : "Opsional untuk pemasukan"
                  }
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-2xl bg-[#1e3a5f] px-4 py-3 text-sm font-semibold text-white hover:bg-[#274a75] disabled:opacity-60"
                >
                  {submitting
                    ? "Menyimpan..."
                    : editingId
                      ? "Perbarui Entri Kas"
                      : "Simpan Entri Kas"}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-2xl font-black text-[#1e3a5f]">Riwayat kas</h3>
              <p className="text-sm text-slate-500">
                {historyRows.length} entri {filterDate ? `untuk ${filterDate}` : "semua tanggal"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={filterDate}
                onChange={(event) => setFilterDate(event.target.value)}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
              />
              {filterDate ? (
                <button
                  type="button"
                  onClick={() => setFilterDate("")}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Reset
                </button>
              ) : null}
            </div>
          </div>

          {historyRows.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
              Belum ada entri kas pada filter ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Tanggal</th>
                    <th className="px-3 py-2">Jenis</th>
                    <th className="px-3 py-2">Kategori</th>
                    <th className="px-3 py-2 text-right">Nominal</th>
                    <th className="px-3 py-2">Keterangan</th>
                    <th className="px-3 py-2">Dibuat</th>
                    {user.role === "pemilik" ? <th className="px-3 py-2">Aksi</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((entry) => (
                    <tr key={entry.id} className="border-t border-slate-100">
                      <td className="px-3 py-3 font-medium text-slate-900">{entry.tanggal}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            entry.jenis === "pemasukan"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {entry.jenis}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {cashCategoryLabelMap[entry.kategori] || entry.kategori}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">
                        {formatRupiah(entry.nominal)}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{entry.keterangan || "-"}</td>
                      <td className="px-3 py-3 text-slate-500">
                        {formatDateTime(entry.created_at, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      {user.role === "pemilik" ? (
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(entry)}
                              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(entry.id)}
                              className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      ) : null}
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
