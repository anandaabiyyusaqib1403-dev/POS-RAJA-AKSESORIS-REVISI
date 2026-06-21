import { useMemo, useState } from "react";
import { useData } from "../contexts/DataContext";
import { formatDateTime, formatPlainNumber, formatRupiah } from "../utils/format";
import { productCategoryGroups } from "../data/productCategories";

const emptyForm = {
  id: "",
  kode_produk: "",
  nama: "",
  kategori: "",
  harga_beli: "",
  harga_jual: "",
  stok: "",
  stok_minimum: "3",
  satuan: "pcs",
  aktif: true,
};

const emptyMutationForm = {
  productId: "",
  tipe: "masuk",
  jumlah: "",
  referensi: "",
  catatan: "",
};

function StokBadge({ stok, stokMinimum }) {
  if (stok === 0) {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
        Habis
      </span>
    );
  }

  if (stok <= stokMinimum) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
        Menipis
      </span>
    );
  }

  return (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
      Aman
    </span>
  );
}

function MutationBadge({ tipe }) {
  const styles = {
    masuk: "bg-emerald-100 text-emerald-700",
    keluar: "bg-rose-100 text-rose-700",
    penyesuaian: "bg-amber-100 text-amber-700",
  };

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        styles[tipe] || "bg-slate-100 text-slate-700"
      }`}
    >
      {tipe}
    </span>
  );
}

function getMutationHint(tipe) {
  if (tipe === "masuk") {
    return "Stok masuk untuk pembelian dari supplier. Isi jumlah positif.";
  }

  if (tipe === "keluar") {
    return "Stok keluar manual selain penjualan kasir. Isi jumlah positif.";
  }

  return "Penyesuaian stok. Gunakan angka negatif untuk hilang/rusak, positif untuk koreksi tambah.";
}

export default function ProductsPage() {
  const {
    products,
    categories,
    stockMutations,
    saveProduct,
    updateProductStatus,
    saveStockMutation,
  } = useData();
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [categoryGroup, setCategoryGroup] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("Semua");
  const [statusFilter, setStatusFilter] = useState("semua");
  const [mutationForm, setMutationForm] = useState(emptyMutationForm);
  const [showAllLogs, setShowAllLogs] = useState(false);

  const activeCategoryGroup = productCategoryGroups.find((group) => group.slug === categoryGroup);
  const availableCategoryOptions = activeCategoryGroup ? activeCategoryGroup.categories : categories;

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const keyword = search.toLowerCase();
      const matchSearch =
        product.nama.toLowerCase().includes(keyword) ||
        product.kategori.toLowerCase().includes(keyword) ||
        (product.kode_produk || "").toLowerCase().includes(keyword);
      const matchGroup =
        categoryGroup === "all" ||
        activeCategoryGroup?.categories.includes(product.kategori);
      const matchCategory = categoryFilter === "Semua" || product.kategori === categoryFilter;
      const matchStatus =
        statusFilter === "semua"
          ? true
          : statusFilter === "habis"
            ? product.stok === 0
            : product.stok <= product.stok_minimum && product.stok > 0;

      return matchSearch && matchGroup && matchCategory && matchStatus;
    });
  }, [activeCategoryGroup, categoryFilter, categoryGroup, products, search, statusFilter]);

  const inventoryStats = useMemo(() => {
    const totalNilai = products.reduce((sum, product) => sum + product.harga_beli * product.stok, 0);
    const totalNilaiJual = products.reduce(
      (sum, product) => sum + product.harga_jual * product.stok,
      0
    );
    const jumlahHabis = products.filter((product) => product.stok === 0).length;
    const jumlahMenipis = products.filter(
      (product) => product.stok > 0 && product.stok <= product.stok_minimum
    ).length;

    return {
      totalNilai,
      totalNilaiJual,
      jumlahHabis,
      jumlahMenipis,
      totalProduk: products.length,
    };
  }, [products]);

  const margin = useMemo(() => {
    const beli = Number(form.harga_beli || 0);
    const jual = Number(form.harga_jual || 0);
    if (!beli) return 0;
    return ((jual - beli) / beli) * 100;
  }, [form.harga_beli, form.harga_jual]);

  const editProduct = (product) => {
    setForm({
      id: product.id,
      kode_produk: product.kode_produk || "",
      nama: product.nama,
      kategori: product.kategori,
      harga_beli: String(product.harga_beli),
      harga_jual: String(product.harga_jual),
      stok: String(product.stok),
      stok_minimum: String(product.stok_minimum),
      satuan: product.satuan,
      aktif: product.aktif,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitProduct = async (event) => {
    event.preventDefault();
    try {
      await saveProduct(form);
      setForm(emptyForm);
    } catch (error) {
      window.alert(error.message || "Gagal menyimpan produk.");
    }
  };

  const submitMutation = async (event) => {
    event.preventDefault();
    if (!mutationForm.productId || !mutationForm.jumlah) return;

    try {
      await saveStockMutation({
        productId: mutationForm.productId,
        tipe: mutationForm.tipe,
        jumlah: Number(mutationForm.jumlah),
        referensi: mutationForm.referensi,
        catatan: mutationForm.catatan,
      });
      setMutationForm(emptyMutationForm);
    } catch (error) {
      window.alert(error.message || "Gagal menyimpan mutasi stok.");
    }
  };

  const displayedLogs = showAllLogs ? stockMutations : stockMutations.slice(0, 8);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Total Produk", value: inventoryStats.totalProduk, suffix: "jenis" },
          { label: "Nilai Modal Stok", value: formatRupiah(inventoryStats.totalNilai), raw: true },
          {
            label: "Nilai Jual Stok",
            value: formatRupiah(inventoryStats.totalNilaiJual),
            raw: true,
          },
          {
            label: "Stok Menipis",
            value: inventoryStats.jumlahMenipis,
            suffix: "produk",
            warn: inventoryStats.jumlahMenipis > 0,
          },
          {
            label: "Stok Habis",
            value: inventoryStats.jumlahHabis,
            suffix: "produk",
            danger: inventoryStats.jumlahHabis > 0,
          },
        ].map(({ label, value, suffix, raw, warn, danger }) => (
          <div
            key={label}
            className={`rounded-[24px] border p-4 shadow-sm ${
              danger
                ? "border-red-200 bg-red-50"
                : warn
                  ? "border-amber-200 bg-amber-50"
                  : "border-slate-200 bg-white"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p
              className={`mt-2 text-xl font-black ${
                danger ? "text-red-700" : warn ? "text-amber-700" : "text-slate-900"
              }`}
            >
              {raw ? value : `${value}${suffix ? ` ${suffix}` : ""}`}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <form
          onSubmit={submitProduct}
          className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="mb-5">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
              Manajemen Produk
            </p>
            <h2 className="mt-2 text-3xl font-black text-[#1e3a5f]">
              {form.id ? "Edit Produk" : "Tambah Produk"}
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Kode Produk</label>
              <input
                value={form.kode_produk}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    kode_produk: event.target.value.toUpperCase(),
                  }))
                }
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 uppercase outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                placeholder="Contoh: BRD-001-A15"
                required
              />
              <p className="mt-1 text-xs text-slate-500">
                Pakai kode produk yang sudah ada agar gampang dicari atau di-scan.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Kategori</label>
              <input
                list="kategori-list"
                value={form.kategori}
                onChange={(event) => setForm((prev) => ({ ...prev, kategori: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                required
              />
              <datalist id="kategori-list">
                {categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">Nama Produk</label>
              <input
                value={form.nama}
                onChange={(event) => setForm((prev) => ({ ...prev, nama: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Satuan</label>
              <input
                value={form.satuan}
                onChange={(event) => setForm((prev) => ({ ...prev, satuan: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Harga Beli (Rp)
              </label>
              <input
                type="number"
                min="0"
                value={form.harga_beli}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, harga_beli: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Harga Jual (Rp)
              </label>
              <input
                type="number"
                min="0"
                value={form.harga_jual}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, harga_jual: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Stok Awal</label>
              <input
                type="number"
                min="0"
                value={form.stok}
                onChange={(event) => setForm((prev) => ({ ...prev, stok: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Stok Minimum
              </label>
              <input
                type="number"
                min="0"
                value={form.stok_minimum}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, stok_minimum: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                required
              />
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            Margin: {Number.isFinite(margin) ? `${margin.toFixed(1)}%` : "0%"}
            {form.harga_beli && form.harga_jual ? (
              <span className="ml-2 font-normal text-emerald-600">
                (untung {formatRupiah(Number(form.harga_jual) - Number(form.harga_beli))} / item)
              </span>
            ) : null}
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="submit"
              className="flex-1 rounded-2xl bg-[#1e3a5f] px-4 py-3 text-sm font-semibold text-white hover:bg-[#15294a]"
            >
              {form.id ? "Update Produk" : "Tambah Produk"}
            </button>
            <button
              type="button"
              onClick={() => setForm(emptyForm)}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700"
            >
              Reset
            </button>
          </div>
        </form>

        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-2xl font-black text-[#1e3a5f]">Mutasi Stok</h3>
          <p className="mt-1 text-sm text-slate-500">
            Catat stok masuk, stok keluar manual, dan penyesuaian. Penjualan kasir otomatis masuk
            sebagai stok keluar.
          </p>

          <form
            onSubmit={submitMutation}
            className="mt-5 grid gap-4 md:grid-cols-2"
          >
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">Produk</label>
              <select
                value={mutationForm.productId}
                onChange={(event) =>
                  setMutationForm((prev) => ({ ...prev, productId: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                required
              >
                <option value="">Pilih produk</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.kode_produk ? `${product.kode_produk} - ` : ""}
                    {product.nama} (stok: {product.stok})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Jenis Mutasi</label>
              <select
                value={mutationForm.tipe}
                onChange={(event) =>
                  setMutationForm((prev) => ({ ...prev, tipe: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
              >
                <option value="masuk">Stok Masuk</option>
                <option value="keluar">Stok Keluar</option>
                <option value="penyesuaian">Penyesuaian</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                {mutationForm.tipe === "penyesuaian" ? "Perubahan Stok" : "Jumlah"}
              </label>
              <input
                type="number"
                value={mutationForm.jumlah}
                onChange={(event) =>
                  setMutationForm((prev) => ({ ...prev, jumlah: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                placeholder={mutationForm.tipe === "penyesuaian" ? "Contoh: -2 atau 3" : "Jumlah"}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Referensi</label>
              <input
                value={mutationForm.referensi}
                onChange={(event) =>
                  setMutationForm((prev) => ({ ...prev, referensi: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                placeholder="Misal: INV-001 / Penjualan Tokped"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Catatan</label>
              <input
                value={mutationForm.catatan}
                onChange={(event) =>
                  setMutationForm((prev) => ({ ...prev, catatan: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
                placeholder="Supplier / rusak / hilang / koreksi"
              />
            </div>

            <div className="md:col-span-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {getMutationHint(mutationForm.tipe)}
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                className="w-full rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-600"
              >
                Simpan Mutasi
              </button>
            </div>
          </form>

          <div className="mt-5">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700">Riwayat Mutasi Stok</h4>
              <span className="text-xs text-slate-400">{stockMutations.length} entri</span>
            </div>
            <div className="space-y-2 overflow-y-auto" style={{ maxHeight: "360px" }}>
              {stockMutations.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">Belum ada riwayat mutasi stok.</p>
              ) : (
                displayedLogs.map((log) => {
                  const product = products.find((productItem) => productItem.id === log.produk_id);
                  const amountClass =
                    log.jumlah > 0 ? "text-emerald-700 bg-emerald-100" : "text-rose-700 bg-rose-100";

                  return (
                    <div
                      key={log.id}
                      className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <MutationBadge tipe={log.tipe} />
                          <p className="text-sm font-semibold text-slate-900">
                            {product?.nama || "Produk dihapus"}
                          </p>
                          {product?.kode_produk ? (
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                              {product.kode_produk}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(log.created_at, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                          {log.referensi ? ` | ${log.referensi}` : ""}
                        </p>
                        {log.catatan ? (
                          <p className="mt-1 text-xs text-slate-600">{log.catatan}</p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${amountClass}`}
                        >
                          {log.jumlah > 0 ? "+" : ""}
                          {formatPlainNumber(log.jumlah)}
                        </span>
                        {typeof log.stok_sebelum === "number" && typeof log.stok_sesudah === "number" ? (
                          <p className="mt-1 text-[11px] text-slate-500">
                            {log.stok_sebelum} -&gt; {log.stok_sesudah}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {stockMutations.length > 8 ? (
              <button
                type="button"
                onClick={() => setShowAllLogs((value) => !value)}
                className="mt-3 w-full rounded-2xl bg-slate-100 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
              >
                {showAllLogs ? "Tampilkan lebih sedikit" : `Lihat semua (${stockMutations.length})`}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-4">
          <div>
            <h3 className="text-2xl font-black text-[#1e3a5f]">Daftar Produk</h3>
            <p className="text-sm text-slate-500">
              {filteredProducts.length} dari {products.length} produk ditampilkan
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setCategoryGroup("all");
                setCategoryFilter("Semua");
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                categoryGroup === "all"
                  ? "bg-[#1e3a5f] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Semua
            </button>
            {productCategoryGroups.map((group) => (
              <button
                key={group.slug}
                type="button"
                onClick={() => {
                  setCategoryGroup(group.slug);
                  setCategoryFilter("Semua");
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  categoryGroup === group.slug
                    ? "bg-[#1e3a5f] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {group.title}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama, kategori, atau kode produk..."
              className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
            />
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
            >
              <option value="Semua">Semua kategori</option>
              {availableCategoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-[#1e3a5f] focus:ring-4 focus:ring-blue-100"
            >
              <option value="semua">Semua status</option>
              <option value="menipis">Menipis</option>
              <option value="habis">Habis</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3">Kode</th>
                <th className="px-3 py-3">Nama</th>
                <th className="px-3 py-3">Kategori</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-center">Stok</th>
                <th className="px-3 py-3 text-center">Min</th>
                <th className="px-3 py-3 text-right">Harga Beli</th>
                <th className="px-3 py-3 text-right">Harga Jual</th>
                <th className="px-3 py-3 text-right">Margin</th>
                <th className="px-3 py-3 text-right">Nilai Stok</th>
                <th className="px-3 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-slate-500">
                    Tidak ada produk yang cocok.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const danger = product.stok === 0;
                  const warn = product.stok > 0 && product.stok <= product.stok_minimum;
                  const marginPercent = product.harga_beli
                    ? ((product.harga_jual - product.harga_beli) / product.harga_beli) * 100
                    : 0;
                  const nilaiStok = product.harga_beli * product.stok;

                  return (
                    <tr
                      key={product.id}
                      className={`border-t ${
                        danger
                          ? "border-red-100 bg-red-50/60"
                          : warn
                            ? "border-amber-100 bg-amber-50/60"
                            : "border-slate-100"
                      }`}
                    >
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-700">
                          {product.kode_produk || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{product.nama}</td>
                      <td className="px-3 py-3 text-slate-600">{product.kategori}</td>
                      <td className="px-3 py-3">
                        <StokBadge stok={product.stok} stokMinimum={product.stok_minimum} />
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-slate-900">
                        {product.stok}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-500">
                        {product.stok_minimum}
                      </td>
                      <td className="px-3 py-3 text-right">{formatRupiah(product.harga_beli)}</td>
                      <td className="px-3 py-3 text-right">{formatRupiah(product.harga_jual)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-emerald-600">
                        {marginPercent.toFixed(1)}%
                      </td>
                      <td className="px-3 py-3 text-right text-slate-600">
                        {formatRupiah(nilaiStok)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => editProduct(product)}
                            className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => updateProductStatus(product.id, !product.aktif)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                              product.aktif
                                ? "bg-slate-800 text-white hover:bg-slate-700"
                                : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            }`}
                          >
                            {product.aktif ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
