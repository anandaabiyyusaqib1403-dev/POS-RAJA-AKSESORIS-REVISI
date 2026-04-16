import { useEffect, useMemo, useState } from "react";
import Panel from "../components/app/Panel";
import PageHeader from "../components/app/PageHeader";
import ReceiptModal from "../components/ReceiptModal";
import { useData } from "../contexts/DataContext";
import { showNotification } from "../contexts/NotificationContext";
import {
  walletPlatformLabelMap,
  walletPlatforms,
} from "../data/businessOptions";
import { productCategoryGroups } from "../data/productCategories";
import { formatPlainNumber, formatRupiah, startOfDay } from "../utils/format";

const QUICK_AMOUNTS = [10000, 20000, 50000, 100000, 200000, 500000];

const accessoryCategoryOrder = productCategoryGroups
  .filter((group) => !["digital", "layanan-tambahan"].includes(group.slug))
  .flatMap((group) => group.categories);

const categoryHelperMap = {
  Charger: "Adaptor, kepala charger, dan travel charger",
  "Tempered Glass": "Pelindung layar dan kaca anti gores",
  Casing: "Soft case, hard case, dan armor",
  "Power Bank": "Power bank dan baterai cadangan",
  Earphone: "Headset, handsfree, dan TWS",
  Kabel: "Kabel data, OTG, dan audio",
  "Holder HP": "Holder meja, mobil, dan stand",
  Tongsis: "Tripod, selfie stick, dan holder video",
  "Memory Card": "MicroSD dan media penyimpanan",
  "Flashdisk OTG": "Flashdisk ponsel dan OTG",
  "Waterproof Case": "Pelindung tahan air",
  Speaker: "Speaker Bluetooth dan mini speaker",
  "Aksesoris Lainnya": "Produk pelengkap dan kategori umum",
};

const categoryLabelMap = {
  Earphone: "Headset / Earphone",
};

function formatQuickAmountLabel(amount) {
  return amount >= 1000 ? `${formatPlainNumber(amount / 1000)}k` : formatPlainNumber(amount);
}

function getStockBadge(product) {
  if (product.stok === 0) {
    return {
      label: "Habis",
      className: "bg-slate-100 text-slate-500",
      helper: "Stok kosong",
    };
  }

  if (product.stok <= 5) {
    return {
      label: `${product.stok} stok`,
      className: "bg-[var(--brand-gold)]/18 text-[var(--brand-gold)]",
      helper: "Stok tipis",
    };
  }

  return {
    label: `${product.stok} stok`,
    className: "bg-emerald-100 text-emerald-700",
    helper: "Siap jual",
  };
}

export default function CashierPage() {
  const {
    products,
    accessoryTransactions,
    createAccessoryTransaction,
    loading,
    walletBalances,
  } = useData();
  const [activeCategory, setActiveCategory] = useState("semua");
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [note, setNote] = useState("");
  const [cart, setCart] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const [processing, setProcessing] = useState(false);

  const accessoryProducts = useMemo(
    () => products.filter((product) => product.aktif),
    [products]
  );

  const categorySummaries = useMemo(() => {
    const grouped = accessoryProducts.reduce((acc, product) => {
      const category = product.kategori || "Aksesoris Lainnya";
      acc[category] ??= {
        key: category,
        rawLabel: category,
        label: categoryLabelMap[category] || category,
        helper: categoryHelperMap[category] || "Kategori produk",
        count: 0,
        availableCount: 0,
      };
      acc[category].count += 1;
      if (product.stok > 0) {
        acc[category].availableCount += 1;
      }
      return acc;
    }, {});

    const orderedCategories = Object.values(grouped).sort((left, right) => {
      const leftIndex = accessoryCategoryOrder.indexOf(left.key);
      const rightIndex = accessoryCategoryOrder.indexOf(right.key);

      if (leftIndex === -1 && rightIndex === -1) {
        return left.label.localeCompare(right.label);
      }
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    });

    return [
      {
        key: "semua",
        rawLabel: "semua",
        label: "Semua Kategori",
        helper: "Lihat semua produk aktif sekaligus",
        count: accessoryProducts.length,
        availableCount: accessoryProducts.filter((product) => product.stok > 0).length,
      },
      ...orderedCategories,
    ];
  }, [accessoryProducts]);

  useEffect(() => {
    const hasActiveCategory = categorySummaries.some((category) => category.key === activeCategory);
    if (!hasActiveCategory) {
      setActiveCategory("semua");
    }
  }, [activeCategory, categorySummaries]);

  const selectedCategoryProducts = useMemo(() => {
    if (activeCategory === "semua") {
      return accessoryProducts;
    }

    return accessoryProducts.filter((product) => product.kategori === activeCategory);
  }, [accessoryProducts, activeCategory]);

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return selectedCategoryProducts
      .filter((product) => {
        if (!keyword) return true;

        return (
          product.nama.toLowerCase().includes(keyword) ||
          product.kategori.toLowerCase().includes(keyword) ||
          (product.kode_produk || "").toLowerCase().includes(keyword)
        );
      })
      .sort((left, right) => {
        if ((left.stok > 0) !== (right.stok > 0)) {
          return left.stok > 0 ? -1 : 1;
        }

        return left.nama.localeCompare(right.nama);
      });
  }, [search, selectedCategoryProducts]);

  const exactCodeMatch = useMemo(
    () =>
      accessoryProducts.find(
        (product) =>
          product.stok > 0 &&
          (product.kode_produk || "").toLowerCase() === search.trim().toLowerCase()
      ) || null,
    [accessoryProducts, search]
  );

  const todayAccessorySummary = useMemo(() => {
    const today = startOfDay(new Date());
    const todayTransactions = accessoryTransactions.filter(
      (transaction) => new Date(transaction.created_at) >= today
    );

    return {
      totalTrx: todayTransactions.length,
      totalOmzet: todayTransactions.reduce((sum, transaction) => sum + transaction.total_bayar, 0),
      totalItem: todayTransactions.reduce(
        (sum, transaction) =>
          sum + (transaction.items || []).reduce((itemSum, item) => itemSum + item.qty, 0),
        0
      ),
    };
  }, [accessoryTransactions]);

  const activeCategoryConfig =
    categorySummaries.find((category) => category.key === activeCategory) || categorySummaries[0];

  const cartQuantity = cart.reduce((sum, item) => sum + item.qty, 0);
  const total = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const uangDiterima = paymentMethod === "cash" ? Number(cashReceived || 0) : total;
  const kurang = paymentMethod === "cash" && uangDiterima < total ? total - uangDiterima : 0;
  const kembalian = paymentMethod === "cash" ? Math.max(0, uangDiterima - total) : 0;
  const isPaymentInsufficient = paymentMethod === "cash" && total > 0 && uangDiterima < total;
  const selectedWallet = walletBalances.find((wallet) => wallet.id === paymentMethod);
  const requiresWalletValidation = !["cash", "qris"].includes(paymentMethod);
  const isWalletBalanceInsufficient =
    requiresWalletValidation && total > 0 && Number(selectedWallet?.balance || 0) < total;

  const readyProductsCount = filteredProducts.filter((product) => product.stok > 0).length;
  const emptyProductsCount = filteredProducts.filter((product) => product.stok === 0).length;

  const addToCart = (product) => {
    if (product.stok <= 0) {
      showNotification("warning", `Stok ${product.nama} sedang habis.`);
      return;
    }

    const existing = cart.find((item) => item.id === product.id);
    if (existing && existing.qty >= product.stok) {
      showNotification("warning", `Jumlah ${product.nama} sudah mencapai batas stok.`);
      return;
    }

    if (product.stok <= Math.max(Number(product.stok_minimum || 0), 5)) {
      showNotification("warning", `Stok ${product.nama} tinggal ${product.stok} item.`);
    }

    setCart((prev) => {
      const currentItem = prev.find((item) => item.id === product.id);
      if (currentItem) {
        const nextQty = Math.min(currentItem.qty + 1, product.stok);
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
    setCashReceived("");
    setPaymentMethod("cash");
    setNote("");
    setReceipt(null);
  };

  const handleResetTransaction = (message = "Transaksi direset. Siap untuk mulai lagi.") => {
    resetTransaction();
    showNotification("info", message);
  };

  const handleCheckout = async () => {
    if (!cart.length) return;
    if (isPaymentInsufficient) {
      showNotification("warning", "Uang diterima kurang dari total belanja.");
      return;
    }
    // Note: Accessory transactions do not validate wallet balance

    setProcessing(true);
    try {
      const transaction = await createAccessoryTransaction({
        items: cart,
        metodeBayar: paymentMethod,
        uangDiterima,
        catatan: note,
      });

      showNotification("success", `Transaksi ${transaction.no_transaksi} berhasil disimpan.`);
      setReceipt(transaction);
      setCart([]);
      setCashReceived("");
      setNote("");
    } catch (error) {
      showNotification("error", error.message || "Gagal menyimpan transaksi.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div className="brand-panel px-6 py-10 text-slate-900">Memuat halaman kasir...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="POS Core"
        title="Kasir cepat untuk counter Raja Aksesoris"
        description="Saya rapikan supaya kasir lebih cepat scan, pilih kategori, tambah barang ke cart, lalu checkout tanpa bingung lihat layar."
        icon="pos"
      />

      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <Panel className="overflow-hidden p-0">
          <div className="h-full bg-gradient-to-br from-white via-[var(--brand-gold)]/6 to-white p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Transaksi hari ini</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              {todayAccessorySummary.totalTrx}
            </p>
            <p className="mt-2 text-sm text-slate-600">Jumlah checkout aksesoris yang sudah selesai.</p>
          </div>
        </Panel>
        <Panel className="overflow-hidden p-0">
          <div className="h-full bg-gradient-to-br from-white via-emerald-50 to-white p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Omzet hari ini</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              {formatRupiah(todayAccessorySummary.totalOmzet)}
            </p>
            <p className="mt-2 text-sm text-slate-600">Total penjualan aksesoris untuk hari ini.</p>
          </div>
        </Panel>
        <Panel className="overflow-hidden p-0">
          <div className="h-full bg-gradient-to-br from-white via-sky-50 to-white p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Item terjual</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              {todayAccessorySummary.totalItem}
            </p>
            <p className="mt-2 text-sm text-slate-600">Total item yang keluar dari stok hari ini.</p>
          </div>
        </Panel>
        <Panel className="overflow-hidden p-0">
          <div className="h-full bg-gradient-to-br from-white via-orange-50 to-white p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Kategori aktif</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              {categorySummaries.length - 1}
            </p>
            <p className="mt-2 text-sm text-slate-600">Kategori aksesoris yang siap dipilih kasir.</p>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_380px]">
        <main className="space-y-6">
          <Panel className="overflow-hidden p-0">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1.2fr)_320px]">
              <div className="bg-[radial-gradient(circle_at_top_left,_rgba(212,175,55,0.18),_transparent_42%),linear-gradient(135deg,#FFFFFF_0%,#FFF9E6_100%)] p-6 sm:p-7">
                <p className="text-sm font-semibold uppercase tracking-[0.26em] text-[var(--brand-gold)]">
                  Scan Cepat
                </p>
                <h3 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-950">
                  Scan atau cari produk
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                  Ketik nama barang atau scan barcode. Kalau barcode cocok persis, tekan Enter dan
                  produk langsung masuk cart.
                </p>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
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
                    className="brand-input h-14 flex-1 px-5 text-base font-semibold"
                    placeholder="Scan barcode atau ketik nama produk..."
                    autoFocus
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="brand-button-secondary whitespace-nowrap"
                    >
                      Hapus Cari
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600">
                    {filteredProducts.length} hasil tampil
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600">
                    {readyProductsCount} siap jual
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600">
                    {cartQuantity} item di cart
                  </span>
                </div>

                {exactCodeMatch ? (
                  <div className="mt-5 rounded-[28px] border border-[var(--brand-gold)]/20 bg-white/90 p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
                      Barcode cocok
                    </p>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-950">{exactCodeMatch.nama}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {exactCodeMatch.kategori} · {formatRupiah(exactCodeMatch.harga_jual)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          addToCart(exactCodeMatch);
                          setSearch("");
                        }}
                        className="brand-button-primary"
                      >
                        Tambah Cepat
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-slate-200 bg-slate-50/80 p-6 lg:border-l lg:border-t-0">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Fokus Kasir
                </p>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-[28px] border border-white bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                      Kategori terpilih
                    </p>
                    <p className="mt-3 text-xl font-black text-slate-950">
                      {activeCategoryConfig?.label || "Semua Kategori"}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {activeCategoryConfig?.helper || "Pilih kategori supaya daftar produk lebih fokus."}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-[24px] border border-white bg-white p-4 shadow-sm">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Siap jual</p>
                      <p className="mt-2 text-2xl font-black text-slate-950">{readyProductsCount}</p>
                    </div>
                    <div className="rounded-[24px] border border-white bg-white p-4 shadow-sm">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Stok habis</p>
                      <p className="mt-2 text-2xl font-black text-slate-950">{emptyProductsCount}</p>
                    </div>
                  </div>
                  <div className="rounded-[28px] border border-white bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Tips kasir</p>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                      <p>Gunakan kategori untuk mempercepat pencarian produk yang sering terjual.</p>
                      <p>Periksa stok habis sebelum checkout agar kasir tidak menjual produk yang kosong.</p>
                      <p>Jika barcode cocok, pilih tombol Tambah Cepat untuk input lebih cepat.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--brand-gold)]">
                  Kategori Produk
                </p>
                <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
                  Pilih kategori lebih cepat
                </h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  Kategori dibuat jadi chip horizontal supaya kasir bisa pindah tampilan produk tanpa
                  kehilangan fokus dari area utama.
                </p>
              </div>
              {search ? (
                <p className="text-sm text-slate-500">
                  Pencarian aktif untuk <span className="font-semibold text-slate-900">{search}</span>
                </p>
              ) : null}
            </div>

            <div className="brand-scrollbar mt-5 flex gap-3 overflow-x-auto pb-2">
              {categorySummaries.map((category) => {
                const isActive = activeCategory === category.key;

                return (
                  <button
                    key={category.key}
                    type="button"
                    onClick={() => setActiveCategory(category.key)}
                    className={`min-w-[210px] rounded-[26px] border px-4 py-4 text-left transition ${
                      isActive
                        ? "border-[var(--brand-gold)]/24 bg-[var(--brand-gold)]/10 shadow-sm"
                        : "border-slate-200 bg-white hover:border-[var(--brand-gold)]/18 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{category.label}</p>
                        <p className="mt-1 text-xs leading-6 text-slate-500">{category.helper}</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500">
                        {category.count}
                      </span>
                    </div>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {category.availableCount} siap jual
                    </p>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel className="p-6">
            <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--brand-gold)]">
                  {activeCategoryConfig?.label || "Daftar Produk"}
                </p>
                <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
                  Produk siap dipilih
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                  {activeCategoryConfig
                    ? `${filteredProducts.length} produk tampil. Klik kartu untuk menambahkan barang ke cart tanpa popup tambahan.`
                    : "Pilih kategori untuk menampilkan produk."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">
                  {readyProductsCount} tersedia
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">
                  {emptyProductsCount} habis
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredProducts.length === 0 ? (
                <div className="col-span-full rounded-[30px] border border-dashed border-slate-200 bg-slate-50 px-4 py-16 text-center text-sm text-slate-500">
                  Produk tidak ditemukan untuk kategori atau kata kunci tersebut.
                </div>
              ) : (
                filteredProducts.map((product) => {
                  const inCart = cart.find((item) => item.id === product.id);
                  const disabled = product.stok <= 0;
                  const stockBadge = getStockBadge(product);

                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addToCart(product)}
                      disabled={disabled}
                      className={`group flex h-full flex-col rounded-[30px] border p-5 text-left shadow-sm transition duration-200 ${
                        disabled
                          ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                          : inCart
                            ? "border-[var(--brand-gold)]/24 bg-[var(--brand-gold)]/10 hover:shadow-md"
                            : "border-slate-200 bg-white hover:-translate-y-1 hover:border-[var(--brand-gold)]/24 hover:bg-[var(--brand-gold)]/5 hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                            {product.kategori}
                          </p>
                          <h4 className="mt-3 line-clamp-2 text-base font-bold leading-tight text-slate-950">
                            {product.nama}
                          </h4>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${stockBadge.className}`}
                        >
                          {stockBadge.label}
                        </span>
                      </div>

                      <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-2">
                        <p className="font-mono text-[11px] text-slate-500">
                          {product.kode_produk || "Tanpa kode produk"}
                        </p>
                      </div>

                      <div className="mt-5 flex-1">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Harga jual</p>
                        <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                          {formatRupiah(product.harga_jual)}
                        </p>
                      </div>

                      <div className="mt-5 flex items-center justify-between gap-3">
                        <div className="text-sm text-slate-500">
                          {disabled ? "Tidak bisa dijual" : stockBadge.helper}
                        </div>
                        {inCart ? (
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--brand-gold)] shadow-sm">
                            {inCart.qty} di cart
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                            Tambah
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Panel>
        </main>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <Panel className="overflow-hidden p-0">
            <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAFC_100%)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Cart
                  </p>
                  <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
                    Ringkasan belanja
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    {cart.length} produk, {cartQuantity} item total.
                  </p>
                </div>
                {cart.length ? (
                  <button
                    type="button"
                    onClick={() => handleResetTransaction()}
                    className="brand-button-secondary"
                  >
                    Reset
                  </button>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[24px] border border-white bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Item</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{cartQuantity}</p>
                </div>
                <div className="rounded-[24px] border border-[var(--brand-gold)]/18 bg-[var(--brand-gold)]/10 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{formatRupiah(total)}</p>
                </div>
              </div>
            </div>

            <div className="p-5">
              <div
                className="brand-scrollbar space-y-3 overflow-y-auto pr-1"
                style={{ maxHeight: "300px" }}
              >
                {cart.length ? (
                  cart.map((item) => (
                    <div key={item.id} className="rounded-[26px] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-950">{item.nama}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatRupiah(item.harga_jual)} per item
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, 0)}
                          className="text-xs font-semibold text-slate-500"
                        >
                          Hapus
                        </button>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateQty(item.id, item.qty - 1)}
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-950"
                          >
                            -
                          </button>
                          <span className="min-w-[36px] text-center text-sm font-semibold text-slate-950">
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQty(item.id, item.qty + 1)}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-gold)]/16 text-[var(--brand-gold)]"
                          >
                            +
                          </button>
                        </div>
                        <p className="font-bold text-slate-950">{formatRupiah(item.subtotal)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-4 py-14 text-center text-sm text-slate-500">
                    Keranjang masih kosong. Klik produk untuk mulai transaksi.
                  </div>
                )}
              </div>

              <div className="mt-5 border-t border-slate-200 pt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">
                  Pembayaran
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {walletPlatforms.map((method) => (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => setPaymentMethod(method.value)}
                      className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                        paymentMethod === method.value
                          ? "bg-[var(--brand-gold)] text-slate-950"
                          : "border border-slate-200 bg-slate-50 text-slate-600"
                      }`}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>

                {paymentMethod === "cash" ? (
                  <div className="mt-5 space-y-4">
                    <input
                      type="number"
                      min="0"
                      value={cashReceived}
                      onChange={(event) => setCashReceived(event.target.value)}
                      className="brand-input"
                      placeholder="Uang diterima"
                    />

                    <div className="grid grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => setCashReceived(String(total))}
                        className={`rounded-2xl px-3 py-2 text-xs font-semibold ${
                          Number(cashReceived) === total && total > 0
                            ? "bg-[var(--brand-gold)] text-slate-950"
                            : "bg-slate-50 text-slate-600"
                        }`}
                      >
                        Pas
                      </button>
                      {QUICK_AMOUNTS.map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => setCashReceived(String(amount))}
                          className={`rounded-2xl px-3 py-2 text-xs font-semibold ${
                            Number(cashReceived) === amount
                              ? "bg-[var(--brand-gold)] text-slate-950"
                              : "bg-slate-50 text-slate-600"
                          }`}
                        >
                          {formatQuickAmountLabel(amount)}
                        </button>
                      ))}
                    </div>

                    <div
                      className={`rounded-[24px] border px-4 py-4 text-sm ${
                        kurang > 0
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-[var(--brand-gold)]/20 bg-[var(--brand-gold)]/10 text-slate-700"
                      }`}
                    >
                      {cashReceived
                        ? kurang > 0
                          ? `Kurang ${formatRupiah(kurang)}`
                          : `Kembalian ${formatRupiah(kembalian)}`
                        : "Masukkan uang diterima untuk menghitung status pembayaran."}
                    </div>
                  </div>
                ) : paymentMethod === "qris" ? (
                  <div className="mt-5 space-y-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    <p>
                      QRIS selalu boleh dipakai dan transaksi QRIS tidak mengubah saldo wallet.
                      Update saldo dilakukan manual dari halaman Saldo Internal.
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    <p>
                      Saldo {walletPlatformLabelMap[paymentMethod] || paymentMethod}:{" "}
                      <span className="font-semibold">
                        {formatRupiah(selectedWallet?.balance || 0)}
                      </span>
                    </p>
                    <p className="mt-2">
                      Transaksi aksesoris tidak mempengaruhi saldo wallet. Saldo hanya untuk validasi transaksi layanan.
                    </p>
                  </div>
                )}

                <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>Total belanja</span>
                    <span className="font-semibold text-slate-950">{formatRupiah(total)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                    <span>Bayar</span>
                    <span className="font-semibold text-slate-950">{formatRupiah(uangDiterima)}</span>
                  </div>
                </div>

                <div className="mt-5">
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className="brand-textarea"
                    placeholder="Catatan transaksi opsional"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={!cart.length || processing || isPaymentInsufficient}
                  className="brand-button-success mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processing ? "Menyimpan transaksi..." : "Checkout Sekarang"}
                </button>
              </div>
            </div>
          </Panel>
        </aside>
      </div>

      <ReceiptModal
        transaction={receipt}
        onClose={() => setReceipt(null)}
        onNewTransaction={() =>
          handleResetTransaction("Layar siap untuk transaksi berikutnya.")
        }
      />
    </div>
  );
}
