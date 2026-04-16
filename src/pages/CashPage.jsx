import { useMemo, useState } from "react";
import MetricCard from "../components/app/MetricCard";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { useAuth } from "../contexts/AuthContext";
import { useData } from "../contexts/DataContext";
import { showNotification } from "../contexts/NotificationContext";
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
    total_pemasukan: 0,
    total_pengeluaran: 0,
    sisa_saldo: 0,
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
  const isEditing = Boolean(editingId);
  const canEdit = user.role === "pemilik";

  const dailySummary = useMemo(() => {
    const selectedDate = parseDateInput(summaryDate);
    const summary = getDashboardSummary({ startDate: selectedDate, endDate: selectedDate });
    return summary.cashDailySummary[0] || createEmptyDailySummary(summaryDate);
  }, [getDashboardSummary, summaryDate]);

  const historyRows = useMemo(
    () => cashEntries.filter((entry) => (filterDate ? entry.tanggal === filterDate : true)),
    [cashEntries, filterDate]
  );

  const resetForm = () => {
    setEditingId(null);
    setForm(createInitialForm());
  };

  const handleEdit = (entry) => {
    setEditingId(entry.id);
    setForm({
      jenis: entry.jenis,
      kategori: entry.kategori,
      nominal: String(entry.nominal),
      keterangan: entry.keterangan || "",
      tanggal: entry.tanggal,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const payload = {
        jenis: form.jenis,
        kategori: form.kategori,
        nominal: Number(form.nominal),
        keterangan: form.keterangan.trim(),
        tanggal: form.tanggal,
      };

      if (isEditing) {
        await updateCashEntry(editingId, payload);
      } else {
        await createCashEntry(payload);
      }

      resetForm();
    } catch (error) {
      showNotification("error", error.message || "Gagal menyimpan operasional.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="brand-panel px-6 py-10 text-slate-700">Memuat operasional...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations Cashflow"
        title="Catat operasional"
        description="Masuk dan keluar kas harian dicatat dari satu tempat supaya kontrol saldo toko tetap rapi."
        icon="receipt"
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard label="Saldo awal" value={formatRupiah(dailySummary.saldo_awal)} />
        <MetricCard label="Pemasukan" value={formatRupiah(dailySummary.total_pemasukan)} accent="success" />
        <MetricCard label="Pengeluaran" value={formatRupiah(dailySummary.total_pengeluaran)} accent="danger" />
        <MetricCard label="Sisa saldo" value={formatRupiah(dailySummary.sisa_saldo)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel className="p-6">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                {isEditing ? "Edit entri operasional" : "Tambah entri operasional"}
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Owner bisa koreksi entri lama, kasir fokus ke input operasional harian.
              </p>
            </div>
            <input
              type="date"
              value={summaryDate}
              onChange={(event) => setSummaryDate(event.target.value)}
              className="brand-input max-w-[220px]"
            />
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <select
              value={form.jenis}
              onChange={(event) => setForm((prev) => ({ ...prev, jenis: event.target.value }))}
              className="brand-select"
            >
              {cashTypes.map((item) => (
                <option key={item.value} value={item.value} className="bg-slate-50 text-slate-950">
                  {item.label}
                </option>
              ))}
            </select>
            <select
              value={form.kategori}
              onChange={(event) => setForm((prev) => ({ ...prev, kategori: event.target.value }))}
              className="brand-select"
            >
              {cashCategories.map((item) => (
                <option key={item.value} value={item.value} className="bg-slate-50 text-slate-950">
                  {item.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              value={form.nominal}
              onChange={(event) => setForm((prev) => ({ ...prev, nominal: event.target.value }))}
              className="brand-input"
              placeholder="Nominal"
              required
            />
            <input
              type="date"
              value={form.tanggal}
              onChange={(event) => setForm((prev) => ({ ...prev, tanggal: event.target.value }))}
              className="brand-input"
              required
            />
            <textarea
              value={form.keterangan}
              onChange={(event) => setForm((prev) => ({ ...prev, keterangan: event.target.value }))}
              className="brand-textarea md:col-span-2"
              placeholder="Keterangan operasional"
            />
            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="brand-button-success disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Menyimpan..." : isEditing ? "Update Entri" : "Simpan Entri"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="brand-button-secondary"
              >
                Reset
              </button>
            </div>
          </form>

          <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
            <p className="font-semibold text-slate-950">Tips catat kas</p>
            <ul className="mt-3 space-y-2">
              <li>Pastikan nominal dan kategori sudah benar sebelum menyimpan.</li>
              <li>Gunakan tanggal transaksi untuk mencocokkan dengan laporan harian.</li>
              <li>Klik Reset untuk mulai catatan baru tanpa mengubah data sebelumnya.</li>
            </ul>
          </div>
        </Panel>

        <Panel variant="strong" className="p-6">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                Riwayat operasional
              </h3>
              <p className="mt-2 text-sm text-slate-600">{historyRows.length} entri tampil</p>
            </div>
            <input
              type="date"
              value={filterDate}
              onChange={(event) => setFilterDate(event.target.value)}
              className="brand-input max-w-[220px]"
            />
          </div>

          <div className="brand-scrollbar overflow-x-auto">
            <table className="brand-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Jenis</th>
                  <th>Kategori</th>
                  <th className="text-right">Nominal</th>
                  <th>Keterangan</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((entry) => (
                  <tr key={entry.id}>
                    <td className="font-semibold text-slate-950">{entry.tanggal}</td>
                    <td className="text-slate-600">{entry.jenis}</td>
                    <td className="text-slate-600">
                      {cashCategoryLabelMap[entry.kategori] || entry.kategori}
                    </td>
                    <td className="text-right text-slate-600">{formatRupiah(entry.nominal)}</td>
                    <td>
                      <p className="text-slate-600">{entry.keterangan || "-"}</p>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(entry.created_at, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </td>
                    <td>
                      <div className="flex justify-end gap-2">
                        {canEdit ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEdit(entry)}
                              className="brand-button-secondary px-3 py-2"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteCashEntry(entry.id)}
                              className="brand-button-secondary px-3 py-2"
                            >
                              Hapus
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-500">Read only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
