import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import LoadingState from "../components/LoadingState";
import LottieState from "../components/LottieState";
import MetricCard from "../components/app/MetricCard";
import PaginationBar from "../components/PaginationBar";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import AppIcon from "../components/app/AppIcon";
import PinConfirmationModal from "../components/PinConfirmationModal";
import { useAuth } from "../contexts/useAuth";
import { showNotification } from "../contexts/NotificationContext";
import {
  isPinActionCancelledError,
  usePinConfirmation,
} from "../hooks/usePinConfirmation";
import { productCategoryGroups } from "../data/productCategories";
import { formatDateInput, formatDateTime, formatRupiah } from "../utils/format";
import CurrencyInput from "../components/CurrencyInput";
import { useProducts } from "../hooks/useProducts";
import { EXCEL_IMPORT_ACCEPT } from "../utils/excelFileGuard";
import { usePagedSupabaseRows } from "../hooks/usePagedSupabaseRows";
import {
  buildNextProductForm,
  createEmptyProductForm as createEmptyForm,
  focusElement,
  formatImportAction,
  getProductStatus,
  getReplacementCategory,
} from "../features/products/utils/productForm";

const MAX_RENDERED_PRODUCT_ROWS = 240;
const MAX_PRODUCT_SELECT_OPTIONS = 500;

const emptyMutation = {
  productId: "",
  tipe: "masuk",
  jumlah: "",
  referensi: "",
  catatan: "",
};

const quickStockMinimumOptions = ["1", "3", "5", "10"];
const quickMutationAmounts = [1, 5, 10, 20];
const ownerMutationTypes = [
  { value: "masuk", label: "Stok Masuk" },
  { value: "keluar", label: "Stok Keluar" },
  { value: "penyesuaian", label: "Penyesuaian" },
];
const cashierMutationTypes = [{ value: "masuk", label: "Stok Masuk" }];
const preferredCategoryOrder = productCategoryGroups
  .filter((group) => !["digital"].includes(group.slug))
  .flatMap((group) => group.categories);
const stockSectionMenu = [
  {
    id: "kelola-kategori",
    label: "Kelola Kategori",
    eyebrow: "Kategori",
    description: "Ubah nama, hapus, dan rapikan kategori aktif.",
    ownerOnly: true,
  },
  {
    id: "tambah-kelola",
    label: "Tambah & Kelola",
    eyebrow: "Stok",
    description: "Cari barang, tambah stok, edit, dan nonaktifkan produk.",
    ownerOnly: false,
  },
  {
    id: "tambah-produk",
    label: "Tambah Produk",
    eyebrow: "Produk baru",
    description: "Input produk manual dan import barang lewat Excel.",
    ownerOnly: true,
  },
];

const productStatusFilterLabels = {
  semua: "Semua status",
  aktif: "Aktif",
  nonaktif: "Nonaktif",
  menipis: "Menipis",
  minimum: "Di bawah minimum",
  habis: "Habis",
};

const stockToneStyles = {
  danger: {
    wrapper: "border-red-200 bg-red-50",
    icon: "bg-red-600 text-white",
    value: "text-red-700",
    label: "text-red-700",
    detail: "text-red-600",
  },
  warning: {
    wrapper: "border-amber-200 bg-amber-50",
    icon: "bg-amber-500 text-white",
    value: "text-amber-800",
    label: "text-amber-800",
    detail: "text-amber-700",
  },
  success: {
    wrapper: "border-emerald-100 bg-emerald-50",
    icon: "bg-emerald-600 text-white",
    value: "text-emerald-700",
    label: "text-emerald-700",
    detail: "text-emerald-700",
  },
};

function getStockHealth(product) {
  const stock = Number(product.stok || 0);
  const minimum = Number(product.stok_minimum || 0);
  const unit = product.satuan || "pcs";

  if (stock <= 0) {
    return {
      tone: "danger",
      icon: "badge-alert",
      label: "Stok habis",
      value: "0",
      detail: `Min ${minimum} ${unit}`,
    };
  }

  if (stock <= minimum) {
    return {
      tone: "danger",
      icon: "alert",
      label: "Stok kritis",
      value: String(stock),
      detail: `${stock} ${unit} tersisa`,
    };
  }

  return {
    tone: "success",
    icon: "package-check",
    label: "Stok aman",
    value: String(stock),
    detail: `Min ${minimum} ${unit}`,
  };
}

function groupRestockAlerts(products) {
  return [
    {
      key: "habis",
      label: "Stok habis",
      badgeClassName: "brand-badge-danger",
      rows: products.filter((product) => Number(product.stok || 0) <= 0),
    },
    {
      key: "kritis",
      label: "Stok kritis",
      badgeClassName: "brand-badge-warning",
      rows: products.filter((product) => Number(product.stok || 0) > 0),
    },
  ].filter((group) => group.rows.length);
}

function ProductStockSignal({ product }) {
  const health = getStockHealth(product);
  const styles = stockToneStyles[health.tone] || stockToneStyles.success;

  return (
    <div className={`inline-flex min-w-[152px] items-center gap-3 rounded-lg border px-3 py-2 ${styles.wrapper}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${styles.icon}`}>
        <AppIcon name={health.icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className={`text-base font-black leading-5 tabular-nums ${styles.value}`}>
          {health.value}
          <span className="ml-1 text-[11px] font-bold uppercase">{product.satuan || "pcs"}</span>
        </p>
        <p className={`mt-0.5 text-[11px] font-bold leading-4 ${styles.label}`}>{health.label}</p>
        <p className={`text-[11px] leading-4 ${styles.detail}`}>{health.detail}</p>
      </div>
    </div>
  );
}

function ProductActionMenu({
  product,
  canAddStock,
  canManageProducts,
  isOpen,
  onToggle,
  onAddStock,
  onEdit,
  onDelete,
  onToggleStatus,
}) {
  if (!canAddStock && !canManageProducts) {
    return <span className="brand-badge-neutral">Lihat saja</span>;
  }

  return (
    <div className="relative inline-flex justify-end" data-product-action-menu>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Buka aksi untuk ${product.nama}`}
        onClick={onToggle}
        className="inventory-action-trigger"
      >
        <AppIcon name="more-vertical" className="h-5 w-5" />
      </button>
      {isOpen ? (
        <div className="inventory-action-menu" role="menu">
          {canAddStock ? (
            <button type="button" role="menuitem" onClick={onAddStock} className="inventory-action-item">
              <AppIcon name="package-plus" className="h-4 w-4" />
              Tambah stok
            </button>
          ) : null}
          {canManageProducts ? (
            <>
              <button type="button" role="menuitem" onClick={onEdit} className="inventory-action-item">
                <AppIcon name="edit" className="h-4 w-4" />
                Edit produk
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={onToggleStatus}
                className="inventory-action-item"
              >
                <AppIcon name="power" className="h-4 w-4" />
                {product.aktif ? "Nonaktifkan" : "Aktifkan"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={onDelete}
                className="inventory-action-item inventory-action-item-danger"
              >
                <AppIcon name="trash" className="h-4 w-4" />
                Hapus
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function ProductsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    loading,
    products,
    stockMutations,
    refreshProducts,
    refreshStock,
    saveProduct,
    importProducts,
    updateProductStatus,
    deleteProduct,
    renameProductCategory,
    deleteProductCategory,
    saveStockMutation,
  } = useProducts();
  const { user } = useAuth();
  const { 
    isPinModalOpen, 
    closePinModal, 
    executeSensitiveAction, 
    executeConfirmedAction,
    actionDescription 
  } = usePinConfirmation();
  const canManageProducts = user?.role === "pemilik";
  const canAddStock = canManageProducts || user?.role === "kasir";
  const mutationTypeOptions = canManageProducts ? ownerMutationTypes : cashierMutationTypes;
  const [form, setForm] = useState(createEmptyForm());
  const [editForm, setEditForm] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [mutation, setMutation] = useState(emptyMutation);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("semua");
  const [categoryFilter, setCategoryFilter] = useState("semua");
  const [compactTable, setCompactTable] = useState(true);
  const [openActionProductId, setOpenActionProductId] = useState(null);
  const [lastQuickMutationAmount, setLastQuickMutationAmount] = useState(null);
  const [categoryAction, setCategoryAction] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [notice, setNotice] = useState("");
  const inputRef = useRef(null);
  const productNameRef = useRef(null);
  const mutationQuantityRef = useRef(null);
  const productHydrationRef = useRef(false);
  const [hydratingProducts, setHydratingProducts] = useState(false);
  const [productHydrationError, setProductHydrationError] = useState("");
  const stockMutationPage = usePagedSupabaseRows({
    table: "stok_mutasi",
    pageSize: 8,
    orderBy: "created_at",
    ascending: false,
  });

  useEffect(() => {
    const requestedStatus = new URLSearchParams(location.search).get("status");
    if (["semua", "aktif", "nonaktif", "minimum", "menipis", "habis"].includes(requestedStatus)) {
      setStatusFilter(requestedStatus);
    }
  }, [location.search]);

  const categoryCounts = useMemo(
    () =>
      products.reduce((acc, product) => {
        const category = String(product.kategori || "").trim();
        if (!category) return acc;
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {}),
    [products]
  );

  const orderedCategories = useMemo(() => {
    const available = Object.entries(categoryCounts)
      .filter(([, count]) => count > 0)
      .map(([category]) => category);

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
  }, [categoryCounts]);

  const categoryRows = useMemo(
    () =>
      orderedCategories.map((category) => ({
        name: category,
        count: categoryCounts[category] || 0,
      })),
    [categoryCounts, orderedCategories]
  );

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const keyword = search.toLowerCase();
      const matchSearch =
        product.nama.toLowerCase().includes(keyword) ||
        product.kategori.toLowerCase().includes(keyword) ||
        (product.kode_produk || "").toLowerCase().includes(keyword);
      let matchStatus = true;
      if (statusFilter === "aktif") {
        matchStatus = product.status === "active" && product.aktif !== false;
      } else if (statusFilter === "nonaktif") {
        matchStatus = product.status === "inactive" || product.aktif === false;
      } else if (statusFilter === "menipis") {
        matchStatus = product.stok > 0 && product.stok <= product.stok_minimum;
      } else if (statusFilter === "habis") {
        matchStatus = product.stok === 0;
      } else if (statusFilter === "minimum") {
        matchStatus = product.stok <= product.stok_minimum;
      }
      const matchCategory =
        categoryFilter === "semua" ? true : product.kategori === categoryFilter;

      return product.status !== "deleted" && matchSearch && matchStatus && matchCategory;
    });
  }, [products, search, statusFilter, categoryFilter]);
  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, MAX_RENDERED_PRODUCT_ROWS),
    [filteredProducts]
  );
  const hiddenProductCount = Math.max(0, filteredProducts.length - visibleProducts.length);
  const hasProductFilters =
    Boolean(search.trim()) || statusFilter !== "semua" || categoryFilter !== "semua";
  const activeFilterChips = useMemo(() => {
    const chips = [];
    const trimmedSearch = search.trim();

    if (trimmedSearch) {
      chips.push({ key: "search", label: `Cari: ${trimmedSearch}` });
    }
    if (statusFilter !== "semua") {
      chips.push({
        key: "status",
        label: productStatusFilterLabels[statusFilter] || statusFilter,
      });
    }
    if (categoryFilter !== "semua") {
      chips.push({ key: "category", label: categoryFilter });
    }

    return chips;
  }, [categoryFilter, search, statusFilter]);

  const resetProductFilters = () => {
    setSearch("");
    setStatusFilter("semua");
    setCategoryFilter("semua");
  };

  const clearProductFilter = (filterKey) => {
    if (filterKey === "search") setSearch("");
    if (filterKey === "status") setStatusFilter("semua");
    if (filterKey === "category") setCategoryFilter("semua");
  };

  const exportFilteredProducts = async () => {
    try {
      const { exportProductsToExcel } = await import("../utils/productImport");
      await exportProductsToExcel(
        filteredProducts,
        `stok-barang-${formatDateInput(new Date())}.xlsx`
      );
      showNotification("success", `${filteredProducts.length} produk berhasil diekspor.`);
    } catch (error) {
      showNotification("error", error.message || "Gagal mengekspor daftar produk.");
    }
  };

  const stats = useMemo(
    () =>
      products.reduce(
        (acc, item) => {
          const stock = Number(item.stok || 0);
          const minimum = Number(item.stok_minimum || 0);
          acc.totalProduk += 1;
          acc.nilaiStok += Number(item.harga_beli || 0) * stock;
          if (item.status !== "inactive" && item.aktif !== false) acc.produkAktif += 1;
          if (stock > 0 && stock <= minimum) acc.stokMenipis += 1;
          if (stock <= 0) acc.stokHabis += 1;
          return acc;
        },
        {
          totalProduk: 0,
          produkAktif: 0,
          stokMenipis: 0,
          stokHabis: 0,
          nilaiStok: 0,
        }
      ),
    [products]
  );
  const stockRiskCount = stats.stokMenipis + stats.stokHabis;
  const stockHealthPercent = stats.totalProduk
    ? Math.max(0, Math.round(((stats.totalProduk - stockRiskCount) / stats.totalProduk) * 100))
    : 100;

  const restockAlertProducts = useMemo(
    () =>
      products
        .filter(
          (product) =>
            product.status !== "deleted" &&
            product.aktif !== false &&
            Number(product.stok || 0) <= Number(product.stok_minimum || 0)
        )
        .sort((left, right) => Number(left.stok || 0) - Number(right.stok || 0) || left.nama.localeCompare(right.nama)),
    [products]
  );
  const visibleRestockAlertProducts = useMemo(
    () => restockAlertProducts.slice(0, 4),
    [restockAlertProducts]
  );
  const restockAlertGroups = useMemo(
    () => groupRestockAlerts(visibleRestockAlertProducts),
    [visibleRestockAlertProducts]
  );
  const selectedMutationProduct = useMemo(
    () => products.find((product) => product.id === mutation.productId) || null,
    [mutation.productId, products]
  );
  const mutationProductOptions = useMemo(
    () => products.slice(0, MAX_PRODUCT_SELECT_OPTIONS),
    [products]
  );
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );
  const visibleStockMutations = stockMutationPage.error
    ? stockMutations.slice(0, 8)
    : stockMutationPage.rows;
  const mutationQuantity = Number(mutation.jumlah);
  const mutationDeltaPreview =
    selectedMutationProduct && Number.isFinite(mutationQuantity) && mutationQuantity > 0
      ? mutation.tipe === "keluar"
        ? -Math.abs(mutationQuantity)
        : Math.abs(mutationQuantity)
      : null;
  const mutationStockAfter =
    mutationDeltaPreview === null
      ? null
      : Number(selectedMutationProduct?.stok || 0) + mutationDeltaPreview;
  const mutationSubmitDisabled =
    !canAddStock ||
    !selectedMutationProduct ||
    !Number.isFinite(mutationQuantity) ||
    mutationQuantity <= 0;
  const visibleStockSectionMenu = useMemo(
    () => stockSectionMenu.filter((item) => canManageProducts || !item.ownerOnly),
    [canManageProducts]
  );
  const activeStockSection = useMemo(() => {
    const hashSection = decodeURIComponent(location.hash.replace("#", ""));
    const fallbackSection = "tambah-kelola";

    return visibleStockSectionMenu.some((item) => item.id === hashSection)
      ? hashSection
      : fallbackSection;
  }, [location.hash, visibleStockSectionMenu]);
  const activeStockMenu = visibleStockSectionMenu.find(
    (item) => item.id === activeStockSection
  );

  useEffect(() => {
    if (mutation.productId && !products.some((product) => product.id === mutation.productId)) {
      setMutation(emptyMutation);
      setLastQuickMutationAmount(null);
      setNotice("");
    }

    if (editForm?.id && !products.some((product) => product.id === editForm.id)) {
      setEditForm(null);
    }

    if (deleteTarget?.id && !products.some((product) => product.id === deleteTarget.id)) {
      setDeleteTarget(null);
    }

    if (openActionProductId && !products.some((product) => product.id === openActionProductId)) {
      setOpenActionProductId(null);
    }
  }, [deleteTarget?.id, editForm?.id, mutation.productId, openActionProductId, products]);

  useEffect(() => {
    if (!openActionProductId) return undefined;

    const handlePointerDown = (event) => {
      if (event.target instanceof Element && event.target.closest("[data-product-action-menu]")) {
        return;
      }
      setOpenActionProductId(null);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpenActionProductId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openActionProductId]);

  useEffect(() => {
    if (categoryFilter !== "semua" && !orderedCategories.includes(categoryFilter)) {
      setCategoryFilter("semua");
    }

    if (categoryAction?.category && !orderedCategories.includes(categoryAction.category)) {
      setCategoryAction(null);
    }
  }, [categoryAction?.category, categoryFilter, orderedCategories]);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, [activeStockSection, loading]);

  const hydrateProducts = useCallback(async () => {
    productHydrationRef.current = true;
    setHydratingProducts(true);
    setProductHydrationError("");

    try {
      await refreshProducts();
      await refreshStock();
    } catch (error) {
      const message = error.message || "Gagal memuat stok barang.";
      console.error("Gagal memuat stok barang:", error);
      setProductHydrationError(message);
      showNotification("error", message);
    } finally {
      setHydratingProducts(false);
    }
  }, [refreshProducts, refreshStock]);

  useEffect(() => {
    if (productHydrationRef.current || products.length) return undefined;

    let isMounted = true;
    hydrateProducts().finally(() => {
      if (!isMounted) {
        productHydrationRef.current = false;
      }
    });

    return () => {
      isMounted = false;
    };
  }, [hydrateProducts, products.length]);

  const retryProductHydration = () => {
    productHydrationRef.current = false;
    void hydrateProducts();
  };

  if (hydratingProducts && !products.length) {
    return <LoadingState text="Memuat produk..." />;
  }

  if (productHydrationError && !products.length) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Stok barang"
          title="Stok belum berhasil dimuat"
          description="Halaman tetap hidup. Coba ulangi pemuatan data stok tanpa memuat ulang seluruh aplikasi."
          icon="box"
        />
        <Panel className="p-6">
          <p className="text-sm font-semibold text-red-700">{productHydrationError}</p>
          <button type="button" onClick={retryProductHydration} className="brand-button-primary mt-4">
            Coba Lagi
          </button>
        </Panel>
      </div>
    );
  }

  const editProduct = (product) => {
    setNotice("");
    setImportResult(null);
    setEditForm({
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
      status: product.status || (product.aktif ? "active" : "inactive"),
    });
  };

  const prepareStockMutation = (product) => {
    if (!canAddStock) return;
    setOpenActionProductId(null);
    setLastQuickMutationAmount(null);
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

  const applyQuickMutationAmount = (amount) => {
    setLastQuickMutationAmount(amount);
    setMutation((prev) => {
      const currentAmount = Number(prev.jumlah);
      const baseAmount = Number.isFinite(currentAmount) && currentAmount > 0 ? currentAmount : 0;

      return {
        ...prev,
        jumlah: String(baseAmount + amount),
      };
    });
    focusElement(mutationQuantityRef);
  };

  const showAllRestockProducts = () => {
    setSearch("");
    setCategoryFilter("semua");
    setStatusFilter("minimum");
  };

  const resetProductForm = () => {
    setNotice("");
    setImportResult(null);
    setForm((currentForm) => buildNextProductForm(currentForm));
    focusElement(productNameRef);
  };

  const openRenameCategory = (category) => {
    setCategoryAction({
      type: "rename",
      category,
      nextName: category,
    });
  };

  const openDeleteCategory = (category) => {
    setCategoryAction({
      type: "delete",
      category,
      replacementCategory: getReplacementCategory(orderedCategories, category),
    });
  };

  const applyCategoryActionToLocalForms = (fromCategory, toCategory) => {
    setForm((prev) => ({
      ...prev,
      kategori: prev.kategori === fromCategory ? toCategory : prev.kategori,
    }));
    setEditForm((prev) =>
      prev && prev.kategori === fromCategory ? { ...prev, kategori: toCategory } : prev
    );
    setCategoryFilter((prev) => (prev === fromCategory ? "semua" : prev));
  };

  const handleCategoryAction = async () => {
    if (!categoryAction) return;
    if (!canManageProducts) {
      showNotification("error", "Hanya pemilik toko yang dapat mengelola kategori.");
      return;
    }

    const fromCategory = categoryAction.category;
    const toCategory =
      categoryAction.type === "rename"
        ? String(categoryAction.nextName || "").trim()
        : String(categoryAction.replacementCategory || "").trim();

    try {
      const affectedCount = await executeSensitiveAction(
        async () =>
          categoryAction.type === "rename"
            ? await renameProductCategory({
                oldCategory: fromCategory,
                newCategory: toCategory,
              })
            : await deleteProductCategory({
                category: fromCategory,
                replacementCategory: toCategory,
              }),
        categoryAction.type === "rename"
          ? "PRODUCT.RENAME_CATEGORY"
          : "PRODUCT.DELETE_CATEGORY"
      );

      applyCategoryActionToLocalForms(fromCategory, toCategory);
      setCategoryAction(null);
      showNotification(
        "success",
        categoryAction.type === "rename"
          ? `${affectedCount} produk dipindahkan ke kategori ${toCategory}.`
          : `${fromCategory} dihapus. ${affectedCount} produk dipindahkan ke ${toCategory}.`
      );
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Gagal mengelola kategori.");
    }
  };

  const handleToggleStatus = async (productId, newStatus) => {
    if (!canManageProducts) {
      showNotification("error", "Hanya pemilik toko yang dapat mengubah status produk.");
      return;
    }

    try {
      await executeSensitiveAction(
        async () => {
          await updateProductStatus(productId, newStatus);
        },
        "PRODUCT.TOGGLE_STATUS"
      );
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Gagal mengubah status produk.");
    }
  };

  const handleProductSubmit = async (event) => {
    event.preventDefault();
    if (!canManageProducts) {
      showNotification("error", "Hanya pemilik toko yang dapat menyimpan produk.");
      return;
    }

    try {
      await executeSensitiveAction(
        async () => {
          await saveProduct(form);
        },
        "PRODUCT.CREATE"
      );

      setNotice(
        `Produk ${form.nama} sudah ditambahkan. Kalau barcode kosong, kode akan dibuatkan.`
      );
      setForm(buildNextProductForm(form));
      focusElement(productNameRef);
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Gagal menyimpan produk.");
    }
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    if (!canManageProducts || !editForm) {
      showNotification("error", "Hanya pemilik toko yang dapat mengedit produk.");
      return;
    }

    try {
      let actionKey = "PRODUCT.EDIT";
      const originalProduct = products.find((product) => product.id === editForm.id);
      if (originalProduct) {
        const stokChanged = String(originalProduct.stok) !== editForm.stok;
        const priceChanged =
          String(originalProduct.harga_jual) !== editForm.harga_jual ||
          String(originalProduct.harga_beli) !== editForm.harga_beli;

        if (stokChanged) {
          actionKey = "PRODUCT.EDIT_STOCK";
        } else if (priceChanged) {
          actionKey = "PRODUCT.EDIT_PRICE";
        }
      }

      await executeSensitiveAction(
        async () => {
          await saveProduct(editForm);
        },
        actionKey
      );

      setNotice(`Produk ${editForm.nama} berhasil diperbarui.`);
      setEditForm(null);
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Gagal memperbarui produk.");
    }
  };

  const handleMutationSubmit = async (event) => {
    event.preventDefault();
    if (!canAddStock) {
      showNotification("error", "Akun ini tidak dapat mengubah stok.");
      return;
    }
    if (!canManageProducts && mutation.tipe !== "masuk") {
      showNotification("error", "Kasir hanya boleh menambah stok produk.");
      return;
    }

    if (!products.length) {
      showNotification("warning", "Belum ada produk. Tambahkan atau import produk terlebih dahulu.");
      return;
    }

    if (!mutation.productId) {
      showNotification("warning", "Pilih produk dulu sebelum menyimpan mutasi stok.");
      return;
    }

    const targetProduct = selectedMutationProduct;
    if (!targetProduct) {
      setMutation(emptyMutation);
      setLastQuickMutationAmount(null);
      showNotification("warning", "Produk sudah tidak tersedia. Pilih produk lain untuk mutasi stok.");
      return;
    }

    if (!Number.isFinite(mutationQuantity) || mutationQuantity <= 0) {
      showNotification("warning", "Jumlah mutasi harus lebih besar dari 0.");
      return;
    }

    try {
      await executeSensitiveAction(
        async () => {
          await saveStockMutation({
            productId: mutation.productId,
            tipe: mutation.tipe,
            jumlah: mutationQuantity,
            referensi: mutation.referensi,
            catatan: mutation.catatan,
          });
        },
        "PRODUCT.EDIT_STOCK"
      );
      setNotice(
        targetProduct
          ? `Mutasi stok untuk ${targetProduct.nama} berhasil disimpan.`
          : "Mutasi stok berhasil disimpan."
      );
      setMutation(emptyMutation);
      setLastQuickMutationAmount(null);
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Gagal menyimpan mutasi stok.");
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!canManageProducts) {
      showNotification("error", "Hanya pemilik toko yang dapat impor produk.");
      return;
    }

    setImporting(true);
    setImportResult(null);
    try {
      const { parseProductWorkbook } = await import("../utils/productImport");
      const parsed = await parseProductWorkbook(file);
      const result = parsed.products.length
        ? await executeSensitiveAction(
            async () => await importProducts(parsed.products),
            "PRODUCT.IMPORT"
          )
        : null;
      const nextResult = {
        fileName: file.name,
        summary: parsed.summary,
        successRows: result?.successRows || [],
        errorRows: parsed.errorRows || [],
      };

      setImportResult(nextResult);
      setNotice(
        `Import selesai: ${result?.created || 0} produk baru, ${result?.updated || 0} stok diperbarui, ${parsed.errorRows?.length || 0} baris error.`
      );

      if (nextResult.errorRows.length) {
        showNotification("warning", "Beberapa baris import ditolak. Cek panel hasil import.");
      }
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Gagal impor produk.");
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadProductTemplate = async () => {
    try {
      const { downloadProductImportTemplate } = await import("../utils/productImport");
      await downloadProductImportTemplate();
    } catch (error) {
      showNotification("error", error.message || "Gagal mengunduh template produk.");
    }
  };

  const handleDeleteProduct = async () => {
    if (!deleteTarget) return;
    if (!canManageProducts) {
      showNotification("error", "Hanya pemilik toko yang dapat menghapus produk.");
      return;
    }

    try {
      await executeSensitiveAction(
        async () => {
          await deleteProduct(deleteTarget.id);
        },
        "PRODUCT.DELETE"
      );
      setNotice(`Produk ${deleteTarget.nama} dipindahkan ke History Produk.`);
      setDeleteTarget(null);
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Gagal menghapus produk.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Stok"
        title="Stok barang"
        description={
          canManageProducts
            ? "Tambah produk, pilih kategori, dan perbarui stok dari halaman ini."
            : "Kasir bisa melihat stok dan menambah stok masuk tanpa membuka akses edit atau hapus produk."
        }
        icon="box"
        actions={
          canManageProducts ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept={EXCEL_IMPORT_ACCEPT}
                onChange={handleImport}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => {
                  setForm(createEmptyForm({ kategori: form.kategori || "", stok_minimum: "3" }));
                  navigate("/stok-barang#tambah-produk");
                  window.setTimeout(() => focusElement(productNameRef), 120);
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
              <button
                type="button"
                onClick={handleDownloadProductTemplate}
                className="brand-button-secondary"
              >
                Download Template
              </button>
              <Link to="/history-produk" className="brand-button-secondary">
                History Produk
              </Link>
            </>
          ) : null
        }
      />

      {notice ? (
        <Panel className="border-[var(--brand-gold)]/18 bg-[var(--brand-gold)]/10 px-5 py-4">
          <p className="text-sm font-semibold text-slate-900">{notice}</p>
        </Panel>
      ) : null}

      {importResult ? (
        <Panel className="p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="font-display text-xl font-bold tracking-tight text-slate-950">
                Hasil import Excel
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {importResult.fileName} - format wajib: kategori, nama_barang, jenis, kode, modal,
                harga_jual, stok.
              </p>
            </div>
            <div className="brand-subtle-block text-sm text-slate-700">
              <span className="font-semibold text-slate-950">
                {importResult.successRows.length}
              </span>{" "}
              berhasil /{" "}
              <span className="font-semibold text-slate-950">
                {importResult.errorRows.length}
              </span>{" "}
              error
            </div>
          </div>

          {importResult.successRows.length ? (
            <div className="mt-5">
              <p className="text-sm font-semibold text-slate-950">Baris berhasil</p>
              <div className="brand-scrollbar mt-3 overflow-x-auto">
                <table className="brand-table">
                  <thead>
                    <tr>
                      <th>Kode</th>
                      <th>Nama Barang</th>
                      <th>Stok</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.successRows.slice(0, 12).map((row) => (
                      <tr key={`${row.kode}-${row.action}`}>
                        <td className="font-mono text-slate-500">{row.kode}</td>
                        <td className="font-semibold text-slate-950">{row.nama}</td>
                        <td>{row.stok}</td>
                        <td>{formatImportAction(row.action)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {importResult.errorRows.length ? (
            <div className="mt-5">
              <p className="text-sm font-semibold text-slate-950">Baris error</p>
              <div className="brand-scrollbar mt-3 overflow-x-auto">
                <table className="brand-table">
                  <thead>
                    <tr>
                      <th>Baris</th>
                      <th>Kode</th>
                      <th>Nama Barang</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.errorRows.slice(0, 12).map((row) => (
                      <tr key={`${row.rowNumber}-${row.kode}`}>
                        <td>{row.rowNumber}</td>
                        <td className="font-mono text-slate-500">{row.kode}</td>
                        <td>{row.nama}</td>
                        <td className="text-slate-600">{row.errors.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          label="Total produk"
          value={String(stats.totalProduk)}
          helper={`${stats.produkAktif} produk aktif siap dijual`}
          trend={{ label: "Produk", tone: "neutral" }}
          icon="box"
        />
        <MetricCard
          label="Stok menipis"
          value={String(stats.stokMenipis)}
          helper="Prioritas restock sebelum habis"
          accent="gold"
          trend={{ label: "Perlu cek", tone: stats.stokMenipis ? "down" : "neutral" }}
          icon="alert"
        />
        <MetricCard
          label="Stok habis"
          value={String(stats.stokHabis)}
          helper="Tidak tersedia untuk transaksi"
          accent="danger"
          trend={{ label: stats.stokHabis ? "Segera cek" : "Aman", tone: stats.stokHabis ? "down" : "neutral" }}
          icon="badge-alert"
        />
        <MetricCard
          label="Nilai stok"
          value={formatRupiah(stats.nilaiStok)}
          helper={`${stockHealthPercent}% item berada di zona aman`}
          accent="info"
          trend={{ label: "Kondisi stok", tone: stockRiskCount ? "neutral" : "up" }}
          icon="gauge"
        />
      </div>

      <Panel className="p-3">
        <div className="grid gap-2 md:grid-cols-3">
          {visibleStockSectionMenu.map((item) => {
            const isActive = item.id === activeStockSection;

            return (
              <Link
                key={item.id}
                to={`/stok-barang#${item.id}`}
                aria-current={isActive ? "page" : undefined}
                className={`group rounded-lg border px-4 py-3 transition ${
                  isActive
                    ? "border-[var(--brand-gold)]/30 bg-[var(--brand-gold)]/12 text-slate-950 shadow-[0_10px_24px_rgba(212,175,55,0.12)]"
                    : "border-slate-200 bg-white text-slate-600 hover:border-[var(--brand-gold)]/20 hover:bg-[var(--brand-gold)]/8 hover:text-slate-950"
                }`}
              >
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${
                    isActive ? "text-[var(--brand-gold)]" : "text-slate-400"
                  }`}
                >
                  {item.eyebrow}
                </span>
                <span className="mt-1 block text-sm font-bold">{item.label}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  {item.description}
                </span>
              </Link>
            );
          })}
        </div>
        {activeStockMenu ? (
          <p className="mt-3 px-1 text-sm text-slate-500">
            Sedang dibuka:{" "}
            <span className="font-semibold text-slate-950">{activeStockMenu.label}</span>
          </p>
        ) : null}
      </Panel>

      {canManageProducts && activeStockSection === "kelola-kategori" ? (
        <Panel id="kelola-kategori" className="p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="brand-kicker text-[var(--brand-gold)]">Kategori produk</p>
              <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
                Kelola kategori aktif
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                Kategori kosong akan hilang dari daftar. Rename memindahkan produk
                ke nama baru, hapus kategori memindahkan produk ke kategori pengganti.
              </p>
            </div>
            <div className="brand-subtle-block text-sm text-slate-700">
              <span className="font-semibold text-slate-950">{categoryRows.length}</span>{" "}
              kategori aktif
            </div>
          </div>

          {categoryRows.length ? (
            <div className="brand-scrollbar mt-5 overflow-x-auto">
              <table className="brand-table">
                <thead>
                  <tr>
                    <th>Kategori</th>
                    <th>Produk aktif</th>
                    <th className="brand-table-action-cell text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.map((category) => (
                    <tr key={category.name}>
                      <td>
                        <p className="font-semibold text-slate-950">{category.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Dipakai di {category.count} produk.
                        </p>
                      </td>
                      <td className="font-semibold text-slate-950">{category.count}</td>
                      <td className="brand-table-action-cell">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openRenameCategory(category.name)}
                            className="brand-button-secondary px-3 py-2"
                          >
                            Ubah nama
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteCategory(category.name)}
                            className="brand-button-danger min-h-[40px] px-3 py-2"
                          >
                            Hapus kategori
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="brand-empty-state mt-5">
              <p className="text-base font-semibold text-slate-950">Belum ada kategori aktif</p>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                Tambah produk pertama, nanti kategorinya muncul di sini.
              </p>
            </div>
          )}
        </Panel>
      ) : null}

      {activeStockSection === "tambah-produk" || activeStockSection === "tambah-kelola" ? (
      <div className="grid gap-6">
        {canManageProducts && activeStockSection === "tambah-produk" ? (
        <Panel id="tambah-produk" className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                Tambah produk lebih cepat
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                Isi nama, pilih kategori, harga, dan stok. Kalau barcode belum ada, kosongkan saja.
                Kode produk akan dibuat saat disimpan.
              </p>
            </div>
            <div className="brand-subtle-block border-[var(--brand-gold)]/16 bg-[var(--brand-gold)]/8 text-sm text-slate-700">
              <p className="font-semibold text-slate-950">Tips cepat</p>
              <p className="mt-1 leading-6">
                Setelah simpan, kategori dan stok minimum tetap dipertahankan supaya tambah barang
                berikutnya lebih cepat.
              </p>
            </div>
          </div>

          <div className="brand-subtle-block mt-5 p-4">
            <p className="brand-kicker">Kategori cepat</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {orderedCategories.length ? (
                orderedCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, kategori: category }))}
                    className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                      form.kategori === category
                        ? "bg-[var(--brand-gold)]/14 text-slate-950"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-[var(--brand-gold)]/24 hover:bg-[var(--brand-gold)]/10"
                    }`}
                  >
                    {category}
                    <span className="ml-2 text-[10px] opacity-70">
                      {categoryCounts[category] || 0}
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  Belum ada kategori aktif. Ketik kategori baru di form produk.
                </p>
              )}
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
            <CurrencyInput
              value={form.harga_jual}
              onChange={(value) => setForm((prev) => ({ ...prev, harga_jual: value }))}
              className="brand-input"
              placeholder="Harga jual"
              required
            />
            <CurrencyInput
              value={form.harga_beli}
              onChange={(value) => setForm((prev) => ({ ...prev, harga_beli: value }))}
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
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                      form.stok_minimum === value
                        ? "bg-[var(--brand-gold)]/14 text-slate-950"
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
                Simpan Produk
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
        ) : null}

        {activeStockSection === "tambah-kelola" ? (
        <Panel variant="strong" className="p-4 lg:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
            <div className="inventory-mutation-workflow">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="font-display text-xl font-bold tracking-tight text-slate-950">
                    Mutasi stok
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                    Pilih barang, tentukan mutasi, lalu simpan perubahan stok fisik.
                  </p>
                </div>
                {selectedMutationProduct ? (
                  <div className="inventory-stock-preview">
                    <div>
                      <p>Stok</p>
                      <strong>{selectedMutationProduct.stok}</strong>
                    </div>
                    <div>
                      <p>Dampak</p>
                      <strong
                        className={
                          mutationDeltaPreview === null
                            ? "text-slate-400"
                            : mutationDeltaPreview < 0
                              ? "text-red-600"
                              : "text-emerald-700"
                        }
                      >
                        {mutationDeltaPreview === null
                          ? "-"
                          : `${mutationDeltaPreview > 0 ? "+" : ""}${mutationDeltaPreview}`}
                      </strong>
                    </div>
                    <div>
                      <p>Akhir</p>
                      <strong
                        className={
                          mutationStockAfter !== null && mutationStockAfter <= 0
                            ? "text-red-600"
                            : "text-slate-950"
                        }
                      >
                        {mutationStockAfter ?? "-"}
                      </strong>
                    </div>
                  </div>
                ) : null}
              </div>

              <form onSubmit={handleMutationSubmit} className="mt-4 divide-y divide-slate-100">
                <div className="inventory-mutation-section">
                  <div>
                    <p className="inventory-mutation-title">Pilih produk</p>
                    <p className="inventory-mutation-helper">
                      Produk aktif dan stok saat ini.
                    </p>
                  </div>
                  <select
                    value={mutation.productId}
                    onChange={(event) => {
                      setLastQuickMutationAmount(null);
                      setMutation((prev) => ({ ...prev, productId: event.target.value }));
                    }}
                    className="brand-select"
                    disabled={!canAddStock || !products.length}
                    required
                  >
                    <option value="" className="bg-white">
                      {products.length ? "Pilih produk" : "Belum ada produk"}
                    </option>
                    {mutationProductOptions.map((product) => (
                      <option key={product.id} value={product.id} className="bg-white">
                        {product.nama} ({product.stok})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="inventory-mutation-section">
                  <div>
                    <p className="inventory-mutation-title">Jenis mutasi</p>
                    <p className="inventory-mutation-helper">
                      Alur pergerakan stok fisik.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {mutationTypeOptions.map((option) => {
                      const isSelected = mutation.tipe === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setMutation((prev) => ({ ...prev, tipe: option.value }))}
                          disabled={!canAddStock || !selectedMutationProduct}
                          className={`inventory-choice-button ${
                            isSelected ? "inventory-choice-button-active" : "inventory-choice-button-idle"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="inventory-mutation-section">
                  <div>
                    <p className="inventory-mutation-title">Jumlah</p>
                    <p className="inventory-mutation-helper">
                      Input manual atau chip cepat.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[minmax(150px,220px)_minmax(0,1fr)] md:items-center">
                    <input
                      ref={mutationQuantityRef}
                      type="number"
                      value={mutation.jumlah}
                      onChange={(event) => {
                        setLastQuickMutationAmount(null);
                        setMutation((prev) => ({ ...prev, jumlah: event.target.value }));
                      }}
                      className="brand-input text-base font-black tabular-nums"
                      placeholder="Jumlah"
                      disabled={!canAddStock || !selectedMutationProduct}
                      required
                    />
                    <div className="grid grid-cols-4 gap-2">
                      {quickMutationAmounts.map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => applyQuickMutationAmount(amount)}
                          disabled={!canAddStock || !selectedMutationProduct}
                          className={`inventory-quantity-chip ${
                            lastQuickMutationAmount === amount ? "inventory-quantity-chip-active" : ""
                          }`}
                        >
                          +{amount}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="inventory-mutation-section">
                  <div>
                    <p className="inventory-mutation-title">Referensi & catatan</p>
                    <p className="inventory-mutation-helper">
                      Nota supplier atau alasan koreksi.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      value={mutation.referensi}
                      onChange={(event) =>
                        setMutation((prev) => ({ ...prev, referensi: event.target.value }))
                      }
                      className="brand-input"
                      placeholder="Referensi"
                      disabled={!canAddStock || !selectedMutationProduct}
                    />
                    <input
                      value={mutation.catatan}
                      onChange={(event) => setMutation((prev) => ({ ...prev, catatan: event.target.value }))}
                      className="brand-input"
                      placeholder="Catatan"
                      disabled={!canAddStock || !selectedMutationProduct}
                    />
                  </div>
                </div>

                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={mutationSubmitDisabled}
                    className="brand-button-success w-full disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {!products.length
                      ? "Tambah Produk Dulu"
                      : !selectedMutationProduct
                        ? "Pilih Produk Dulu"
                        : canManageProducts
                          ? "Simpan Mutasi"
                          : "Tambah Stok"}
                  </button>
                </div>
              </form>
            </div>

            <div className="inventory-restock-panel max-h-[320px] overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-950">Perlu Restock Segera</p>
                </div>
                <span className={restockAlertProducts.length ? "brand-badge-danger" : "brand-badge-success"}>
                  {restockAlertProducts.length ? `${restockAlertProducts.length} urgent` : "Aman"}
                </span>
              </div>

              {restockAlertGroups.length ? (
                <div className="mt-3 space-y-3">
                  {restockAlertGroups.map((group) => (
                    <div key={group.key}>
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <span className={group.badgeClassName}>{group.label}</span>
                        <span className="text-xs font-semibold text-slate-500">
                          {group.rows.length} produk
                        </span>
                      </div>
                      <div className="space-y-2">
                        {group.rows.map((product) => (
                          <div key={product.id} className="inventory-restock-row">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-950">
                                {product.nama}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {product.kategori || "Tanpa kategori"}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="text-right text-xs font-semibold text-slate-500">
                                Sisa
                                <strong className="ml-1 text-base font-black text-red-700">
                                  {product.stok}
                                </strong>
                              </span>
                              {canAddStock ? (
                                <button
                                  type="button"
                                  onClick={() => prepareStockMutation(product)}
                                  className="brand-button-success min-h-[36px] px-3 py-2 text-xs"
                                >
                                  <AppIcon name="package-plus" className="h-3.5 w-3.5" />
                                  Tambah
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {restockAlertProducts.length > visibleRestockAlertProducts.length ? (
                    <button
                      type="button"
                      onClick={showAllRestockProducts}
                      className="mt-1 inline-flex text-xs font-bold text-[var(--brand-gold-strong)] underline-offset-4 hover:underline"
                    >
                      Lihat semua -&gt;
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                  Tidak ada stok kritis saat ini.
                </div>
              )}
            </div>
          </div>

          {!products.length ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Produk masih kosong. Tambahkan produk manual atau import Excel sebelum membuat mutasi stok.
            </p>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-950">Riwayat mutasi terbaru</p>
                {stockMutationPage.loading ? <span className="brand-badge-neutral">Memuat</span> : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Dimuat langsung dari tabel mutasi per halaman.
              </p>
            </div>
            <div
              className="brand-scrollbar space-y-2 overflow-y-auto p-3"
              style={{ maxHeight: "300px" }}
            >
              {visibleStockMutations.length ? (
                visibleStockMutations.map((log) => {
                  const product = productById.get(log.produk_id);
                  return (
                    <div
                      key={log.id}
                      className="rounded-lg bg-[var(--brand-gold)]/8 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">
                            {product?.nama || log.referensi || "Mutasi stok"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {log.referensi || "Tanpa referensi"}
                          </p>
                        </div>
                        <span className={Number(log.jumlah || 0) < 0 ? "brand-badge-danger" : "brand-badge-success"}>
                          {log.tipe || "mutasi"} {Number(log.jumlah || 0)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{log.catatan || "Tanpa catatan"}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {formatDateTime(log.created_at, { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="brand-empty-state brand-empty-state-with-motion py-8">
                  <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-white text-[var(--brand-gold-strong)] shadow-sm">
                    <AppIcon name="clipboard" className="h-5 w-5" />
                  </span>
                  <p className="text-base font-semibold text-slate-950">
                    Belum ada mutasi stok hari ini.
                  </p>
                  <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
                    Gunakan mutasi stok untuk restock barang, koreksi stok, dan opname ringan
                    sebelum laporan harian ditutup.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <span className="brand-badge-neutral">Restock barang</span>
                    <span className="brand-badge-neutral">Koreksi stok</span>
                    <span className="brand-badge-neutral">Opname barang</span>
                  </div>
                </div>
              )}
            </div>
            {!stockMutationPage.error ? (
              <PaginationBar
                page={stockMutationPage.page}
                pageCount={stockMutationPage.pageCount}
                from={stockMutationPage.from}
                to={stockMutationPage.to}
                count={stockMutationPage.count}
                onPageChange={stockMutationPage.setPage}
              />
            ) : null}
          </div>
        </Panel>
        ) : null}
      </div>
      ) : null}

      {activeStockSection === "tambah-kelola" ? (
      <Panel id="tambah-kelola" className="p-4 lg:p-5">
        <div className="brand-table-toolbar inventory-filter-toolbar mb-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.4fr)_180px_220px]">
            <label className="relative block">
              <span className="sr-only">Cari produk</span>
              <AppIcon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="brand-input pl-10"
                placeholder="Cari barcode, nama barang, atau kategori..."
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="brand-select"
            >
              <option value="semua" className="bg-white">
                Semua status
              </option>
              <option value="aktif" className="bg-white">
                Aktif
              </option>
              <option value="nonaktif" className="bg-white">
                Nonaktif
              </option>
              <option value="menipis" className="bg-white">
                Menipis
              </option>
              <option value="minimum" className="bg-white">
                Di bawah minimum
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

          <div className="flex flex-col gap-3 md:items-end">
            <div className="text-right">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Hasil filter
              </p>
              <p className="text-2xl font-black leading-7 text-slate-950">
                {filteredProducts.length}
                <span className="ml-1 text-xs font-bold text-slate-500">produk</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCompactTable((current) => !current)}
                className={compactTable ? "brand-button-primary min-h-[40px] px-3 py-2 text-xs" : "brand-button-secondary min-h-[40px] px-3 py-2 text-xs"}
                aria-pressed={compactTable}
              >
                <AppIcon name="sliders" className="h-4 w-4" />
                Rapat
              </button>
              <button
                type="button"
                onClick={resetProductFilters}
                disabled={!hasProductFilters}
                className="brand-button-secondary min-h-[40px] px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                <AppIcon name="reset" className="h-4 w-4" />
                Reset
              </button>
              <button
                type="button"
                onClick={() => void exportFilteredProducts()}
                disabled={!filteredProducts.length}
                className="brand-button-primary min-h-[40px] px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                <AppIcon name="receipt" className="h-4 w-4" />
                Export
              </button>
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="brand-badge-neutral">
                <AppIcon name="filter" className="h-3.5 w-3.5" />
                Filter aktif
              </span>
              {activeFilterChips.length ? (
                activeFilterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => clearProductFilter(chip.key)}
                    className="inventory-filter-chip"
                    title={`Hapus filter ${chip.label}`}
                  >
                    {chip.label}
                    <AppIcon name="x" className="h-3.5 w-3.5" />
                  </button>
                ))
              ) : (
                <span className="text-xs font-semibold text-slate-500">
                  Semua produk ditampilkan.
                </span>
              )}
            </div>
          </div>
        </div>

        {hiddenProductCount ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            Menampilkan {visibleProducts.length} dari {filteredProducts.length} produk. Gunakan
            pencarian atau filter untuk menemukan produk lainnya.
          </p>
        ) : null}

        {filteredProducts.length === 0 ? (
          <div className="brand-empty-state brand-empty-state-with-motion">
            <LottieState
              ariaLabel="Tidak ada hasil produk"
              size={124}
            />
            <p className="text-base font-semibold text-slate-950">Produk tidak ditemukan</p>
            <p className="mt-2 text-sm leading-7 text-slate-500">
              Coba ganti filter status, kategori, atau kata pencarian.
            </p>
          </div>
        ) : (
          <div className="brand-scroll-region brand-scrollbar overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className={`brand-table inventory-product-table min-w-[980px] ${compactTable ? "brand-table-compact" : ""}`}>
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Stok</th>
                  <th>Harga Modal</th>
                  <th>Harga Jual</th>
                  <th>Status</th>
                  <th className="brand-table-action-cell text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {visibleProducts.map((product) => {
                  const status = getProductStatus(product);

                  return (
                    <tr key={product.id}>
                      <td className="min-w-[300px]">
                        <div className="flex min-w-0 flex-col gap-1">
                          <p className="truncate text-base font-black leading-6 text-slate-950">
                            {product.nama}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                              {product.kategori || "Tanpa kategori"}
                            </span>
                            <span className="font-mono">{product.kode_produk || "Tanpa barcode"}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <ProductStockSignal product={product} />
                      </td>
                      <td className="text-slate-600">{formatRupiah(product.harga_beli)}</td>
                      <td className="text-slate-600">{formatRupiah(product.harga_jual)}</td>
                      <td>
                        <span className={`rounded-md px-3 py-1 text-xs font-semibold ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="brand-table-action-cell text-right">
                        <ProductActionMenu
                          product={product}
                          canAddStock={canAddStock}
                          canManageProducts={canManageProducts}
                          isOpen={openActionProductId === product.id}
                          onToggle={() =>
                            setOpenActionProductId((current) =>
                              current === product.id ? null : product.id
                            )
                          }
                          onAddStock={() => prepareStockMutation(product)}
                          onEdit={() => {
                            setOpenActionProductId(null);
                            editProduct(product);
                          }}
                          onDelete={() => {
                            setOpenActionProductId(null);
                            setDeleteTarget(product);
                          }}
                          onToggleStatus={() => {
                            setOpenActionProductId(null);
                            handleToggleStatus(product.id, !product.aktif);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      ) : null}

      {categoryAction ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <div className="brand-panel w-full max-w-md p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
              Kelola kategori
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
              {categoryAction.type === "rename" ? "Ubah nama kategori" : "Hapus kategori"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {categoryAction.type === "rename"
                ? `Semua produk di kategori ${categoryAction.category} akan dipindahkan ke nama kategori baru.`
                : `Produk di kategori ${categoryAction.category} akan dipindahkan ke kategori pengganti agar tidak ikut terhapus.`}
            </p>

            {categoryAction.type === "rename" ? (
              <div className="mt-5">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Nama kategori baru
                </label>
                <input
                  value={categoryAction.nextName}
                  onChange={(event) =>
                    setCategoryAction((prev) => ({
                      ...prev,
                      nextName: event.target.value,
                    }))
                  }
                  className="brand-input"
                  autoFocus
                />
              </div>
            ) : (
              <div className="mt-5">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Pindahkan produk ke kategori
                </label>
                <input
                  list="kategori-pengganti"
                  value={categoryAction.replacementCategory}
                  onChange={(event) =>
                    setCategoryAction((prev) => ({
                      ...prev,
                      replacementCategory: event.target.value,
                    }))
                  }
                  className="brand-input"
                  autoFocus
                />
                <datalist id="kategori-pengganti">
                  {orderedCategories
                    .filter((category) => category !== categoryAction.category)
                    .map((category) => (
                      <option key={category} value={category} />
                    ))}
                </datalist>
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCategoryAction(null)}
                className="brand-button-secondary"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCategoryAction}
                className={
                  categoryAction.type === "rename"
                    ? "brand-button-primary"
                    : "inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
                }
              >
                {categoryAction.type === "rename" ? "Simpan nama" : "Hapus kategori"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editForm ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <div className="brand-panel w-full max-w-2xl p-6 shadow-2xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
                  Edit produk
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
                  {editForm.nama || "Produk"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditForm(null)}
                className="brand-button-secondary px-4 py-2"
              >
                Tutup
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
              <input
                value={editForm.nama}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, nama: event.target.value }))
                }
                className="brand-input md:col-span-2"
                placeholder="Nama produk"
                required
              />
              <input
                list="kategori-produk-edit"
                value={editForm.kategori}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, kategori: event.target.value }))
                }
                className="brand-input"
                placeholder="Kategori"
                required
              />
              <datalist id="kategori-produk-edit">
                {orderedCategories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
              <input
                value={editForm.kode_produk}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, kode_produk: event.target.value }))
                }
                className="brand-input"
                placeholder="Barcode / kode produk"
              />
              <CurrencyInput
                value={editForm.harga_jual}
                onChange={(value) => setEditForm((prev) => ({ ...prev, harga_jual: value }))}
                className="brand-input"
                placeholder="Harga jual"
                required
              />
              <CurrencyInput
                value={editForm.harga_beli}
                onChange={(value) => setEditForm((prev) => ({ ...prev, harga_beli: value }))}
                className="brand-input"
                placeholder="Harga modal"
                required
              />
              <input
                type="number"
                min="0"
                value={editForm.stok}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, stok: event.target.value }))
                }
                className="brand-input"
                placeholder="Stok"
                required
              />
              <input
                type="number"
                min="0"
                value={editForm.stok_minimum}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, stok_minimum: event.target.value }))
                }
                className="brand-input"
                placeholder="Stok minimum"
                required
              />
              <select
                value={editForm.satuan}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, satuan: event.target.value }))
                }
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
              <div className="flex flex-col-reverse gap-3 md:col-span-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setEditForm(null)}
                  className="brand-button-secondary"
                >
                  Batal
                </button>
                <button type="submit" className="brand-button-primary">
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <div className="brand-panel w-full max-w-md p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-500">
              Hapus produk
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
              Pindahkan ke History Produk?
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {deleteTarget.nama} tidak akan muncul di POS atau daftar produk aktif, tetapi masih
              bisa dipulihkan dalam 30 hari.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="brand-button-secondary"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteProduct}
                className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PinConfirmationModal
        isOpen={isPinModalOpen}
        onClose={closePinModal}
        onConfirm={async () => {
          try {
            await executeConfirmedAction();
            showNotification("success", "Konfirmasi diterima");
          } catch (error) {
            if (isPinActionCancelledError(error)) return;
            showNotification("error", error.message);
          }
        }}
        title="Konfirmasi PIN"
        message={`Masukkan PIN untuk lanjut: ${actionDescription}`}
      />
    </div>
  );
}

