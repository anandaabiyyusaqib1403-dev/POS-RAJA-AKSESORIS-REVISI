import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import PinConfirmationModal from "../components/PinConfirmationModal";
import { useAuth } from "../contexts/useAuth";
import { showNotification } from "../contexts/NotificationContext";
import { serviceCategories } from "../data/serviceProducts";
import {
  isPinActionCancelledError,
  usePinConfirmation,
} from "../hooks/usePinConfirmation";
import { useProducts } from "../hooks/useProducts";
import { formatRupiah } from "../utils/format";
import CurrencyInput from "../components/CurrencyInput";
import { EXCEL_IMPORT_ACCEPT } from "../utils/excelFileGuard";

const emptyForm = {
  category: "",
  provider: "",
  name: "",
  service_type: "",
  cost: "",
  default_price: "",
  status: "Aktif",
};

const statusOptions = ["Aktif", "Nonaktif"];
const commonProviders = [
  "Telkomsel",
  "XL",
  "Indosat",
  "Tri",
  "Smartfren",
  "PLN",
  "Mobile Legends",
  "Free Fire",
  "PUBG",
  "BCA",
  "Bank Mas",
  "Mandiri",
  "BRI",
  "BNI",
  "DANA",
  "Shopee",
  "GoPay",
  "OVO",
];

function getCategoryLabel(categoryValue) {
  return serviceCategories.find((category) => category.value === categoryValue)?.label || categoryValue;
}

function mapProductToForm(product) {
  return {
    category: product.category || "",
    provider: product.provider || "",
    name: product.name || "",
    service_type: product.service_type || "",
    cost: String(product.cost || ""),
    default_price: product.default_price ? String(product.default_price) : "",
    status: product.active === false ? "Nonaktif" : "Aktif",
  };
}

function buildPayload(form) {
  const category = form.category.trim();
  const provider = form.provider.trim();
  const name = form.name.trim();
  const serviceType = form.service_type.trim();
  const cost = Number(form.cost);
  const defaultPrice =
    form.default_price === "" || form.default_price === null
      ? null
      : Number(form.default_price);

  if (!serviceCategories.some((item) => item.value === category)) {
    throw new Error("Kategori wajib dipilih.");
  }

  if (!provider) {
    throw new Error("Provider wajib diisi.");
  }

  if (!name) {
    throw new Error("Nama layanan wajib diisi.");
  }

  if (category === "kuota" && !serviceType) {
    throw new Error("Jenis layanan wajib diisi untuk kategori Kuota.");
  }

  if (!Number.isFinite(cost) || cost <= 0) {
    throw new Error("Modal harus angka lebih dari 0.");
  }

  if (defaultPrice !== null && (!Number.isFinite(defaultPrice) || defaultPrice < 0)) {
    throw new Error("Harga default harus angka 0 atau lebih.");
  }

  if (!statusOptions.includes(form.status)) {
    throw new Error("Status harus Aktif atau Nonaktif.");
  }

  return {
    category,
    provider,
    name,
    service_type: serviceType,
    cost: Math.round(cost),
    default_price: defaultPrice === null ? null : Math.round(defaultPrice),
    active: form.status === "Aktif",
  };
}

export default function ServiceProductsPage() {
  const {
    createServiceProduct,
    deleteServiceProduct,
    importServiceProducts,
    permanentlyDeleteServiceProduct,
    refreshServiceProducts,
    serviceProducts,
    updateServiceProduct,
  } = useProducts();
  const { user } = useAuth();
  const {
    actionDescription,
    closePinModal,
    executeConfirmedAction,
    executeSensitiveAction,
    isPinModalOpen,
  } = usePinConfirmation();

  const canManage = user?.role === "pemilik";
  const nameRef = useRef(null);
  const importRef = useRef(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [disableTarget, setDisableTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterCategory, setFilterCategory] = useState("semua");
  const [filterStatus, setFilterStatus] = useState("semua");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const serviceHydrationRef = useRef(false);
  const [serviceHydrating, setServiceHydrating] = useState(false);
  const [serviceHydrationError, setServiceHydrationError] = useState("");

  const providerOptions = useMemo(() => {
    const dynamicProviders = serviceProducts.map((product) => product.provider).filter(Boolean);
    return [...new Set([...commonProviders, ...dynamicProviders])].sort((a, b) =>
      a.localeCompare(b)
    );
  }, [serviceProducts]);

  const serviceTypeOptions = useMemo(() => {
    const dynamicTypes = serviceProducts
      .map((product) => product.service_type)
      .filter(Boolean);
    return [...new Set(dynamicTypes)].sort((a, b) => a.localeCompare(b));
  }, [serviceProducts]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return serviceProducts.filter((product) => {
      const matchesSearch =
        !normalizedSearch ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.provider.toLowerCase().includes(normalizedSearch) ||
        String(product.service_type || "").toLowerCase().includes(normalizedSearch);
      const matchesCategory = filterCategory === "semua" || product.category === filterCategory;
      const matchesStatus =
        filterStatus === "semua" ||
        (filterStatus === "aktif" ? product.active !== false : product.active === false);

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [filterCategory, filterStatus, search, serviceProducts]);
  const hasTableFilters =
    Boolean(search.trim()) || filterCategory !== "semua" || filterStatus !== "semua";

  const resetTableFilters = () => {
    setSearch("");
    setFilterCategory("semua");
    setFilterStatus("semua");
  };

  const stats = useMemo(
    () => ({
      total: serviceProducts.length,
      active: serviceProducts.filter((product) => product.active !== false).length,
      inactive: serviceProducts.filter((product) => product.active === false).length,
    }),
    [serviceProducts]
  );

  useEffect(() => {
    if (disableTarget?.id && !serviceProducts.some((product) => product.id === disableTarget.id)) {
      setDisableTarget(null);
    }

    if (deleteTarget?.id && !serviceProducts.some((product) => product.id === deleteTarget.id)) {
      setDeleteTarget(null);
    }

    if (editingId && !serviceProducts.some((product) => product.id === editingId)) {
      setEditingId(null);
      setForm(emptyForm);
    }
  }, [deleteTarget?.id, disableTarget?.id, editingId, serviceProducts]);

  const hydrateServiceProducts = useCallback(async () => {
    serviceHydrationRef.current = true;
    setServiceHydrating(true);
    setServiceHydrationError("");

    try {
      await refreshServiceProducts();
    } catch (error) {
      const message = error.message || "Gagal memuat layanan digital.";
      console.error("Gagal memuat layanan digital:", error);
      setServiceHydrationError(message);
      showNotification("error", message);
    } finally {
      setServiceHydrating(false);
    }
  }, [refreshServiceProducts]);

  useEffect(() => {
    if (serviceHydrationRef.current || serviceProducts.length) return undefined;

    void hydrateServiceProducts();
    return undefined;
  }, [hydrateServiceProducts, serviceProducts.length]);

  const retryServiceHydration = () => {
    serviceHydrationRef.current = false;
    void hydrateServiceProducts();
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setNotice("");
    nameRef.current?.focus();
  };

  const startEdit = (product) => {
    setEditingId(product.id);
    setForm(mapProductToForm(product));
    setNotice("");
    nameRef.current?.focus();
  };

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canManage) {
      showNotification("error", "Hanya pemilik toko yang bisa mengelola layanan.");
      return;
    }

    try {
      const payload = buildPayload(form);
      const action = editingId
        ? () => updateServiceProduct(editingId, payload)
        : () => createServiceProduct(payload);

      await executeSensitiveAction(action, editingId ? "SERVICE.EDIT" : "SERVICE.CREATE");
      setNotice(
        `Layanan "${payload.name}" ${editingId ? "berhasil diperbarui" : "berhasil ditambahkan"}.`
      );
      setImportResult(null);
      setEditingId(null);
      setForm(emptyForm);
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Gagal menyimpan layanan.");
    }
  };

  const handleDisable = async () => {
    if (!disableTarget) return;

    try {
      await executeSensitiveAction(
        () => deleteServiceProduct(disableTarget.id),
        "SERVICE.DISABLE"
      );
      setNotice(`Layanan "${disableTarget.name}" dinonaktifkan.`);
      setDisableTarget(null);
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Gagal menonaktifkan layanan.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await executeSensitiveAction(
        () => permanentlyDeleteServiceProduct(deleteTarget.id),
        "SERVICE.DELETE"
      );
      setNotice(`Layanan "${deleteTarget.name}" berhasil dihapus.`);
      if (editingId === deleteTarget.id) {
        setEditingId(null);
        setForm(emptyForm);
      }
      setDeleteTarget(null);
      setDisableTarget(null);
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Gagal menghapus layanan.");
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;
    if (!canManage) {
      showNotification("error", "Hanya pemilik toko yang bisa import layanan.");
      return;
    }

    setImporting(true);
    try {
      const { parseServiceWorkbook } = await import("../utils/serviceImport");
      const parsed = await parseServiceWorkbook(file);

      if (!parsed.products.length) {
        setImportResult({
          fileName: file.name,
          summary: parsed.summary,
          successRows: [],
          errorRows: parsed.errors,
        });
        showNotification("warning", "Tidak ada baris valid untuk diimpor.");
        return;
      }

      const result = await executeSensitiveAction(
        () => importServiceProducts(parsed.products),
        "SERVICE.IMPORT"
      );

      setImportResult({
        fileName: file.name,
        summary: {
          ...parsed.summary,
          created: result.created,
          updated: result.updated,
        },
        successRows: result.successRows || [],
        errorRows: parsed.errors,
      });
      setNotice(
        `Import selesai: ${result.created} baru, ${result.updated} diperbarui, ${parsed.errors.length} error.`
      );

      if (parsed.errors.length) {
        showNotification("warning", `${parsed.errors.length} baris import punya error.`);
      } else {
        showNotification("success", "Import layanan berhasil.");
      }
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Gagal import layanan.");
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadServiceTemplate = async () => {
    try {
      const { downloadServiceTemplate } = await import("../utils/serviceImport");
      await downloadServiceTemplate();
    } catch (error) {
      showNotification("error", error.message || "Gagal mengunduh template layanan.");
    }
  };

  const handleExportServices = async (rows = serviceProducts) => {
    try {
      const { exportServicesToExcel } = await import("../utils/serviceImport");
      await exportServicesToExcel(Array.isArray(rows) ? rows : serviceProducts);
    } catch (error) {
      showNotification("error", error.message || "Gagal export layanan.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layanan Digital"
        title="Kelola Layanan"
        description="Atur daftar layanan yang tersedia untuk transaksi kasir."
        icon="wallet"
        actions={
          canManage ? (
            <>
              <input
                ref={importRef}
                type="file"
                accept={EXCEL_IMPORT_ACCEPT}
                onChange={handleImport}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                disabled={importing}
                className="brand-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {importing ? "Mengimpor..." : "Import Excel"}
              </button>
              <button type="button" onClick={handleDownloadServiceTemplate} className="brand-button-secondary">
                Download Template
              </button>
              <button
                type="button"
                onClick={handleExportServices}
                className="brand-button-secondary"
              >
                Export Excel
              </button>
              <button type="button" onClick={resetForm} className="brand-button-primary">
                Tambah Layanan
              </button>
            </>
          ) : null
        }
      />

      {serviceHydrating ? (
        <Panel className="p-4 text-sm font-semibold text-slate-600">
          Memuat layanan digital...
        </Panel>
      ) : null}

      {serviceHydrationError ? (
        <Panel className="border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">{serviceHydrationError}</p>
          <button type="button" onClick={retryServiceHydration} className="brand-button-secondary mt-3">
            Coba Lagi
          </button>
        </Panel>
      ) : null}

      {notice ? (
        <Panel className="border-[var(--brand-gold)]/30 bg-[var(--brand-gold)]/10 px-5 py-4">
          <p className="text-sm font-semibold text-slate-900">{notice}</p>
        </Panel>
      ) : null}

      {importResult ? (
        <Panel className="p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-display text-xl font-bold text-slate-950">
                Hasil Import {importResult.fileName}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Total imported {importResult.successRows.length}, total failed{" "}
                {importResult.errorRows.length}
              </p>
            </div>
            {importResult.summary.created !== undefined ? (
              <p className="text-sm font-semibold text-slate-600">
                {importResult.summary.created} baru / {importResult.summary.updated} update
              </p>
            ) : null}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                Berhasil
              </p>
              <div className="mt-2 space-y-2">
                {importResult.successRows.slice(0, 8).map((row, index) => (
                  <div key={`${row.name}-${index}`} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-900">{row.name}</span>
                    <span className="text-slate-500"> - {row.provider}</span>
                    {row.service_type ? (
                      <span className="ml-2 text-xs font-semibold text-slate-500">
                        {row.service_type}
                      </span>
                    ) : null}
                    <span className="float-right text-xs font-semibold text-emerald-700">
                      {row.action}
                    </span>
                  </div>
                ))}
                {!importResult.successRows.length ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
                    Tidak ada baris berhasil.
                  </p>
                ) : null}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">
                Error
              </p>
              <div className="mt-2 space-y-2">
                {importResult.errorRows.slice(0, 8).map((row) => (
                  <div key={row.rowNumber} className="rounded-lg bg-red-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-red-700">Baris {row.rowNumber}</span>
                    <span className="text-slate-600"> - {row.errors.join(", ")}</span>
                  </div>
                ))}
                {!importResult.errorRows.length ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
                    Tidak ada error.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Panel className="p-5 text-center">
          <p className="text-3xl font-black text-slate-950">{stats.total}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Total Layanan
          </p>
        </Panel>
        <Panel className="p-5 text-center">
          <p className="text-3xl font-black text-emerald-600">{stats.active}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Aktif
          </p>
        </Panel>
        <Panel className="p-5 text-center">
          <p className="text-3xl font-black text-slate-500">{stats.inactive}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Nonaktif
          </p>
        </Panel>
      </div>

      {canManage ? (
        <Panel className="p-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
                {editingId ? "Edit layanan" : "Tambah layanan"}
              </p>
              <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
                {editingId ? "Update Data Layanan" : "Layanan Baru"}
              </h3>
            </div>
            {editingId ? (
              <button type="button" onClick={resetForm} className="brand-button-secondary">
                Batal Edit
              </button>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Kategori</label>
              <select
                value={form.category}
                onChange={(event) => updateForm("category", event.target.value)}
                className="brand-select"
                required
              >
                <option value="">Pilih kategori</option>
                {serviceCategories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Provider</label>
              <input
                list="service-provider-options"
                value={form.provider}
                onChange={(event) => updateForm("provider", event.target.value)}
                className="brand-input"
                placeholder="Telkomsel, XL, PLN"
                required
              />
              <datalist id="service-provider-options">
                {providerOptions.map((provider) => (
                  <option key={provider} value={provider} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Nama Layanan</label>
              <input
                ref={nameRef}
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                className="brand-input"
                placeholder="Pulsa 10K"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Jenis Layanan
              </label>
              <input
                list="service-type-options"
                value={form.service_type}
                onChange={(event) => updateForm("service_type", event.target.value)}
                className="brand-input"
                placeholder="COMBO MAX 28 HARI"
                required={form.category === "kuota"}
              />
              <datalist id="service-type-options">
                {serviceTypeOptions.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Modal</label>
              <CurrencyInput
                value={form.cost}
                onChange={(value) => updateForm("cost", value)}
                className="brand-input"
                placeholder="9500"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Harga Default
              </label>
              <CurrencyInput
                value={form.default_price}
                onChange={(value) => updateForm("default_price", value)}
                className="brand-input"
                placeholder="Opsional"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Status</label>
              <select
                value={form.status}
                onChange={(event) => updateForm("status", event.target.value)}
                className="brand-select"
                required
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 md:col-span-2 xl:col-span-3">
              <button type="submit" className="brand-button-primary flex-1">
                {editingId ? "Simpan Perubahan" : "Tambah Layanan"}
              </button>
              <button type="button" onClick={resetForm} className="brand-button-secondary">
                Reset
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel className="p-6">
        <div className="brand-table-toolbar mb-5">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_180px] xl:min-w-[720px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="brand-input"
              placeholder="Cari nama layanan atau provider"
            />
            <select
              value={filterCategory}
              onChange={(event) => setFilterCategory(event.target.value)}
              className="brand-select"
            >
              <option value="semua">Semua Kategori</option>
              {serviceCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="brand-select"
            >
              <option value="semua">Semua Status</option>
              <option value="aktif">Aktif</option>
              <option value="nonaktif">Nonaktif</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="brand-badge-neutral">{filteredProducts.length} layanan</span>
            <button
              type="button"
              onClick={resetTableFilters}
              disabled={!hasTableFilters}
              className="brand-button-secondary px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => handleExportServices(filteredProducts)}
              disabled={!filteredProducts.length}
              className="brand-button-primary px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export
            </button>
          </div>
        </div>

        <div className="brand-scroll-region brand-scrollbar overflow-x-auto">
          <table className="brand-table w-full">
            <thead>
              <tr>
                <th>Nama Layanan</th>
                <th>Kategori</th>
                <th>Provider</th>
                <th>Jenis Layanan</th>
                <th>Modal</th>
                <th>Harga Default</th>
                <th>Status</th>
                {canManage ? <th>Aksi</th> : null}
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td className="font-semibold text-slate-950">{product.name}</td>
                  <td>{getCategoryLabel(product.category)}</td>
                  <td>{product.provider}</td>
                  <td>{product.service_type || "-"}</td>
                  <td className="font-mono">{formatRupiah(product.cost)}</td>
                  <td className="font-mono">
                    {product.default_price ? formatRupiah(product.default_price) : "-"}
                  </td>
                  <td>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        product.active !== false
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {product.active !== false ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  {canManage ? (
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(product)}
                          className="brand-button-secondary px-3 py-2 text-xs"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDisableTarget(product)}
                          disabled={product.active === false}
                          className="rounded-lg px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Nonaktif
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(product)}
                          className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
              {!filteredProducts.length ? (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="py-12 text-center text-slate-500">
                    Belum ada layanan yang cocok.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      {disableTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="brand-panel w-full max-w-md p-6">
            <h3 className="font-display text-xl font-bold text-slate-950">
              Nonaktifkan Layanan?
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              <span className="font-semibold">{disableTarget.name}</span> dari{" "}
              {disableTarget.provider} akan disembunyikan dari kasir.
              Data transaksi lama tetap aman.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDisableTarget(null)}
                className="brand-button-secondary"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDisable}
                className="rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Nonaktifkan
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="brand-panel w-full max-w-md p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-600">
              Hapus layanan
            </p>
            <h3 className="mt-2 font-display text-xl font-bold text-slate-950">
              Hapus Layanan Ini?
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              <span className="font-semibold">{deleteTarget.name}</span> dari{" "}
              {deleteTarget.provider} akan dihapus dari master layanan dan tidak muncul lagi di
              Kelola Layanan. Riwayat transaksi lama tetap tersimpan.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="brand-button-secondary"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
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
        onConfirm={executeConfirmedAction}
        title="Konfirmasi PIN"
        message={`Aksi: ${actionDescription}`}
      />
    </div>
  );
}

