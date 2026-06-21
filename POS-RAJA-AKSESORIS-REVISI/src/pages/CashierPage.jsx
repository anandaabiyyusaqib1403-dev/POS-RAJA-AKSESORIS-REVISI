import { useMemo, useState } from "react";
import ReceiptModal from "../components/ReceiptModal";
import { useData } from "../contexts/DataContext";
import { formatPlainNumber, formatRupiah, startOfDay } from "../utils/format";

const QUICK_AMOUNTS = [10000, 20000, 50000, 100000, 200000, 500000];

export default function CashierPage() {
  const {
    products,
    categories,
    accessoryTransactions,
    createAccessoryTransaction,
    loading,
  } = useData();
  const [selectedCategory, setSelectedCategory] = useState("Semua");
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("tunai");
  const [cashReceived, setCashReceived] = useState("");
  const [note, setNote] = useState("");
  const [cart, setCart] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const [processing, setProcessing] = useState(false);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (!product.aktif) return false;

      const matchesCategory =
        selectedCategory === "Semua" || product.kategori === selectedCategory;
      const keyword = search.toLowerCase();
      const matchesSearch =
        product.nama.toLowerCase().includes(keyword) ||
        product.kategori.toLowerCase().includes(keyword) ||
        (product.kode_produk || "").toLowerCase().includes(keyword);

      return matchesCategory && matchesSearch;
    });
  }, [products, search, selectedCategory]);

  const exactCodeMatch = useMemo(
    () =>
      products.find(
        (product) =>
          product.aktif &&
          product.stok > 0 &&
          (product.kode_produk || "").toLowerCase() === search.trim().toLowerCase()
      ) || null,
    [products, search]
  );

  const todaySummary = useMemo(() => {
    const today = startOfDay(new Date());
    const todayTransactions = accessoryTransactions.filter(
      (transaction) => new Date(transaction.created_at) >= today
    );

    return {
      totalTrx: todayTransactions.length,
      totalOmzet: todayTransactions.reduce(
        (sum, transaction) => sum + transaction.total_bayar,
        0
      ),
      totalItem: todayTransactions.reduce(
        (sum, transaction) =>
          sum +
          (transaction.items || []).reduce(
            (itemSum, item) => itemSum + item.qty,
            0
          ),
        0
      ),
    };
  }, [accessoryTransactions]);

  const total = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const uangDiterima = paymentMethod === "tunai" ? Number(cashReceived || 0) : total;
  const kembalian = paymentMethod === "tunai" ? Math.max(0, uangDiterima - total) : 0;
  const kurang = paymentMethod === "tunai" && uangDiterima < total ? total - uangDiterima : 0;
  const isPaymentInsufficient = paymentMethod === "tunai" && total > 0 && uangDiterima < total;

  const addToCart = (product) => {
    if (product.stok <= 0 || !product.aktif) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        const nextQty = Math.min(existing.qty + 1, product.stok);
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, qty: nextQty, subtotal: nextQty * item.harga_jual }
            : item
        );
      }

      return [...prev, { ...product, qty: 1, subtotal: product.harga_jual }];
    });
  };

  const updateQty = (id, nextQty) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id !== id) return item;

          const safeQty = Math.min(Math.max(nextQty, 0), item.stok);
          return { ...item, qty: safeQty, subtotal: safeQty * item.harga_jual };
        })
        .filter((item) => item.qty > 0)
    );
  };

  const resetTransaction = () => {
    setCart([]);
    setPaymentMethod("tunai");
    setCashReceived("");
    setNote("");
    setReceipt(null);
  };

  const handleCheckout = async () => {
    if (!cart.length) return;
    if (isPaymentInsufficient) {
      window.alert("Uang diterima kurang dari total belanja.");
      return;
    }

    setProcessing(true);
    try {
      const transaction = await createAccessoryTransaction({
        items: cart,
        metodeBayar: paymentMethod,
        uangDiterima,
        catatan: note,
      });

      setReceipt(transaction);
      setCart([]);
      setCashReceived("");
      setNote("");
    } catch (error) {
      window.alert(error.message || "Gagal menyimpan transaksi.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div className="rounded-3xl bg-white p-8 text-slate-600">Memuat data kasir...</div>;
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: "Transaksi hari ini", value: todaySummary.totalTrx, suffix: "trx" },
          { label: "Omzet hari ini", value: formatRupiah(todaySummary.totalOmzet), raw: true },
          { label: "Item terjual", value: todaySummary.totalItem, suffix: "pcs" },
        ].map(({ label, value, suffix, raw }) => (
          <div key={label} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-black text-[#1e3a5f]">
              {raw ? value : `${value}${suffix ? ` ${suffix}` : ""}`}
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4 rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-black text-[#1e3a5f]">Transaksi Aksesoris</h2>
              <p className="text-sm text-slate-500">
                Pindai kode produk atau cari nama produk lalu atur jumlah di keranjang.
              </p>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && exactCodeMatch) {
                  event.preventDefault();
                  addToCart(exactCodeMatch);
                  setSearch("");
                }
              }}
              placeholder="Scan / cari nama / kode produk..."
              className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100 lg:max-w-xs"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {["Semua", ...categories].map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                  selectedCategory === category
                    ? "bg-[#1e3a5f] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.length === 0 ? (
              <div className="col-span-3 py-10 text-center text-sm text-slate-500">
                Tidak ada produk ditemukan.
              </div>
            ) : (
              filteredProducts.map((product) => {
                const disabled = product.stok <= 0;
                const inCart = cart.find((item) => item.id === product.id);

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addToCart(product)}
                    disabled={disabled}
                    className={`relative rounded-[28px] border p-4 text-left transition ${
                      disabled
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                        : inCart
                          ? "border-[#1e3a5f] bg-blue-50 hover:-translate-y-0.5 hover:shadow-lg"
                          : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-[#1e3a5f] hover:shadow-lg"
                    }`}
                  >
                    {inCart ? (
                      <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[#1e3a5f] text-xs font-bold text-white">
                        {inCart.qty}
                      </span>
                    ) : null}
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {product.kategori}
                    </p>
                    {product.kode_produk ? (
                      <p className="mt-1 font-mono text-[11px] font-semibold text-slate-500">
                        {product.kode_produk}
                      </p>
                    ) : null}
                    <h3 className="mt-2 text-sm font-bold leading-tight text-slate-900">
                      {product.nama}
                    </h3>
                    <p className="mt-3 text-base font-black text-[#1e3a5f]">
                      {formatRupiah(product.harga_jual)}
                    </p>
                    <p
                      className={`mt-1 text-xs ${
                        disabled ? "font-semibold text-red-500" : "text-slate-500"
                      }`}
                    >
                      Stok: {formatPlainNumber(product.stok)}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <aside className="space-y-4 rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-2xl font-black text-[#1e3a5f]">Keranjang</h2>
            <p className="text-sm text-slate-500">
              {cart.length} item | {formatRupiah(total)}
            </p>
          </div>

          <div className="space-y-3 overflow-y-auto" style={{ maxHeight: "320px" }}>
            {cart.length ? (
              cart.map((item) => (
                <div key={item.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      {item.kode_produk ? (
                        <p className="mb-1 font-mono text-[11px] font-semibold text-slate-500">
                          {item.kode_produk}
                        </p>
                      ) : null}
                      <h3 className="text-sm font-semibold leading-tight text-slate-900">
                        {item.nama}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {formatRupiah(item.harga_jual)} / item
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateQty(item.id, 0)}
                      className="text-xs font-semibold text-red-500 hover:text-red-700"
                    >
                      Hapus
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQty(item.id, item.qty - 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg font-bold text-slate-700 shadow"
                      >
                        -
                      </button>
                      <span className="min-w-8 text-center text-sm font-semibold text-slate-900">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(item.id, item.qty + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg font-bold text-slate-700 shadow"
                      >
                        +
                      </button>
                    </div>
                    <p className="font-bold text-[#1e3a5f]">{formatRupiah(item.subtotal)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
                Keranjang kosong.
                <br />
                Pilih produk di sebelah kiri.
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-slate-900 p-4 text-white">
            <div className="flex items-center justify-between">
              <span className="text-sm">Total Belanja</span>
              <span className="text-2xl font-black">{formatRupiah(total)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Metode Bayar</label>
            <div className="grid grid-cols-3 gap-2">
              {["tunai", "qris", "transfer"].map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`rounded-2xl px-3 py-2.5 text-sm font-semibold uppercase ${
                    paymentMethod === method
                      ? "bg-[#1e3a5f] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          {paymentMethod === "tunai" ? (
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">Uang Diterima</label>
              <input
                type="number"
                min="0"
                value={cashReceived}
                onChange={(event) => setCashReceived(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                placeholder="0"
              />

              <div className="grid grid-cols-3 gap-2">
                {QUICK_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setCashReceived(String(amount))}
                    className={`rounded-xl py-2 text-xs font-semibold transition ${
                      Number(cashReceived) === amount
                        ? "bg-[#1e3a5f] text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {`${amount / 1000}rb`}
                  </button>
                ))}
              </div>

              {cashReceived ? (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                    kurang > 0
                      ? "bg-red-50 text-red-700"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {kurang > 0
                    ? `Kurang: ${formatRupiah(kurang)}`
                    : `Kembalian: ${formatRupiah(kembalian)}`}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              Catatan (opsional)
            </label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
              placeholder="Misal: pelanggan reguler, barang titipan..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={resetTransaction}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleCheckout}
              disabled={!cart.length || processing || isPaymentInsufficient}
              className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {processing ? "Menyimpan..." : "Proses Bayar"}
            </button>
          </div>
        </aside>
      </div>

      <ReceiptModal
        transaction={receipt}
        onClose={() => setReceipt(null)}
        onNewTransaction={resetTransaction}
      />
    </div>
  );
}
