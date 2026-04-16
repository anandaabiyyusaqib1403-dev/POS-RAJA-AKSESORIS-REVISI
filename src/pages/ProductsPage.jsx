import { useMemo, useRef, useState } from "react";
import MetricCard from "../components/app/MetricCard";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { useData } from "../contexts/DataContext";
import { showNotification } from "../contexts/NotificationContext";
import { productCategoryGroups } from "../data/productCategories";
import { formatDateTime, formatRupiah } from "../utils/format";
import { parseProductWorkbook } from "../utils/productImport";

const baseEmptyForm = {
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

const emptyMutation = {
  productId: "",
  tipe: "masuk",
  jumlah: "",
  referensi: "",
  catatan: "",
};

const quickStockMinimumOptions = ["1", "3", "5", "10"];
const quickMutationAmounts = [1, 5, 10, 20];
const preferredCategoryOrder = productCategoryGroups
  .filter((group) => !["digital", "layanan-tambahan"].includes(group.slug))
  .flatMap((group) => group.categories);

function createEmptyForm(overrides = {}) {
  return { ...baseEmptyForm, ...overrides };
}

function buildNextProductForm(currentForm) {
  return createEmptyForm({
    kategori: currentForm.kategori,
    stok_minimum: currentForm.stok_minimum || "3",
    satuan: currentForm.satuan || "pcs",
  });
}

function focusElement(ref) {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => ref.current?.focus());
}

function getProductStatus(product) {
  if (product.stok === 0) {
    return {
      label: "Habis",
      className: "bg-slate-100 text-slate-500",
    };
  }

  if (product.stok <= product.stok_minimum) {
    return {
      label: "Menipis",
      className: "bg-[var(--brand-gold)]/18 text-[var(--brand-gold)]",
    };
  }

  return {
    label: "Aman",
    className: "bg-[var(--brand-gold)]/10 text-[var(--brand-gold)]",
  };
}

export default function ProductsPage() {
  const {
    products,
    categories,
    stockMutations,
    saveProduct,
    importProducts,
    updateProductStatus,
    saveStockMutation,
  } = useData();
  const [form, setForm] = useState(createEmptyForm());
  const [mutation, setMutation] = useState(emptyMutation);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("semua");
  const [categoryFilter, setCategoryFilter] = useState("semua");
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");
  const inputRef = useRef(null);
  const productNameRef = useRef(null);
  const mutationQuantityRef = useRef(null);

  const orderedCategories = useMemo(() => {
    const available = [...new Set([...preferredCategoryOrder, ...categories])].filter(Boolean);

    return available.sort((left, right) => {
      const leftIndex = preferredCategoryOrder.indexOf(left);
      const rightIndex = preferredCategoryOrder.indexOf(right);

      if (leftIndex === -1 && rightIndex === -1) {
        return left.localeCompare(right);
      }
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    });
  }, [categories]);

  const categoryCounts = useMemo(
    () =>
      products.reduce((acc, product) => {
        acc[product.kategori] = (acc[product.kategori] || 0) + 1;
        return acc;
      }, {}),
    [products]
  );

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const keyword = search.toLowerCase();
      const matchSearch =
        product.nama.toLowerCase().includes(keyword) ||
        product.kategori.toLowerCase().includes(keyword) ||
        (product.kode_produk || "").toLowerCase().includes(keyword);
      const matchStatus =
        statusFilter === "semua"
          ? true
          : statusFilter === "menipis"
            ? product.stok > 0 && product.stok <= product.stok_minimum
            : product.stok === 0;
      const matchCategory =
        categoryFilter === "semua" ? true : product.kategori === categoryFilter;

      return matchSearch && matchStatus && matchCategory;
    });
  }, [products, search, statusFilter, categoryFilter]);

  const stats = useMemo(
    () => ({
      totalProduk: products.length,
      stokMenipis: products.filter((item) => item.stok > 0 && item.stok <= item.stok_minimum)
        .length,
      stokHabis: products.filter((item) => item.stok === 0).length,
      nilaiStok: products.reduce((sum, item) => sum + item.harga_beli * item.stok, 0),
    }),
    [products]
  );

  const lowStockPreview = useMemo(
    () =>
      products
        .filter((product) => product.stok > 0 && product.stok <= product.stok_minimum)
        .slice(0, 4),
    [products]
  );

  const editProduct = (product) => {
    setNotice("");
    setForm({
      id: product.id,
      kode_produk: product.kode_produk || "",
      nama: product.nama,
      kategori: product.kategori,
      harga_beli: String(product.harga_beli),
      harga_jual: String(product.harga_jual),
      stok: String(product.stok),
      stok_minimum: String(product.stok_minimum),
      satuan: product.satuan || "pcs",
      aktif: product.aktif,
    });
    focusElement(productNameRef);
  };

  const prepareStockMutation = (product) => {
    setNotice(`Form mutasi siap untuk ${product.nama}.`);
    setMutation({
      productId: product.id,
      tipe: "masuk",
      jumlah: "",
      referensi: "",
      catatan: `Tambah stok ${product.nama}`,
    });
    focusElement(mutationQuantityRef);
  };

  const resetProductForm = () => {
    setForm(buildNextProductForm(form));
    focusElement(productNameRef);
  };

  const handleProductSubmit = async (event) => {
    event.preventDefault();
    const isEditing = Boolean(form.id);

    try {
      await saveProduct(form);
      setNotice(
        isEditing
          ? `Produk ${form.nama} berhasil diperbarui.`
          : `Produk ${form.nama} berhasil ditambahkan. Barcode kosong akan dibuat otomatis.`
      );
      setForm(buildNextProductForm(form));
      focusElement(productNameRef);
    } catch (error) {
      showNotification("error", error.message || "Gagal menyimpan produk.");
    }
  };

  const handleMutationSubmit = async (event) => {
    event.preventDefault();

    const targetProduct = products.find((product) => product.id === mutation.productId);

    try {
      await saveStockMutation({
        productId: mutation.productId,
        tipe: mutation.tipe,
        jumlah: Number(mutation.jumlah),
        referensi: mutation.referensi,
        catatan: mutation.catatan,
      });
      setNotice(
        targetProduct
          ? `Mutasi stok untuk ${targetProduct.nama} berhasil disimpan.`
          : "Mutasi stok berhasil disimpan."
      );
      setMutation(emptyMutation);
    } catch (error) {
      showNotification("error", error.message || "Gagal menyimpan mutasi stok.");
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const parsed = await parseProductWorkbook(file);
      const result = await importProducts(parsed.products);
      setNotice(
        `Import selesai: ${result?.created || 0} produk baru, ${result?.updated || 0} diperbarui dari ${parsed.summary.importedRows} baris valid.`
      );
    } catch (error) {
      showNotification("error", error.message || "Gagal impor produk.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventory"
        title="Stok barang"
        description="Saya rapikan supaya owner bisa tambah produk, pilih kategori, dan isi stok jauh lebih cepat tanpa banyak langkah."
        icon="box"
        actions={
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => {
                setForm(createEmptyForm({ kategori: form.kategori || "", stok_minimum: "3" }));
                focusElement(productNameRef);
              }}
              className="brand-button-primary"
            >
              Tambah Produk
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="brand-button-secondary"
            >
              {importing ? "Mengimpor..." : "Import Excel"}
            </button>
          </>
        }
      />

      {notice ? (
        <Panel className="border-[var(--brand-gold)]/18 bg-[var(--brand-gold)]/10 px-5 py-4">
          <p className="text-sm font-semibold text-slate-900">{notice}</p>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard label="Total produk" value={String(stats.totalProduk)} />
        <MetricCard label="Stok menipis" value={String(stats.stokMenipis)} accent="gold" />
        <MetricCard label="Stok habis" value={String(stats.stokHabis)} accent="danger" />
        <MetricCard label="Nilai stok" value={formatRupiah(stats.nilaiStok)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                {form.id ? "Edit produk" : "Tambah produk lebih cepat"}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                Isi nama, pilih kategori, harga, dan stok. Kalau barcode belum ada, biarkan kosong
                lalu sistem akan buatkan kode produk otomatis saat disimpan.
              </p>
            </div>
            <div className="rounded-3xl border border-[var(--brand-gold)]/16 bg-[var(--brand-gold)]/8 px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-950">Tips cepat</p>
              <p className="mt-1 leading-6">
                Setelah simpan, kategori dan stok minimum tetap dipertahankan supaya tambah barang
                berikutnya lebih cepat.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Kategori cepat
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {orderedCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, kategori: category }))}
                  className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                    form.kategori === category
                      ? "bg-[var(--brand-gold)] text-slate-950"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-[var(--brand-gold)]/24 hover:bg-[var(--brand-gold)]/10"
                  }`}
                >
                  {category}
                  <span className="ml-2 text-[10px] opacity-70">
                    {categoryCounts[category] || 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleProductSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
            <input
              ref={productNameRef}
              value={form.nama}
              onChange={(event) => setForm((prev) => ({ ...prev, nama: event.target.value }))}
              className="brand-input md:col-span-2"
              placeholder="Nama produk"
              required
            />
            <input
              list="kategori-produk"
              value={form.kategori}
              onChange={(event) => setForm((prev) => ({ ...prev, kategori: event.target.value }))}
              className="brand-input"
              placeholder="Kategori"
              required
            />
            <datalist id="kategori-produk">
              {orderedCategories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            <input
              value={form.kode_produk}
              onChange={(event) => setForm((prev) => ({ ...prev, kode_produk: event.target.value }))}
              className="brand-input"
              placeholder="Barcode / kode produk (opsional)"
            />
            <input
              type="number"
              min="0"
              value={form.harga_jual}
              onChange={(event) => setForm((prev) => ({ ...prev, harga_jual: event.target.value }))}
              className="brand-input"
              placeholder="Harga jual"
              required
            />
            <input
              type="number"
              min="0"
              value={form.harga_beli}
              onChange={(event) => setForm((prev) => ({ ...prev, harga_beli: event.target.value }))}
              className="brand-input"
              placeholder="Harga modal"
              required
            />
            <input
              type="number"
              min="0"
              value={form.stok}
              onChange={(event) => setForm((prev) => ({ ...prev, stok: event.target.value }))}
              className="brand-input"
              placeholder="Stok awal"
              required
            />
            <div className="space-y-3">
              <input
                type="number"
                min="0"
                value={form.stok_minimum}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, stok_minimum: event.target.value }))
                }
                className="brand-input"
                placeholder="Stok minimum"
                required
              />
              <div className="flex flex-wrap gap-2">
                {quickStockMinimumOptions.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, stok_minimum: value }))}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      form.stok_minimum === value
                        ? "bg-[var(--brand-gold)] text-slate-950"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    Min {value}
                  </button>
                ))}
              </div>
            </div>
            <div className="md:col-span-2 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <select
                value={form.satuan}
                onChange={(event) => setForm((prev) => ({ ...prev, satuan: event.target.value }))}
                className="brand-select"
              >
                <option value="pcs" className="bg-white">
                  pcs
                </option>
                <option value="unit" className="bg-white">
                  unit
                </option>
                <option value="pack" className="bg-white">
                  pack
                </option>
                <option value="set" className="bg-white">
                  set
                </option>
              </select>
              <button type="submit" className="brand-button-primary">
                {form.id ? "Update Produk" : "Simpan Produk"}
              </button>
              <button
                type="button"
                onClick={resetProductForm}
                className="brand-button-secondary"
              >
                Reset
              </button>
            </div>
          </form>
        </Panel>

        <Panel variant="strong" className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                Mutasi stok
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Pilih barang lalu isi jumlah. Untuk tambah stok harian, tombol cepat di tabel bisa
                langsung mengisi produk ke form ini.
              </p>
            </div>
            {lowStockPreview.length ? (
              <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                <p className="font-semibold text-slate-950">Perlu isi ulang</p>
                <div className="mt-2 space-y-1">
                  {lowStockPreview.map((product) => (
                    <p key={product.id}>
                      {product.nama}
                      <span className="ml-2 text-slate-500">stok {product.stok}</span>
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <form onSubmit={handleMutationSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
            <select
              value={mutation.productId}
              onChange={(event) => setMutation((prev) => ({ ...prev, productId: event.target.value }))}
              className="brand-select md:col-span-2"
              required
            >
              <option value="" className="bg-white">
                Pilih produk
              </option>
              {products.map((product) => (
                <option key={product.id} value={product.id} className="bg-white">
                  {product.nama} ({product.stok})
                </option>
              ))}
            </select>
            <select
              value={mutation.tipe}
              onChange={(event) => setMutation((prev) => ({ ...prev, tipe: event.target.value }))}
              className="brand-select"
            >
              <option value="masuk" className="bg-white">
                Stok Masuk
              </option>
              <option value="keluar" className="bg-white">
                Stok Keluar
              </option>
              <option value="penyesuaian" className="bg-white">
                Penyesuaian
              </option>
            </select>
            <div className="space-y-3">
              <input
                ref={mutationQuantityRef}
                type="number"
                value={mutation.jumlah}
                onChange={(event) => setMutation((prev) => ({ ...prev, jumlah: event.target.value }))}
                className="brand-input"
                placeholder="Jumlah"
                required
              />
              <div className="flex flex-wrap gap-2">
                {quickMutationAmounts.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setMutation((prev) => ({ ...prev, jumlah: String(amount) }))}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      mutation.jumlah === String(amount)
                        ? "bg-[var(--brand-gold)] text-slate-950"
                        : "bg-white text-slate-600"
                    }`}
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>
            <input
              value={mutation.referensi}
              onChange={(event) =>
                setMutation((prev) => ({ ...prev, referensi: event.target.value }))
              }
              className="brand-input"
              placeholder="Referensi"
            />
            <input
              value={mutation.catatan}
              onChange={(event) => setMutation((prev) => ({ ...prev, catatan: event.target.value }))}
              className="brand-input"
              placeholder="Catatan"
            />
            <button type="submit" className="brand-button-success md:col-span-2">
              Simpan Mutasi
            </button>
          </form>

          <div
            className="brand-scrollbar mt-6 space-y-3 overflow-y-auto pr-1"
            style={{ maxHeight: "300px" }}
          >
            {stockMutations.slice(0, 6).map((log) => (
              <div
                key={log.id}
                className="rounded-2xl border border-[var(--brand-gold)]/12 bg-[var(--brand-gold)]/8 px-4 py-4"
              >
                <p className="text-sm font-semibold text-slate-950">
                  {log.referensi || "Mutasi stok"}
                </p>
                <p className="mt-1 text-sm text-slate-600">{log.catatan || "Tanpa catatan"}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {formatDateTime(log.created_at, { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="p-6">
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-3 md:grid-cols-[1.3fr_180px_220px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="brand-input"
              placeholder="Cari barcode, nama barang, atau kategori..."
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="brand-select"
            >
              <option value="semua" className="bg-white">
                Semua status
              </option>
              <option value="menipis" className="bg-white">
                Menipis
              </option>
              <option value="habis" className="bg-white">
                Habis
              </option>
            </select>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="brand-select"
            >
              <option value="semua" className="bg-white">
                Semua kategori
              </option>
              {orderedCategories.map((category) => (
                <option key={category} value={category} className="bg-white">
                  {category}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-slate-600">{filteredProducts.length} produk tampil</p>
        </div>

        <div className="brand-scrollbar overflow-x-auto">
          <table className="brand-table">
            <thead>
              <tr>
                <th>Barcode</th>
                <th>Nama Barang</th>
                <th>Stok</th>
                <th>Harga Modal</th>
                <th>Harga Jual</th>
                <th>Status</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const status = getProductStatus(product);

                return (
                  <tr key={product.id}>
                    <td className="font-mono text-slate-500">{product.kode_produk || "-"}</td>
                    <td>
                      <p className="font-semibold text-slate-950">{product.nama}</p>
                      <p className="text-xs text-slate-500">{product.kategori}</p>
                    </td>
                    <td className="font-semibold text-slate-950">{product.stok}</td>
                    <td className="text-slate-600">{formatRupiah(product.harga_beli)}</td>
                    <td className="text-slate-600">{formatRupiah(product.harga_jual)}</td>
                    <td>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => prepareStockMutation(product)}
                          className="brand-button-success px-3 py-2"
                        >
                          Tambah stok
                        </button>
                        <button
                          type="button"
                          onClick={() => editProduct(product)}
                          className="brand-button-secondary px-3 py-2"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => updateProductStatus(product.id, !product.aktif)}
                          className="brand-button-secondary px-3 py-2"
                        >
                          {product.aktif ? "Nonaktif" : "Aktifkan"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
