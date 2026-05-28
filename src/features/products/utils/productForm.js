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

export function formatImportAction(action) {
  return action === "created" ? "Produk baru" : "Stok diperbarui";
}

export function createEmptyProductForm(overrides = {}) {
  return { ...baseEmptyForm, ...overrides };
}

export function buildNextProductForm(currentForm) {
  return createEmptyProductForm({
    kategori: currentForm.kategori,
    stok_minimum: currentForm.stok_minimum || "3",
    satuan: currentForm.satuan || "pcs",
  });
}

export function getReplacementCategory(categoryList, currentCategory) {
  const fallback = currentCategory === "Aksesoris Lainnya" ? "Produk Lainnya" : "Aksesoris Lainnya";
  return categoryList.find((category) => category !== currentCategory) || fallback;
}

export function focusElement(ref) {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => ref.current?.focus());
}

export function getProductStatus(product) {
  if (product.status === "inactive" || product.aktif === false) {
    return {
      label: "Nonaktif",
      className: "bg-slate-200 text-slate-600",
    };
  }

  if (product.stok === 0) {
    return {
      label: "Habis",
      className: "brand-badge-danger",
    };
  }

  if (product.stok <= product.stok_minimum) {
    return {
      label: "Menipis",
      className: "brand-badge-warning",
    };
  }

  return {
    label: "Aman",
    className: "brand-badge-success",
  };
}
