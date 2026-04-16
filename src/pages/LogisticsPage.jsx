import { useMemo, useState } from "react";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { useData } from "../contexts/DataContext";
import { showNotification } from "../contexts/NotificationContext";
import {
  logisticsCouriers,
  logisticsPackageTypes,
  walletPlatformLabelMap,
  walletPlatforms,
} from "../data/businessOptions";
import { formatCashierName } from "../utils/cashier";
import {
  formatDateInput,
  formatDateKey,
  formatDateTime,
  formatRupiah,
  generateTransactionNumber,
} from "../utils/format";

const initialForm = {
  courier: logisticsCouriers[0],
  sender: "",
  receiver: "",
  destination: "",
  packageType: logisticsPackageTypes[0],
  weight: "",
  price: "",
  paymentMethod: "cash",
};

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function getTransactionCourier(transaction) {
  return transaction.courier || transaction.ekspedisi || "-";
}

function getTransactionPaymentMethod(transaction) {
  return transaction.paymentMethod || transaction.payment_method || transaction.platform_sumber || "-";
}

export default function LogisticsPage() {
  const { loading, logisticsTransactions, createLogisticsTransaction, walletBalances } = useData();
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState("");
  const [courierFilter, setCourierFilter] = useState("semua");
  const [dateFilter, setDateFilter] = useState("");
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

  const selectedWallet = walletBalances.find((wallet) => wallet.id === form.paymentMethod);
  const isCashMethod = form.paymentMethod === "cash";
  const requiresWalletValidation = Boolean(
    form.paymentMethod && !["cash", "qris"].includes(form.paymentMethod)
  );
  const priceValue = Number(form.price || 0);
  const isWalletBalanceInsufficient =
    requiresWalletValidation &&
    priceValue > 0 &&
    Number(selectedWallet?.balance || 0) < priceValue;

  const filteredTransactions = useMemo(() => {
    const keyword = normalizeSearchValue(search);

    return logisticsTransactions.filter((transaction) => {
      const courier = getTransactionCourier(transaction);
      const receiver = transaction.receiver || transaction.receiver_name || "";
      const destination = transaction.destination || "";
      const matchesSearch = keyword
        ? normalizeSearchValue([receiver, destination, transaction.no_transaksi].join(" ")).includes(keyword)
        : true;
      const matchesCourier = courierFilter === "semua" ? true : courier === courierFilter;
      const matchesDate = dateFilter
        ? formatDateInput(new Date(transaction.created_at)) === dateFilter
        : true;

      return matchesSearch && matchesCourier && matchesDate;
    });
  }, [courierFilter, dateFilter, logisticsTransactions, search]);

  const totals = useMemo(
    () =>
      filteredTransactions.reduce(
        (acc, transaction) => {
          acc.transactions += 1;
          acc.revenue += Number(transaction.price || transaction.harga_jual || 0);
          acc.weight += Number(transaction.weight || 0);
          return acc;
        },
        { transactions: 0, revenue: 0, weight: 0 }
      ),
    [filteredTransactions]
  );

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.receiver.trim()) {
      showNotification("warning", "Nama penerima wajib diisi.");
      return;
    }

    if (!form.destination.trim()) {
      showNotification("warning", "Tujuan wajib diisi.");
      return;
    }

    if (Number(form.weight || 0) <= 0) {
      showNotification("warning", "Berat paket harus lebih besar dari 0.");
      return;
    }

    if (priceValue <= 0) {
      showNotification("warning", "Ongkir harus lebih besar dari 0.");
      return;
    }

    if (isWalletBalanceInsufficient) {
      showNotification("error", "Saldo tidak mencukupi, silakan isi saldo terlebih dahulu");
      return;
    }

    setSubmitting(true);

    try {
      const transaction = await createLogisticsTransaction({
        courier: form.courier,
        sender: form.sender.trim(),
        receiver: form.receiver.trim(),
        destination: form.destination.trim(),
        packageType: form.packageType,
        weight: Number(form.weight),
        price: priceValue,
        paymentMethod: form.paymentMethod,
      });
      showNotification(
        "success",
        `Transaksi logistik tersimpan dengan nomor ${transaction.no_transaksi}.`
      );
      setForm(initialForm);
    } catch (error) {
      showNotification("error", error.message || "Gagal menyimpan transaksi logistik.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="brand-panel px-6 py-10 text-slate-600">Memuat data logistik...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Logistik"
        title="Pencatatan transaksi logistik"
        description="Catat pengiriman JNE, Wahana, SiCepat, dan J&T dari aplikasi eksternal. POS hanya menyimpan transaksi, memvalidasi saldo wallet, dan tidak memproses resi atau API kurir."
        icon="truck"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Transaksi tampil
          </p>
          <p className="mt-3 text-3xl font-black text-slate-950">{totals.transactions}</p>
        </Panel>
        <Panel className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Total ongkir
          </p>
          <p className="mt-3 text-3xl font-black text-slate-950">
            {formatRupiah(totals.revenue)}
          </p>
        </Panel>
        <Panel className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Berat paket
          </p>
          <p className="mt-3 text-3xl font-black text-slate-950">
            {totals.weight.toLocaleString("id-ID", { maximumFractionDigits: 2 })} kg
          </p>
        </Panel>
        <Panel className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            No. berikutnya
          </p>
          <p className="mt-3 text-2xl font-black text-slate-950">{previewNumber}</p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Panel className="p-6 lg:col-span-4 rounded-3xl shadow-sm">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Input layanan logistik
          </h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Semua proses pengiriman tetap dilakukan di aplikasi kurir. Form ini hanya untuk catatan,
            laporan, dan kontrol saldo wallet.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Kurir</label>
              <select
                value={form.courier}
                onChange={(event) => handleChange("courier", event.target.value)}
                className="brand-select"
                required
              >
                {logisticsCouriers.map((courier) => (
                  <option key={courier} value={courier} className="bg-white">
                    {courier}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Jenis paket
              </label>
              <select
                value={form.packageType}
                onChange={(event) => handleChange("packageType", event.target.value)}
                className="brand-select"
                required
              >
                {logisticsPackageTypes.map((type) => (
                  <option key={type} value={type} className="bg-white">
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Nama pengirim
              </label>
              <input
                value={form.sender}
                onChange={(event) => handleChange("sender", event.target.value)}
                className="brand-input"
                placeholder="Opsional"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Nama penerima
              </label>
              <input
                value={form.receiver}
                onChange={(event) => handleChange("receiver", event.target.value)}
                className="brand-input"
                placeholder="Nama penerima"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Tujuan
              </label>
              <input
                value={form.destination}
                onChange={(event) => handleChange("destination", event.target.value)}
                className="brand-input"
                placeholder="Kota atau alamat tujuan"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Berat (kg)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.weight}
                onChange={(event) => handleChange("weight", event.target.value)}
                className="brand-input"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Ongkir
              </label>
              <input
                type="number"
                min="0"
                value={form.price}
                onChange={(event) => handleChange("price", event.target.value)}
                className="brand-input"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Metode pembayaran
              </label>
              <select
                value={form.paymentMethod}
                onChange={(event) => handleChange("paymentMethod", event.target.value)}
                className="brand-select"
                required
              >
                {walletPlatforms.map((wallet) => (
                  <option key={wallet.value} value={wallet.value} className="bg-white">
                    {wallet.label}
                  </option>
                ))}
              </select>
              <div
                className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
                  isWalletBalanceInsufficient
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                {isCashMethod ? (
                  <>
                    <span className="font-semibold">Cash</span>
                    <p className="mt-2">
                      Cash dapat dipakai untuk pembayaran, tetapi tidak divalidasi lewat saldo internal.
                    </p>
                  </>
                ) : (
                  <>
                    <span>Saldo {selectedWallet?.name || walletPlatformLabelMap[form.paymentMethod]}: </span>
                    <span className="font-semibold">
                      {formatRupiah(selectedWallet?.balance || 0)}
                    </span>
                    <p className="mt-2">
                      {isWalletBalanceInsufficient
                        ? selectedWallet?.balance === 0
                          ? "Saldo 0. Isi saldo manual dari halaman Saldo Internal. Transaksi tidak menambah saldo otomatis."
                          : "Saldo tidak mencukupi, silakan isi saldo terlebih dahulu"
                        : "Saldo hanya divalidasi. Transaksi logistik tidak mengubah saldo wallet."}
                    </p>
                  </>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="brand-button-success md:col-span-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Menyimpan..." : "Simpan Transaksi Logistik"}
            </button>
          </form>
        </Panel>

        <Panel variant="strong" className="p-6 lg:col-span-8 rounded-3xl shadow-sm">
          <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                Riwayat logistik
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {filteredTransactions.length} transaksi tampil
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[560px]">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="brand-input"
                placeholder="Cari penerima"
              />
              <select
                value={courierFilter}
                onChange={(event) => setCourierFilter(event.target.value)}
                className="brand-select"
              >
                <option value="semua" className="bg-white">
                  Semua kurir
                </option>
                {logisticsCouriers.map((courier) => (
                  <option key={courier} value={courier} className="bg-white">
                    {courier}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
                className="brand-input"
              />
            </div>
          </div>

          <div className="brand-scrollbar overflow-x-auto">
            <table className="brand-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Kurir</th>
                  <th>Penerima</th>
                  <th>Tujuan</th>
                  <th className="text-right">Berat</th>
                  <th className="text-right">Ongkir</th>
                  <th>Metode</th>
                  <th>Kasir</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-12 text-center text-slate-500">
                      Belum ada transaksi logistik untuk filter ini.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((transaction) => {
                    const paymentMethod = getTransactionPaymentMethod(transaction);
                    return (
                      <tr key={transaction.id}>
                        <td className="text-slate-600">
                          {formatDateTime(transaction.created_at, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="font-semibold text-slate-950">
                          {getTransactionCourier(transaction)}
                        </td>
                        <td className="text-slate-700">
                          {transaction.receiver || transaction.receiver_name || "-"}
                        </td>
                        <td className="min-w-[220px] text-slate-600">
                          {transaction.destination || "-"}
                          <p className="mt-1 text-xs text-slate-500">
                            {transaction.packageType || transaction.package_type || "Regular"}
                          </p>
                        </td>
                        <td className="text-right text-slate-600">
                          {Number(transaction.weight || 0).toLocaleString("id-ID", {
                            maximumFractionDigits: 2,
                          })}{" "}
                          kg
                        </td>
                        <td className="text-right font-semibold text-slate-950">
                          {formatRupiah(transaction.price || transaction.harga_jual)}
                        </td>
                        <td className="text-slate-600">
                          {walletPlatformLabelMap[paymentMethod] || paymentMethod}
                        </td>
                        <td className="text-slate-600">
                          {formatCashierName(transaction.cashier || transaction.kasir_id)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
