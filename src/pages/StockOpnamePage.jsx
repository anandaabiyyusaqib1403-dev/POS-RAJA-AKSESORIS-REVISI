import { useEffect, useMemo, useState } from "react";
import FeatureLoadPanel from "../components/FeatureLoadPanel";
import MetricCard from "../components/app/MetricCard";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { useProducts } from "../hooks/useProducts";
import { useShift } from "../hooks/useShift";
import { showNotification } from "../contexts/NotificationContext";
import { formatCashierName } from "../utils/cashier";
import { formatDateTime, formatRupiah } from "../utils/format";
import {
  filterRowsBySearch,
  getDifferenceMeta,
  getStatusClass,
  getStatusLabel,
  normalizeDraftRows,
  summarizeRows,
} from "../features/stock-opname/utils/opnameRows";

const allCategoriesValue = "semua";
const MAX_RENDERED_OPNAME_SESSIONS = 50;
const MAX_RENDERED_OPNAME_ROWS = 75;

export default function StockOpnamePage() {
  const {
    applyStockOpnameSession,
    categories,
    coreError,
    coreLoading,
    createStockOpnameSession,
    products,
    refreshStockOpname,
    saveStockOpnameDraft,
    stockOpnameSessions,
  } = useProducts();
  const { staffUsers } = useShift();
  const [mode, setMode] = useState("list");
  const [activeSessionId, setActiveSessionId] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");
  const [sessionCategory, setSessionCategory] = useState(allCategoriesValue);
  const [rowSearch, setRowSearch] = useState("");
  const [draftRows, setDraftRows] = useState([]);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [newSession, setNewSession] = useState({
    name: "",
    category: allCategoriesValue,
  });
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  const categoryOptions = useMemo(
    () => [...new Set(categories.filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [categories]
  );
  const activeSession = useMemo(
    () => stockOpnameSessions.find((session) => session.id === activeSessionId) || null,
    [activeSessionId, stockOpnameSessions]
  );
  const staffNameById = useMemo(
    () => new Map(staffUsers.map((staff) => [staff.id, staff.nama])),
    [staffUsers]
  );
  const filteredSessions = useMemo(() => {
    const keyword = sessionSearch.trim().toLowerCase();
    return stockOpnameSessions.filter((session) => {
      const matchSearch = keyword
        ? session.name.toLowerCase().includes(keyword) ||
          session.category.toLowerCase().includes(keyword) ||
          getStatusLabel(session.status).toLowerCase().includes(keyword)
        : true;
      const matchCategory =
        sessionCategory === allCategoriesValue ||
        session.category === sessionCategory ||
        (sessionCategory === allCategoriesValue && session.category === "Semua kategori");
      return matchSearch && matchCategory;
    });
  }, [sessionCategory, sessionSearch, stockOpnameSessions]);
  const visibleSessions = useMemo(
    () => filteredSessions.slice(0, MAX_RENDERED_OPNAME_SESSIONS),
    [filteredSessions]
  );
  const filteredInputRows = useMemo(
    () => filterRowsBySearch(draftRows, rowSearch),
    [draftRows, rowSearch]
  );
  const visibleRows = useMemo(
    () => filteredInputRows.slice(0, MAX_RENDERED_OPNAME_ROWS),
    [filteredInputRows]
  );
  const inputSummary = useMemo(() => summarizeRows(draftRows), [draftRows]);
  const activeDetailRows = useMemo(() => activeSession?.items || [], [activeSession]);
  const detailSummary = useMemo(
    () => summarizeRows(normalizeDraftRows(activeDetailRows)),
    [activeDetailRows]
  );

  useEffect(() => {
    if (mode !== "input" || !activeSession) return;
    setDraftRows(normalizeDraftRows(activeSession.items));
    setRowSearch("");
  }, [activeSession, mode]);

  const openNewSession = () => {
    const category = sessionCategory === allCategoriesValue ? allCategoriesValue : sessionCategory;
    const categoryLabel = category === allCategoriesValue ? "Semua Kategori" : category;
    setNewSession({
      category,
      name: `Opname ${categoryLabel} - ${formatDateTime(new Date(), { dateStyle: "medium" })}`,
    });
    setNewSessionOpen(true);
  };

  const handleCreateSession = async () => {
    setCreating(true);
    try {
      const session = await createStockOpnameSession(newSession);
      showNotification("success", "Sesi Stock Opname berhasil dibuat.");
      setNewSessionOpen(false);
      setActiveSessionId(session.id);
      setMode("input");
    } catch (error) {
      showNotification("error", error.message || "Gagal membuat sesi Stock Opname.");
    } finally {
      setCreating(false);
    }
  };

  const updateRealStock = (itemId, value) => {
    const numericValue = Number(value);
    const sanitizedValue =
      value === "" || !Number.isFinite(numericValue)
        ? ""
        : Math.max(0, Math.round(numericValue));
    setDraftRows((rows) =>
      rows.map((row) =>
        row.id === itemId
          ? {
              ...row,
              real_stock: sanitizedValue,
              difference: sanitizedValue === "" ? 0 : sanitizedValue - row.system_stock,
            }
          : row
      )
    );
  };

  const updateNote = (itemId, value) => {
    setDraftRows((rows) =>
      rows.map((row) => (row.id === itemId ? { ...row, note: value } : row))
    );
  };

  const handleSaveDraft = async () => {
    if (!activeSession) return;

    setSaving(true);
    try {
      await saveStockOpnameDraft({
        sessionId: activeSession.id,
        items: draftRows,
      });
      showNotification("success", "Draft Stock Opname tersimpan.");
    } catch (error) {
      showNotification("error", error.message || "Gagal menyimpan draft Stock Opname.");
    } finally {
      setSaving(false);
    }
  };

  const handleApplySession = async () => {
    if (!activeSession) return;

    setApplying(true);
    try {
      await saveStockOpnameDraft({
        sessionId: activeSession.id,
        items: draftRows,
      });
      await applyStockOpnameSession(activeSession.id);
      showNotification("success", "Stock Opname selesai. Stok barang sudah disesuaikan.");
      setApplyOpen(false);
      setMode("detail");
    } catch (error) {
      showNotification("error", error.message || "Gagal menerapkan Stock Opname.");
    } finally {
      setApplying(false);
    }
  };

  const backToList = () => {
    setMode("list");
    setActiveSessionId("");
    setDraftRows([]);
    setRowSearch("");
  };

  const getCreatedBy = (session) => {
    if (!session.created_by) return "-";
    return staffNameById.get(session.created_by) || formatCashierName(session.created_by);
  };

  const checkedDisabled = !inputSummary.checked || saving || applying || activeSession?.status === "completed";

  if ((mode === "input" || mode === "detail") && !activeSession) {
    return (
      <div className="space-y-6 pb-24">
        <PageHeader
          eyebrow="Cek stok"
          title="Stock Opname"
          description="Cocokkan stok fisik dengan catatan barang sebelum penyesuaian."
          icon="clipboard"
          actions={
            <button type="button" onClick={backToList} className="brand-button-secondary">
              Kembali
            </button>
          }
        />

        <FeatureLoadPanel
          error="Sesi Stock Opname belum berhasil dibuka."
          loading={coreLoading}
          loadingText="Membuka sesi Stock Opname..."
          onRetry={refreshStockOpname}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        eyebrow="Cek stok"
        title="Stock Opname"
        description="Cocokkan stok fisik dengan catatan barang sebelum stok disesuaikan."
        icon="clipboard"
        actions={
          mode === "list" ? (
            <button type="button" onClick={openNewSession} className="brand-button-primary">
              Buat Opname Baru
            </button>
          ) : (
            <button type="button" onClick={backToList} className="brand-button-secondary">
              Kembali
            </button>
          )
        }
      />

      <FeatureLoadPanel
        error={coreError}
        loading={coreLoading}
        loadingText="Sinkronisasi Stock Opname..."
        onRetry={refreshStockOpname}
      />

      {mode === "list" ? (
        <>
          <Panel className="p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto] lg:items-center">
              <input
                value={sessionSearch}
                onChange={(event) => setSessionSearch(event.target.value)}
                className="brand-input"
                placeholder="Cari nama sesi, kategori, atau status..."
              />
              <select
                value={sessionCategory}
                onChange={(event) => setSessionCategory(event.target.value)}
                className="brand-select"
              >
                <option value={allCategoriesValue} className="bg-white">
                  Semua kategori
                </option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category} className="bg-white">
                    {category}
                  </option>
                ))}
              </select>
              <button type="button" onClick={openNewSession} className="brand-button-primary">
                Buat Opname Baru
              </button>
            </div>
          </Panel>

          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Total sesi" value={String(stockOpnameSessions.length)} />
            <MetricCard
              label="Draft berjalan"
              value={String(stockOpnameSessions.filter((session) => session.status === "draft").length)}
              accent="gold"
            />
            <MetricCard
              label="Completed"
              value={String(stockOpnameSessions.filter((session) => session.status === "completed").length)}
              accent="success"
            />
          </div>

          {visibleSessions.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {visibleSessions.map((session) => (
                <Panel key={session.id} className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-3 py-1 text-xs font-semibold ${getStatusClass(session.status)}`}>
                          {getStatusLabel(session.status)}
                        </span>
                        <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                          {session.category}
                        </span>
                      </div>
                      <h3 className="mt-3 font-display text-xl font-bold tracking-tight text-slate-950">
                        {session.name}
                      </h3>
                      <p className="mt-2 text-sm text-slate-500">
                        {formatDateTime(session.created_at, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}{" "}
                        oleh {getCreatedBy(session)}
                      </p>
                    </div>
                    <div className="brand-subtle-block min-w-[150px] text-sm text-slate-700">
                      <p className="font-semibold text-slate-950">
                        {session.checked_products}/{session.total_products}
                      </p>
                      <p className="mt-1">produk dicek</p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-slate-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Minus
                      </p>
                      <p className="mt-1 text-lg font-bold text-red-700">-{session.total_minus}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Plus
                      </p>
                      <p className="mt-1 text-lg font-bold text-emerald-700">+{session.total_plus}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Loss
                      </p>
                      <p className="mt-1 text-lg font-bold text-slate-950">
                        {formatRupiah(session.total_loss)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap justify-end gap-2">
                    {session.status === "draft" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSessionId(session.id);
                          setMode("input");
                        }}
                        className="brand-button-primary"
                      >
                        Continue
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSessionId(session.id);
                        setMode("detail");
                      }}
                      className="brand-button-secondary"
                    >
                      View detail
                    </button>
                  </div>
                </Panel>
              ))}
            </div>
          ) : (
            <div className="brand-empty-state">
              <p className="text-base font-semibold text-slate-950">Belum ada sesi opname</p>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                Buat sesi pertama untuk mulai mencocokkan stok fisik dengan catatan barang.
              </p>
            </div>
          )}
          {filteredSessions.length > visibleSessions.length ? (
            <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Menampilkan {visibleSessions.length} dari {filteredSessions.length} sesi. Persempit
              pencarian agar halaman tetap ringan.
            </p>
          ) : null}
        </>
      ) : null}

      {mode === "input" && activeSession ? (
        <>
          <Panel className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <button
                  type="button"
                  onClick={backToList}
                  className="mb-3 text-sm font-semibold text-slate-500 transition hover:text-slate-950"
                >
                  Kembali ke daftar
                </button>
                <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                  {activeSession.name}
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  {activeSession.category} · {getStatusLabel(activeSession.status)}
                </p>
              </div>
              <div className="brand-subtle-block text-sm text-slate-700">
                Simpan draft dulu, lalu terapkan setelah angkanya dicek pemilik toko.
              </div>
            </div>
          </Panel>

          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard label="Produk dicek" value={`${inputSummary.checked}/${draftRows.length}`} />
            <MetricCard label="Total minus" value={`-${inputSummary.minus}`} accent="danger" />
            <MetricCard label="Total plus" value={`+${inputSummary.plus}`} accent="success" />
            <MetricCard label="Estimasi loss" value={formatRupiah(inputSummary.loss)} accent="gold" />
          </div>

          <Panel className="p-4">
            <input
              value={rowSearch}
              onChange={(event) => setRowSearch(event.target.value)}
              className="brand-input"
              placeholder="Cari nama produk atau barcode..."
            />
          </Panel>

          <Panel className="p-0">
            {filteredInputRows.length > visibleRows.length ? (
              <p className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-600">
                Menampilkan {visibleRows.length} dari {filteredInputRows.length} item. Gunakan
                pencarian produk/barcode untuk membuka item lainnya.
              </p>
            ) : null}
            <div className="brand-scrollbar overflow-x-auto">
              <table className="brand-table min-w-[980px]">
                <thead>
                  <tr>
                    <th>Produk</th>
                    <th>Stok Catatan</th>
                    <th>Stok Real</th>
                    <th>Selisih</th>
                    <th>Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const diff = getDifferenceMeta(row);

                    return (
                      <tr key={row.id}>
                        <td>
                          <p className="font-semibold text-slate-950">{row.product_name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.product_code || "-"} · {row.category}
                          </p>
                        </td>
                        <td className="text-lg font-bold text-slate-950">{row.system_stock}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={row.real_stock}
                            onChange={(event) => updateRealStock(row.id, event.target.value)}
                            className="brand-input h-14 w-28 text-center text-lg font-bold"
                            placeholder="0"
                          />
                        </td>
                        <td>
                          <span className={`inline-flex min-w-[72px] justify-center rounded-md px-3 py-2 text-sm font-bold ${diff.className}`}>
                            {diff.label}
                          </span>
                        </td>
                        <td>
                          <input
                            value={row.note}
                            onChange={(event) => updateNote(row.id, event.target.value)}
                            className="brand-input h-12 min-w-[260px]"
                            placeholder="Catatan selisih..."
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel className="sticky bottom-4 z-30 border-[var(--brand-gold)]/22 bg-white/95 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  {inputSummary.checked} produk sudah dicek
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Selisih minus {inputSummary.minus}, plus {inputSummary.plus}. Simpan draft sebelum apply.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={saving || applying || activeSession.status === "completed"}
                  className="brand-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Menyimpan..." : "Simpan Draft"}
                </button>
                <button
                  type="button"
                  onClick={() => setApplyOpen(true)}
                  disabled={checkedDisabled}
                  className="brand-button-success disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Terapkan Penyesuaian
                </button>
              </div>
            </div>
          </Panel>
        </>
      ) : null}

      {mode === "detail" && activeSession ? (
        <>
          <Panel className="p-5">
            <button
              type="button"
              onClick={backToList}
              className="mb-3 text-sm font-semibold text-slate-500 transition hover:text-slate-950"
            >
              Kembali ke daftar
            </button>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                  {activeSession.name}
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  {activeSession.category} · {getStatusLabel(activeSession.status)}
                </p>
              </div>
              <span className={`w-fit rounded-md px-3 py-1 text-xs font-semibold ${getStatusClass(activeSession.status)}`}>
                {getStatusLabel(activeSession.status)}
              </span>
            </div>
          </Panel>

          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard label="Total produk" value={String(activeSession.total_products)} />
            <MetricCard label="Total minus" value={`-${detailSummary.minus}`} accent="danger" />
            <MetricCard label="Total plus" value={`+${detailSummary.plus}`} accent="success" />
            <MetricCard label="Total loss" value={formatRupiah(detailSummary.loss)} accent="gold" />
          </div>

          <Panel className="p-0">
            <div className="brand-scrollbar overflow-x-auto">
              <table className="brand-table min-w-[960px]">
                <thead>
                  <tr>
                    <th>Produk</th>
                    <th>Stok Catatan</th>
                    <th>Stok Real</th>
                    <th>Selisih</th>
                    <th>Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDetailRows.map((row) => {
                    const diff = getDifferenceMeta(row);

                    return (
                      <tr key={row.id}>
                        <td>
                          <p className="font-semibold text-slate-950">{row.product_name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.product_code || "-"} · {row.category}
                          </p>
                        </td>
                        <td className="font-semibold text-slate-950">{row.system_stock}</td>
                        <td className="font-semibold text-slate-950">
                          {row.real_stock ?? "-"}
                        </td>
                        <td>
                          <span className={`inline-flex min-w-[72px] justify-center rounded-md px-3 py-2 text-sm font-bold ${diff.className}`}>
                            {diff.label}
                          </span>
                        </td>
                        <td className="text-slate-600">{row.note || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : null}

      {newSessionOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <div className="brand-panel w-full max-w-lg p-6 shadow-2xl">
            <p className="brand-kicker text-[var(--brand-gold)]">Sesi baru</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
              Buat Opname Baru
            </h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              Pilih kategori agar daftar input lebih pendek dan mudah dihitung di toko.
            </p>
            <div className="mt-5 space-y-4">
              <input
                value={newSession.name}
                onChange={(event) =>
                  setNewSession((prev) => ({ ...prev, name: event.target.value }))
                }
                className="brand-input"
                placeholder="Nama sesi"
              />
              <select
                value={newSession.category}
                onChange={(event) =>
                  setNewSession((prev) => ({ ...prev, category: event.target.value }))
                }
                className="brand-select"
              >
                <option value={allCategoriesValue} className="bg-white">
                  Semua kategori ({products.length} produk)
                </option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category} className="bg-white">
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setNewSessionOpen(false)}
                className="brand-button-secondary"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCreateSession}
                disabled={creating}
                className="brand-button-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Membuat..." : "Buat Sesi"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {applyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div className="brand-panel w-full max-w-xl p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-600">
              Konfirmasi pemilik toko
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
              Terapkan penyesuaian stok?
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Sistem akan menyimpan draft terakhir, mengubah stok produk sesuai stok real yang
              sudah diisi, dan membuat catatan mutasi penyesuaian. Aksi ini hanya untuk pemilik toko.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-500">
                  Minus
                </p>
                <p className="mt-1 text-lg font-bold text-red-700">-{inputSummary.minus}</p>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-500">
                  Plus
                </p>
                <p className="mt-1 text-lg font-bold text-emerald-700">+{inputSummary.plus}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Dicek
                </p>
                <p className="mt-1 text-lg font-bold text-slate-950">{inputSummary.checked}</p>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setApplyOpen(false)}
                disabled={applying}
                className="brand-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApplySession}
                disabled={applying}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {applying ? "Menerapkan..." : "Ya, Terapkan Stok"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

