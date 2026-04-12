import { useMemo, useState } from "react";
import { useData } from "../contexts/DataContext";
import {
  serviceTypeLabelMap,
  serviceTypes,
  walletPlatformLabelMap,
  walletPlatforms,
} from "../data/businessOptions";
import { formatDateTime, formatRupiah } from "../utils/format";

const initialForm = {
  jenis: "pulsa",
  provider: "",
  nomor_tujuan: "",
  nama_tujuan: "",
  platform_sumber: "",
  nominal: "",
  harga_jual: "",
  modal: "",
  catatan: "",
};

export default function DigitalPage() {
  const { createDigitalTransaction, digitalTransactions } = useData();
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const serviceConfig = useMemo(
    () => serviceTypes.find((item) => item.value === form.jenis) || serviceTypes[0],
    [form.jenis]
  );
  const keuntungan = Number(form.harga_jual || 0) - Number(form.modal || 0);

  const recentTransactions = useMemo(
    () => digitalTransactions.slice(0, 12),
    [digitalTransactions]
  );

  const updateField = (key, value) => {
    if (key === "jenis") {
      const nextConfig = serviceTypes.find((item) => item.value === value) || serviceTypes[0];
      setForm((prev) => ({
        ...prev,
        jenis: value,
        provider: nextConfig.defaultProvider || "",
        nomor_tujuan: "",
        nama_tujuan: "",
        platform_sumber: nextConfig.sourcePlatformRequired ? prev.platform_sumber : "",
        catatan: prev.catatan,
      }));
      return;
    }

    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (serviceConfig.targetNameRequired && !form.nama_tujuan.trim()) {
      window.alert(`${serviceConfig.targetNameLabel} wajib diisi.`);
      return;
    }

    if (serviceConfig.sourcePlatformRequired && !form.platform_sumber) {
      window.alert(`${serviceConfig.sourcePlatformLabel} wajib dipilih.`);
      return;
    }

    setSubmitting(true);
    try {
      const transaction = await createDigitalTransaction({
        jenis: form.jenis,
        provider: form.provider || serviceConfig.defaultProvider || "",
        nomor_tujuan: form.nomor_tujuan,
        nama_tujuan: form.nama_tujuan,
        platform_sumber: serviceConfig.sourcePlatformRequired ? form.platform_sumber : null,
        nominal: Number(form.nominal),
        harga_jual: Number(form.harga_jual),
        modal: Number(form.modal),
        catatan: form.catatan,
      });
      window.alert(`Transaksi layanan tersimpan dengan nomor ${transaction.no_transaksi}`);
      setForm({
        ...initialForm,
        provider: serviceConfig.defaultProvider || "",
      });
    } catch (error) {
      window.alert(error.message || "Gagal menyimpan transaksi layanan.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Input Layanan
          </p>
          <h2 className="mt-2 text-3xl font-black text-[#1e3a5f]">
            Pulsa, token, transfer, tarik tunai
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Semua layanan tetap dicatat manual dari aplikasi pihak ketiga, tetapi data tujuan
            transaksi tetap disimpan supaya audit dan komplain lebih mudah ditelusuri.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Jenis layanan</label>
            <select
              value={form.jenis}
              onChange={(event) => updateField("jenis", event.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
            >
              {serviceTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              {serviceConfig.providerLabel}
            </label>
            <input
              list={`provider-options-${form.jenis}`}
              value={form.provider}
              onChange={(event) => updateField("provider", event.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
              placeholder={serviceConfig.providerPlaceholder}
              required
            />
            <datalist id={`provider-options-${form.jenis}`}>
              {(serviceConfig.providerOptions || []).map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>

          {serviceConfig.sourcePlatformRequired ? (
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                {serviceConfig.sourcePlatformLabel}
              </label>
              <select
                value={form.platform_sumber}
                onChange={(event) => updateField("platform_sumber", event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
              >
                <option value="">Pilih sumber saldo toko</option>
                {walletPlatforms
                  .filter((item) => item.value !== "lainnya")
                  .map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
              </select>
            </div>
          ) : null}

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              {serviceConfig.targetLabel}
            </label>
            <input
              value={form.nomor_tujuan}
              onChange={(event) => updateField("nomor_tujuan", event.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
              placeholder={serviceConfig.targetPlaceholder}
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              {serviceConfig.targetNameLabel}
            </label>
            <input
              value={form.nama_tujuan}
              onChange={(event) => updateField("nama_tujuan", event.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
              placeholder={serviceConfig.targetNamePlaceholder}
              required={Boolean(serviceConfig.targetNameRequired)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Nominal</label>
            <input
              type="number"
              min="0"
              value={form.nominal}
              onChange={(event) => updateField("nominal", event.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Harga jual</label>
            <input
              type="number"
              min="0"
              value={form.harga_jual}
              onChange={(event) => updateField("harga_jual", event.target.value)}
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
              onChange={(event) => updateField("modal", event.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Keuntungan</label>
            <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 px-4 py-3 font-semibold text-emerald-700">
              {formatRupiah(keuntungan)}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Catatan</label>
            <textarea
              value={form.catatan}
              onChange={(event) => updateField("catatan", event.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
              placeholder="Misal: transfer cepat, komplain pelanggan, kode referensi aplikasi"
            />
          </div>

          <div className="md:col-span-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p>
              Simpan nomor rekening, nomor akun, ID pelanggan, atau nomor meter sesuai jenis
              layanan. Itu tetap penting meskipun proses utamanya dilakukan di aplikasi pihak
              ketiga.
            </p>
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-[#1e3a5f] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Menyimpan..." : "Simpan Transaksi Layanan"}
            </button>
          </div>
        </form>
      </section>

      <aside className="space-y-6">
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900">Konsep layanan</h3>
          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
            <p>Barang fisik tetap dipisah dari layanan karena stok dan akuntansinya berbeda.</p>
            <p>
              Transfer bank, transfer e-wallet, dan tarik tunai dicatat sebagai layanan pelanggan,
              bukan mutasi dompet internal.
            </p>
            <p>
              Modul dompet dipakai untuk rekonsiliasi saldo toko: isi saldo, keluar saldo, tarik ke
              tunai, dan transfer antar platform.
            </p>
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-xl font-bold text-slate-900">Riwayat layanan terbaru</h3>
            <p className="text-sm text-slate-500">{recentTransactions.length} transaksi tampil</p>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
              Belum ada transaksi layanan.
            </div>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((transaction) => (
                <div key={transaction.id} className="rounded-[24px] bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {serviceTypeLabelMap[transaction.jenis] || transaction.jenis}
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {transaction.provider} | {transaction.nomor_tujuan}
                      </p>
                      <p className="text-xs text-slate-500">
                        {transaction.nama_tujuan || "Tanpa nama tujuan"} |{" "}
                        {formatDateTime(transaction.created_at, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                      {transaction.platform_sumber ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Sumber toko:{" "}
                          {walletPlatformLabelMap[transaction.platform_sumber] ||
                            transaction.platform_sumber}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">
                        {formatRupiah(transaction.harga_jual)}
                      </p>
                      <p className="text-xs font-semibold text-emerald-600">
                        Untung {formatRupiah(transaction.keuntungan)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
