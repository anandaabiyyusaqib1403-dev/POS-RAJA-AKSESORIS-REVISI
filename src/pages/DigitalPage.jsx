import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { useData } from "../contexts/DataContext";
import { showNotification } from "../contexts/NotificationContext";
import {
  serviceTypeLabelMap,
  serviceTypes,
  walletPlatformLabelMap,
  walletPlatforms,
} from "../data/businessOptions";
import { formatDateTime, formatRupiah } from "../utils/format";

const baseForm = {
  jenis: "pulsa",
  provider: "",
  nomor_tujuan: "",
  nama_tujuan: "",
  platform_sumber: "",
  harga_jual: "",
  modal: "",
  catatan: "",
};

export default function DigitalPage() {
  const { createDigitalTransaction, digitalTransactions, walletBalances } = useData();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(baseForm);
  const [submitting, setSubmitting] = useState(false);

  const serviceConfig = useMemo(
    () => serviceTypes.find((item) => item.value === form.jenis) || serviceTypes[0],
    [form.jenis]
  );

  const quickTypes = useMemo(
    () => ["pulsa", "kuota", "voucher_game", "token_listrik", "transfer_bank", "transfer_ewallet"],
    []
  );
  const recentTransactions = useMemo(() => digitalTransactions.slice(0, 8), [digitalTransactions]);
  const keuntungan = Number(form.harga_jual || 0) - Number(form.modal || 0);
  const selectedWallet = walletBalances.find((wallet) => wallet.id === form.platform_sumber);
  const requiresWalletValidation = Boolean(
    form.platform_sumber && !["cash", "qris"].includes(form.platform_sumber)
  );
  const isWalletBalanceInsufficient =
    requiresWalletValidation &&
    Number(form.modal || 0) > 0 &&
    Number(selectedWallet?.balance || 0) < Number(form.modal || 0);

  useEffect(() => {
    const jenis = searchParams.get("jenis");
    if (!jenis) return;

    const nextConfig = serviceTypes.find((item) => item.value === jenis);
    if (!nextConfig) return;

    setForm((prev) => ({
      ...prev,
      jenis,
      provider: nextConfig.defaultProvider || prev.provider,
      platform_sumber: prev.platform_sumber,
    }));
  }, [searchParams]);

  const setJenisCepat = (jenis) => {
    const nextConfig = serviceTypes.find((item) => item.value === jenis) || serviceTypes[0];
    setForm((prev) => ({
      ...prev,
      jenis,
      provider: nextConfig.defaultProvider || "",
      nomor_tujuan: "",
      nama_tujuan: "",
      platform_sumber: prev.platform_sumber,
      catatan: "",
    }));
  };

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (serviceConfig.targetNameRequired && !form.nama_tujuan.trim()) {
      showNotification("warning", `${serviceConfig.targetNameLabel} wajib diisi.`);
      return;
    }

    if (!form.platform_sumber) {
      showNotification("warning", "Sumber saldo toko wajib dipilih.");
      return;
    }

    if (isWalletBalanceInsufficient) {
      showNotification("error", "Saldo tidak mencukupi, silakan isi saldo terlebih dahulu");
      return;
    }

    setSubmitting(true);
    try {
      await createDigitalTransaction({
        jenis: form.jenis,
        provider: form.provider || serviceConfig.defaultProvider || "",
        nomor_tujuan: form.nomor_tujuan,
        nama_tujuan: form.nama_tujuan,
        platform_sumber: form.platform_sumber,
        nominal: 0,
        harga_jual: Number(form.harga_jual),
        modal: Number(form.modal),
        catatan: form.catatan,
      });

      setForm({
        ...baseForm,
        jenis: form.jenis,
        provider: serviceConfig.defaultProvider || "",
        platform_sumber: form.platform_sumber,
      });
    } catch (error) {
      showNotification("error", error.message || "Gagal menyimpan transaksi keuangan.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance Input"
        title="Transaksi keuangan"
        description="Semua layanan digital dicatat cepat di sini setelah proses utama selesai di aplikasi partner."
        icon="wallet"
      />

      <Panel className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Shortcut layanan
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {quickTypes.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setJenisCepat(value)}
              className={
                form.jenis === value ? "brand-button-primary" : "brand-button-secondary"
              }
            >
              {serviceTypeLabelMap[value]}
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Panel className="p-6">
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Jenis layanan</label>
              <select
                value={form.jenis}
                onChange={(event) => setJenisCepat(event.target.value)}
                className="brand-select"
              >
                {serviceTypes.map((item) => (
                  <option key={item.value} value={item.value} className="bg-slate-50 text-slate-950">
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
                value={form.provider}
                onChange={(event) => handleChange("provider", event.target.value)}
                className="brand-input"
                placeholder={serviceConfig.providerPlaceholder}
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Sumber Saldo Toko
              </label>
              <select
                value={form.platform_sumber}
                onChange={(event) => handleChange("platform_sumber", event.target.value)}
                className="brand-select"
                required
              >
                <option value="" className="bg-slate-50 text-slate-950">
                  Pilih wallet sumber saldo
                </option>
                {walletPlatforms.map((item) => (
                  <option key={item.value} value={item.value} className="bg-slate-50 text-slate-950">
                    {item.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500">
                Wallet tervalidasi akan dicek sebelum transaksi disimpan. Saldo tidak dipotong otomatis.
              </p>
              {form.platform_sumber ? (
                <div
                  className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
                    isWalletBalanceInsufficient
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  <span>Saldo {walletPlatformLabelMap[form.platform_sumber]}: </span>
                  <span className="font-semibold">
                    {formatRupiah(selectedWallet?.balance || 0)}
                  </span>
                  {isWalletBalanceInsufficient ? (
                    <p className="mt-2">
                      {selectedWallet?.balance === 0
                        ? "Saldo 0. Isi saldo manual dari halaman Saldo Internal. Transaksi tidak menambah saldo otomatis."
                        : "Saldo tidak mencukupi, silakan isi saldo terlebih dahulu"}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                {serviceConfig.targetLabel}
              </label>
              <input
                value={form.nomor_tujuan}
                onChange={(event) => handleChange("nomor_tujuan", event.target.value)}
                className="brand-input"
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
                onChange={(event) => handleChange("nama_tujuan", event.target.value)}
                className="brand-input"
                placeholder={serviceConfig.targetNamePlaceholder}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Harga jual</label>
              <input
                type="number"
                min="0"
                value={form.harga_jual}
                onChange={(event) => handleChange("harga_jual", event.target.value)}
                className="brand-input"
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
                className="brand-input"
                required
              />
            </div>

            <div className="rounded-2xl border border-[var(--brand-gold)]/20 bg-[var(--brand-gold)]/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-gold)]">
                Profit
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{formatRupiah(keuntungan)}</p>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">Catatan</label>
              <textarea
                value={form.catatan}
                onChange={(event) => handleChange("catatan", event.target.value)}
                className="brand-textarea"
                placeholder="Catatan tambahan bila diperlukan"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="brand-button-success w-full disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Menyimpan..." : "Simpan Transaksi Keuangan"}
              </button>
            </div>
          </form>
        </Panel>

        <Panel variant="strong" className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Riwayat terbaru
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            Delapan transaksi digital terbaru untuk pengecekan cepat.
          </p>

          <div className="mt-5 space-y-3">
            {recentTransactions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-12 text-center text-sm text-slate-500">
                Belum ada transaksi digital.
              </div>
            ) : (
              recentTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--brand-gold)]">
                        {serviceTypeLabelMap[transaction.jenis] || transaction.jenis}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">
                        {transaction.provider} • {transaction.nomor_tujuan}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDateTime(transaction.created_at, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                      {transaction.platform_sumber ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Sumber:{" "}
                          {walletPlatformLabelMap[transaction.platform_sumber] ||
                            transaction.platform_sumber}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-950">
                        {formatRupiah(transaction.harga_jual)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[var(--brand-gold)]">
                        Profit {formatRupiah(transaction.keuntungan)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
