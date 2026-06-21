import { useMemo, useState } from "react";
import { BadgeDollarSign, CheckCircle2, LoaderCircle, PackageSearch, Save, Search, Truck } from "lucide-react";
import Panel from "./app/Panel";
import { ReturConditionChips, ReturWorkflowSection } from "./ReturWorkflowPrimitives";

export default function ReturSupplierForm({
  form,
  setForm,
  products,
  selectedProduct,
  reasonOptions,
  estimatedValue,
  formatRupiah,
  submitting,
  onSubmit,
}) {
  const quantity = Number(form.quantity || 0);
  const [productSearch, setProductSearch] = useState("");
  const canSubmit = form.supplierName.trim() && selectedProduct && quantity > 0;

  const filteredProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();
    if (!keyword) return products.slice(0, 8);

    return products
      .filter((product) =>
        [product.nama, product.kode_produk, product.kategori]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(keyword)
      )
      .slice(0, 8);
  }, [productSearch, products]);

  const exactCodeMatch = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();
    if (!keyword) return null;

    return (
      products.find((product) => (product.kode_produk || "").toLowerCase() === keyword) || null
    );
  }, [productSearch, products]);

  const pickProduct = (product) => {
    setForm((current) => ({ ...current, productId: product.id }));
    setProductSearch(product.kode_produk || product.nama || "");
  };

  const handleProductSearchChange = (event) => {
    const value = event.target.value;
    setProductSearch(value);

    const normalizedValue = value.trim().toLowerCase();
    const barcodeMatch = products.find(
      (product) => (product.kode_produk || "").toLowerCase() === normalizedValue
    );

    setForm((current) => {
      if (barcodeMatch) return { ...current, productId: barcodeMatch.id };
      if (current.productId) return { ...current, productId: "" };
      return current;
    });
  };

  const handleProductSearchKeyDown = (event) => {
    if (event.key !== "Enter") return;

    if (exactCodeMatch) {
      event.preventDefault();
      pickProduct(exactCodeMatch);
    }
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-3">
      <Panel className="p-5 sm:p-6 lg:col-span-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <PackageSearch className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-slate-950">
              Buat Retur Supplier
            </h2>
            <p className="text-sm text-slate-500">Kirim barang kembali ke supplier dengan nilai klaim tercatat.</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <ReturWorkflowSection
            step="01"
            title="Pilih supplier"
            description="Tentukan tujuan pengiriman balik sebelum memilih item."
            complete={Boolean(form.supplierName.trim())}
          >
            <label className="block text-sm font-semibold text-slate-700">
              Nama Supplier
              <input
                value={form.supplierName}
                onChange={(event) => setForm((current) => ({ ...current, supplierName: event.target.value }))}
                className="input mt-2"
                placeholder="Contoh: PT Sumber Aksesoris"
                required
              />
            </label>
          </ReturWorkflowSection>

          <ReturWorkflowSection
            step="02"
            title="Pilih item retur"
            description="Scan barcode untuk mempercepat input saat barang sudah disiapkan."
            complete={Boolean(selectedProduct && quantity > 0)}
          >
            <div className="block text-sm font-semibold text-slate-700">
              Cari Produk / Scan Barcode
              <div className="relative mt-2">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  value={productSearch}
                  onChange={handleProductSearchChange}
                  onKeyDown={handleProductSearchKeyDown}
                  className="input pl-9"
                  placeholder="Scan barcode atau ketik nama produk"
                  autoComplete="off"
                  required={!form.productId}
                />
              </div>
              <input type="hidden" value={form.productId} required readOnly />

              {selectedProduct ? (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Terpilih: {selectedProduct.nama}
                  {selectedProduct.kode_produk ? ` (${selectedProduct.kode_produk})` : ""}
                </div>
              ) : productSearch ? (
                <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {filteredProducts.length ? (
                    filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => pickProduct(product)}
                        className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-slate-50"
                      >
                        <span>
                          <span className="block font-semibold text-slate-900">{product.nama}</span>
                          <span className="text-xs text-slate-500">
                            {product.kode_produk || "Tanpa barcode"} - stok {product.stok}
                          </span>
                        </span>
                        <span className="text-xs font-semibold text-slate-500">
                          {formatRupiah(product.harga_beli)}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-sm font-medium text-slate-500">
                      Barcode atau produk tidak ditemukan.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            <label className="mt-4 block text-sm font-semibold text-slate-700 sm:max-w-[220px]">
              Jumlah Barang
              <input
                value={form.quantity}
                onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
                className="input mt-2"
                type="number"
                min="1"
                max={selectedProduct?.stok || undefined}
                placeholder="0"
                required
              />
            </label>
          </ReturWorkflowSection>

          <ReturWorkflowSection
            step="03"
            title="Alasan dan kondisi barang"
            description="Kondisi membantu supplier memproses klaim dan menjaga jejak pemeriksaan."
            complete={Boolean(form.condition.trim())}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700">
                Alasan Retur
                <select
                  value={form.reason}
                  onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                  className="input mt-2"
                >
                  {reasonOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Kondisi Barang
              <ReturConditionChips
                value={form.condition}
                onChange={(condition) => setForm((current) => ({ ...current, condition }))}
              />
              <textarea
                value={form.condition}
                onChange={(event) => setForm((current) => ({ ...current, condition: event.target.value }))}
                className="input mt-3 h-20 resize-y py-3"
                placeholder="Tambahkan detail kondisi bila diperlukan"
              />
            </label>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Catatan untuk Supplier
              <textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                className="input mt-2 h-20 resize-y py-3"
                placeholder="Nomor pengiriman, kontak, atau informasi penyelesaian"
              />
            </label>
          </ReturWorkflowSection>
        </div>
      </Panel>

      <Panel className="h-fit overflow-hidden border-[var(--brand-gold)]/22 p-0 lg:sticky lg:top-6">
        <div className="bg-slate-950 px-5 py-6 text-white sm:px-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
            <BadgeDollarSign className="h-4 w-4" aria-hidden="true" />
            Estimasi Nilai Retur
          </div>
          <p className="mt-3 text-4xl font-black tracking-tight">{formatRupiah(estimatedValue)}</p>
          <p className="mt-2 text-sm text-slate-300">Nilai modal barang yang diklaim ke supplier.</p>
        </div>

        <div className="p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            04 Nilai retur & finalisasi
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Item retur</p>
              <p className="mt-1 text-base font-bold text-slate-950">{quantity || 0} pcs</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="text-xs text-amber-700">Dampak stok</p>
              <p className="mt-1 text-base font-bold text-amber-800">- stok toko</p>
            </div>
          </div>
          {selectedProduct ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-950">{selectedProduct.nama}</p>
              <p className="mt-1">
                Modal {formatRupiah(selectedProduct.harga_beli)} x {quantity || 0} pcs
              </p>
              <p className="mt-1">Stok saat ini: {selectedProduct.stok} pcs</p>
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-100/70 px-3 py-2 text-xs font-semibold text-amber-800">
                <Truck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Stok toko akan berkurang setelah retur supplier disimpan.
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              Pilih produk dan jumlah untuk melihat nilai serta dampak stok.
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !canSubmit}
            aria-busy={submitting}
            className="mt-5 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand-gold)] px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_26px_rgba(212,175,55,0.28)] transition hover:bg-[#c9a227] hover:shadow-[0_14px_30px_rgba(212,175,55,0.36)] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
          >
            {submitting ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {submitting ? "Menyimpan Retur..." : "Simpan Retur Supplier"}
          </button>
          {!canSubmit && !submitting ? (
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">
              Lengkapi supplier, produk, dan jumlah untuk menyimpan retur.
            </p>
          ) : null}
        </div>
      </Panel>
    </form>
  );
}
