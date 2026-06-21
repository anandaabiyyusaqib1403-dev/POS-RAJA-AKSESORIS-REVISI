import { useMemo, useState } from "react";
import FeatureLoadPanel from "../components/FeatureLoadPanel";
import MetricCard from "../components/app/MetricCard";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import PinConfirmationModal from "../components/PinConfirmationModal";
import { showNotification } from "../contexts/NotificationContext";
import {
  isPinActionCancelledError,
  usePinConfirmation,
} from "../hooks/usePinConfirmation";
import { useProducts } from "../hooks/useProducts";
import { useShift } from "../hooks/useShift";
import { formatCashierName } from "../utils/cashier";
import { formatDateTime } from "../utils/format";

const recycleDays = 30;
const MAX_RENDERED_DELETED_PRODUCTS = 50;

function getDaysLeft(deletedAt) {
  if (!deletedAt) return recycleDays;

  const deletedTime = new Date(deletedAt).getTime();
  if (!Number.isFinite(deletedTime)) return recycleDays;

  const expiresAt = deletedTime + recycleDays * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function ProductHistoryPage() {
  const {
    coreError,
    coreLoading,
    deletedProducts,
    refreshProducts,
    restoreProduct,
    permanentlyDeleteProduct,
    purgeExpiredDeletedProducts,
  } = useProducts();
  const { staffUsers } = useShift();
  const {
    isPinModalOpen,
    closePinModal,
    executeSensitiveAction,
    executeConfirmedAction,
    actionDescription,
  } = usePinConfirmation();
  const [pendingAction, setPendingAction] = useState(null);
  const [processingCleanup, setProcessingCleanup] = useState(false);

  const userNameById = useMemo(
    () => new Map(staffUsers.map((staff) => [staff.id, staff.nama])),
    [staffUsers]
  );

  const stats = useMemo(
    () => ({
      total: deletedProducts.length,
      expiringSoon: deletedProducts.filter((product) => getDaysLeft(product.deleted_at) <= 7)
        .length,
      expired: deletedProducts.filter((product) => getDaysLeft(product.deleted_at) === 0).length,
    }),
    [deletedProducts]
  );
  const visibleDeletedProducts = useMemo(
    () => deletedProducts.slice(0, MAX_RENDERED_DELETED_PRODUCTS),
    [deletedProducts]
  );

  const getDeletedBy = (product) => {
    if (!product.deleted_by) return "-";
    return userNameById.get(product.deleted_by) || formatCashierName(product.deleted_by);
  };

  const confirmAction = async () => {
    if (!pendingAction) return;

    try {
      const isRestore = pendingAction.type === "restore";
      await executeSensitiveAction(
        async () => {
          if (isRestore) {
            await restoreProduct(pendingAction.product.id);
          } else {
            await permanentlyDeleteProduct(pendingAction.product.id);
          }
        },
        isRestore ? "PRODUCT.RESTORE" : "PRODUCT.PERMANENT_DELETE"
      );
      showNotification(
        "success",
        isRestore
          ? `Produk ${pendingAction.product.nama} berhasil dipulihkan.`
          : `Produk ${pendingAction.product.nama} dihapus permanen.`
      );
      setPendingAction(null);
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Riwayat produk belum bisa diproses.");
    }
  };

  const runCleanup = async () => {
    setProcessingCleanup(true);
    try {
      const deletedCount = await executeSensitiveAction(
        async () => await purgeExpiredDeletedProducts(),
        "PRODUCT.PERMANENT_DELETE"
      );
      showNotification(
        "success",
        deletedCount
          ? `${deletedCount} produk kedaluwarsa dibersihkan.`
          : "Tidak ada produk yang melewati 30 hari."
      );
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Gagal membersihkan produk kedaluwarsa.");
    } finally {
      setProcessingCleanup(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Produk terhapus"
        title="Riwayat Produk"
        description="Produk yang dihapus disimpan sementara selama 30 hari sebelum dibersihkan permanen."
        icon="history"
        actions={
          <button
            type="button"
            onClick={runCleanup}
            disabled={processingCleanup}
            className="brand-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {processingCleanup ? "Membersihkan..." : "Bersihkan 30 hari"}
          </button>
        }
      />

      <FeatureLoadPanel
        error={coreError}
        loading={coreLoading}
        loadingText="Sinkronisasi riwayat produk..."
        onRetry={refreshProducts}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Produk terhapus" value={String(stats.total)} />
        <MetricCard label="Kurang dari 7 hari" value={String(stats.expiringSoon)} accent="gold" />
        <MetricCard label="Siap dibersihkan" value={String(stats.expired)} accent="danger" />
      </div>

      <Panel className="p-6">
        <div className="brand-scrollbar overflow-x-auto">
          <table className="brand-table">
            <thead>
              <tr>
                <th>Nama Produk</th>
                <th>Tanggal Hapus</th>
                <th>Dihapus Oleh</th>
                <th>Sisa Restore</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {visibleDeletedProducts.length ? (
                visibleDeletedProducts.map((product) => {
                  const daysLeft = getDaysLeft(product.deleted_at);

                  return (
                    <tr key={product.id}>
                      <td>
                        <p className="font-semibold text-slate-950">{product.nama}</p>
                        <p className="text-xs text-slate-500">{product.kode_produk || "-"}</p>
                      </td>
                      <td className="text-slate-600">
                        {product.deleted_at
                          ? formatDateTime(product.deleted_at, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "-"}
                      </td>
                      <td className="text-slate-600">{getDeletedBy(product)}</td>
                      <td>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            daysLeft <= 7
                              ? "bg-[var(--brand-gold)]/18 text-[var(--brand-gold)]"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {daysLeft} hari
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setPendingAction({ type: "restore", product })}
                            className="brand-button-success px-3 py-2"
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingAction({ type: "permanent", product })}
                            className="brand-button-danger min-h-[40px] px-3 py-2"
                          >
                            Delete Permanently
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="5" className="py-10 text-center text-slate-500">
                    Belum ada produk yang dihapus.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {deletedProducts.length > visibleDeletedProducts.length ? (
          <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Menampilkan {visibleDeletedProducts.length} dari {deletedProducts.length} produk terhapus.
            Gunakan pembersihan berkala agar halaman tetap ringan.
          </p>
        ) : null}
      </Panel>

      {pendingAction ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <div className="brand-panel w-full max-w-md p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
              Konfirmasi produk
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
              {pendingAction.type === "restore" ? "Restore produk?" : "Delete permanently?"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {pendingAction.type === "restore"
                ? `${pendingAction.product.nama} akan kembali aktif dan muncul lagi di daftar produk.`
                : `${pendingAction.product.nama} akan dihapus dari recycle bin dan tidak bisa direstore.`}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="brand-button-secondary"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmAction}
                className={
                  pendingAction.type === "restore"
                    ? "brand-button-success"
                    : "brand-button-danger"
                }
              >
                {pendingAction.type === "restore" ? "Restore" : "Delete Permanently"}
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

