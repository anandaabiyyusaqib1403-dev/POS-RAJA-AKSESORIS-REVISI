import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  BadgeDollarSign,
  CheckCircle2,
  Clock3,
  PackageCheck,
  Printer,
  Save,
  Scissors,
  XCircle,
} from "lucide-react";
import CurrencyInput from "../components/CurrencyInput";
import FeatureLoadPanel from "../components/FeatureLoadPanel";
import PinConfirmationModal from "../components/PinConfirmationModal";
import ReturKonsumenForm from "../components/ReturKonsumenForm";
import ReturPage from "../components/ReturPage";
import ReturSupplierForm from "../components/ReturSupplierForm";
import ReturTable from "../components/ReturTable";
import { showNotification } from "../contexts/NotificationContext";
import {
  isPinActionCancelledError,
  usePinConfirmation,
} from "../hooks/usePinConfirmation";
import { useProducts } from "../hooks/useProducts";
import { useTransactions } from "../hooks/useTransactions";
import { getMoneySaveFailureMessage } from "../core/money/moneyRetry";
import {
  endOfDay,
  formatDateInput,
  formatDateTime,
  formatRupiah,
  startOfDay,
} from "../utils/format";
import { usePagedReturnRows } from "../hooks/usePagedReturnRows";
import { printReturnReceipt } from "../utils/print";
import {
  datePresetOptions,
  exportReturnWorkbook,
  getDatePresetLabel,
  getDatePresetRange,
  getReasonLabel,
  getStatusLabel,
  getWarrantyOutcome,
  getWarrantyOutcomeLabel,
  reasonOptions,
  statusOptions,
  warrantyOutcomeOptions,
} from "../features/returns/services/returnReports";

const emptyForm = {
  supplierName: "",
  productId: "",
  quantity: "",
  reason: "rusak",
  condition: "",
  notes: "",
};

const emptySettlement = {
  status: "selesai",
  settlementAmount: "",
  settlementMethod: "",
  settlementNotes: "",
  restock: false,
};

const emptyCustomerForm = {
  transactionId: "",
  transactionItemId: "",
  customerName: "",
  quantity: "",
  claimOutcome: "exchange",
  replacementProductId: "",
  replacementQuantity: "",
  reason: "rusak",
  condition: "",
  refundMethod: "cash",
  notes: "",
};

const statusClassMap = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  diganti_barang: "border-emerald-200 bg-emerald-50 text-emerald-800",
  refund_uang: "border-sky-200 bg-sky-50 text-sky-800",
  potong_tagihan: "border-violet-200 bg-violet-50 text-violet-800",
  ditolak: "border-rose-200 bg-rose-50 text-rose-800",
  selesai: "border-slate-200 bg-slate-100 text-slate-700",
};

const statusIconMap = {
  pending: Clock3,
  diganti_barang: PackageCheck,
  refund_uang: BadgeDollarSign,
  potong_tagihan: Scissors,
  ditolak: XCircle,
  selesai: CheckCircle2,
};

function StatusBadge({ status }) {
  const Icon = statusIconMap[status] || CheckCircle2;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
        statusClassMap[status] || "border-slate-200 bg-slate-100 text-slate-700"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {getStatusLabel(status)}
    </span>
  );
}

function isInDateRange(value, range) {
  const date = new Date(value);
  if (range.startDate && date < startOfDay(range.startDate)) return false;
  if (range.endDate && date > endOfDay(range.endDate)) return false;
  return true;
}

function ReturnReceiptPreview({ row, type }) {
  if (!row) return null;

  const isCustomer = type === "customer";
  const items = Array.isArray(row.items) ? row.items : [];
  const totalValue = isCustomer ? row.total_refund_amount : row.total_estimated_value;
  const warrantyOutcome = isCustomer ? getWarrantyOutcome(row) : "";
  const warrantyOutcomeLabel = isCustomer ? getWarrantyOutcomeLabel(row) : "";

  return (
    <div className="mx-auto w-full max-w-[340px] rounded-lg border border-slate-200 bg-white p-4 font-mono text-[13px] leading-6 text-slate-950 shadow-sm">
      <div className="text-center">
        <p className="text-base font-black tracking-[0.18em]">RAJA AKSESORIS</p>
        <p className="mt-1 text-xs text-slate-600">Jl. Bango Raya No.3</p>
        <p className="text-xs text-slate-600">Jakarta Selatan</p>
        <p className="mt-3 border-y border-dashed border-slate-400 py-2 text-xs font-bold tracking-[0.12em]">
          {isCustomer ? "BUKTI GARANSI KONSUMEN" : "BUKTI RETUR SUPPLIER"}
        </p>
      </div>

      <div className="mt-3 space-y-1 border-b border-dashed border-slate-400 pb-3">
        <div className="flex justify-between gap-3">
          <span>{isCustomer ? "No Klaim" : "No Retur"}</span>
          <span className="text-right font-bold">{row.no_retur}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Tanggal</span>
          <span className="text-right">
            {formatDateTime(row.created_at, { dateStyle: "medium", timeStyle: "short" })}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span>{isCustomer ? "Konsumen" : "Supplier"}</span>
          <span className="text-right font-bold">
            {isCustomer ? row.customer_name || "-" : row.supplier_name || "-"}
          </span>
        </div>
        {isCustomer ? (
          <div className="flex justify-between gap-3">
            <span>Transaksi</span>
            <span className="text-right">{row.transaction_no || "-"}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <span>{isCustomer ? "Hasil Klaim" : "Status"}</span>
          <span className="text-right">{isCustomer ? warrantyOutcomeLabel : getStatusLabel(row.status)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Alasan</span>
          <span className="text-right">{getReasonLabel(row.reason)}</span>
        </div>
      </div>

      <div className="mt-3 space-y-3 border-b border-dashed border-slate-400 pb-3">
        {items.length ? (
          items.map((item, index) => {
            const unitValue = isCustomer ? item.unit_price : item.unit_cost;
            const subtotal = isCustomer ? item.subtotal_refund : item.subtotal_cost;

            return (
              <div key={item.id || `${row.id}-${index}`}>
                <p className="font-bold">
                  {index + 1}. {item.product_name || "Produk"}
                </p>
                <div className="flex justify-between gap-3">
                  <span>
                    {Number(item.quantity || 0)} x {formatRupiah(unitValue)}
                  </span>
                  <span className="text-right font-bold">{formatRupiah(subtotal)}</span>
                </div>
                {item.condition || row.condition ? (
                  <p className="text-xs text-slate-600">Kondisi: {item.condition || row.condition}</p>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="text-slate-500">Belum ada item {isCustomer ? "garansi" : "retur"}.</p>
        )}
      </div>

      <div className="mt-3 space-y-1">
        <div className="flex justify-between gap-3">
          <span>Total QTY</span>
          <span className="font-bold">{row.total_quantity || 0} pcs</span>
        </div>
        <div className="flex justify-between gap-3 text-base font-black">
          <span>{isCustomer ? "TOTAL REFUND" : "ESTIMASI NILAI"}</span>
          <span>{isCustomer && warrantyOutcome !== "refund" ? "-" : formatRupiah(totalValue)}</span>
        </div>
        {isCustomer ? (
          <div className="flex justify-between gap-3">
            <span>Dampak Stok</span>
            <span>{warrantyOutcome === "exchange" ? "Stok pengganti keluar" : "Tidak berubah"}</span>
          </div>
        ) : null}
      </div>

      {row.notes || row.settlement_notes ? (
        <div className="mt-3 border-t border-dashed border-slate-400 pt-3 text-xs text-slate-600">
          <p className="font-bold text-slate-800">Catatan</p>
          <p>{[row.notes, row.settlement_notes].filter(Boolean).join(" | ")}</p>
        </div>
      ) : null}
    </div>
  );
}

export default function SupplierReturnsPage() {
  const location = useLocation();
  const {
    coreError,
    coreLoading,
    accessoryTransactions,
    supplierReturns,
    customerReturns,
    createSupplierReturn,
    refreshReturns,
    updateSupplierReturnStatus,
    createWarrantyClaim,
  } = useTransactions();
  const { products } = useProducts();
  const {
    isPinModalOpen,
    closePinModal,
    executeSensitiveAction,
    executeConfirmedAction,
    actionDescription,
  } = usePinConfirmation();
  const [form, setForm] = useState(emptyForm);
  const [activeTab, setActiveTab] = useState("supplier");
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm);
  const [statusFilter, setStatusFilter] = useState("semua");
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState("all");
  const [dateRange, setDateRange] = useState({
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    const requestedStatus = new URLSearchParams(location.search).get("status");
    if (statusOptions.some((option) => option.value === requestedStatus)) {
      setStatusFilter(requestedStatus);
    }
  }, [location.search]);
  const [submitting, setSubmitting] = useState(false);
  const submissionRef = useRef(false);
  const [settlementTarget, setSettlementTarget] = useState(null);
  const [settlementForm, setSettlementForm] = useState(emptySettlement);
  const [previewTarget, setPreviewTarget] = useState(null);
  const supplierReturnPage = usePagedReturnRows({
    type: "supplier",
    search,
    dateRange,
    statusFilter,
    pageSize: 10,
  });
  const customerReturnPage = usePagedReturnRows({
    type: "customer",
    search,
    dateRange,
    statusFilter,
    pageSize: 10,
  });

  const activeProducts = useMemo(
    () =>
      products
        .filter((product) => product.status !== "deleted" && product.aktif !== false)
        .sort((left, right) => left.nama.localeCompare(right.nama, "id")),
    [products]
  );

  const selectedProduct = useMemo(
    () => activeProducts.find((product) => product.id === form.productId) || null,
    [activeProducts, form.productId]
  );

  const selectedTransaction = useMemo(
    () => accessoryTransactions.find((transaction) => transaction.id === customerForm.transactionId) || null,
    [accessoryTransactions, customerForm.transactionId]
  );

  const selectedTransactionItem = useMemo(
    () =>
      selectedTransaction?.items?.find((item) => item.id === customerForm.transactionItemId) || null,
    [customerForm.transactionItemId, selectedTransaction]
  );

  const selectedReplacementProduct = useMemo(
    () => activeProducts.find((product) => product.id === customerForm.replacementProductId) || null,
    [activeProducts, customerForm.replacementProductId]
  );

  const customerEstimatedRefund =
    selectedTransactionItem && Number(customerForm.quantity || 0) > 0
      ? Number(customerForm.quantity || 0) * Number(selectedTransactionItem.harga_satuan || 0)
      : 0;

  const estimatedValue =
    selectedProduct && Number(form.quantity || 0) > 0
      ? Number(form.quantity || 0) * Number(selectedProduct.harga_beli || 0)
      : 0;

  const fallbackFilteredReturns = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return supplierReturns.filter((row) => {
      const matchesStatus = statusFilter === "semua" ? true : row.status === statusFilter;
      const matchesDate = isInDateRange(row.created_at, dateRange);
      const matchesSearch = keyword
        ? [
            row.no_retur,
            row.supplier_name,
            row.reason,
            ...(row.items || []).map((item) => item.product_name),
          ]
            .join(" ")
            .toLowerCase()
            .includes(keyword)
        : true;

      return matchesStatus && matchesDate && matchesSearch;
    });
  }, [dateRange, search, statusFilter, supplierReturns]);

  const fallbackFilteredCustomerReturns = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return customerReturns.filter((row) => {
      const matchesDate = isInDateRange(row.created_at, dateRange);
      const matchesSearch = keyword
        ? [
            row.no_retur,
            row.transaction_no,
            row.customer_name,
            row.reason,
            ...(row.items || []).map((item) => item.product_name),
          ]
            .join(" ")
            .toLowerCase()
            .includes(keyword)
        : true;

      return matchesDate && matchesSearch;
    });
  }, [customerReturns, dateRange, search]);
  const filteredReturns = supplierReturnPage.error
    ? fallbackFilteredReturns.slice(0, 10)
    : supplierReturnPage.rows;
  const filteredCustomerReturns = customerReturnPage.error
    ? fallbackFilteredCustomerReturns.slice(0, 10)
    : customerReturnPage.rows;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submissionRef.current) return;
    submissionRef.current = true;
    setSubmitting(true);

    try {
      await executeSensitiveAction(
        async () => {
          await createSupplierReturn({
            supplierName: form.supplierName,
            reason: form.reason,
            condition: form.condition,
            notes: form.notes,
            items: [
              {
                productId: form.productId,
                quantity: form.quantity,
                unitCost: selectedProduct?.harga_beli || 0,
                condition: form.condition,
              },
            ],
          });
        },
        "SUPPLIER_RETURN.CREATE"
      );
      showNotification("success", "Retur supplier sudah dibuat. Stok barang ikut berkurang.");
      setForm(emptyForm);
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification(
        "error",
        getMoneySaveFailureMessage(error, "Gagal membuat retur supplier.")
      );
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  };

  const handleCustomerSubmit = async (event) => {
    event.preventDefault();
    if (submissionRef.current) return;
    submissionRef.current = true;
    setSubmitting(true);

    try {
      await executeSensitiveAction(
        async () => {
          const claimOutcome = customerForm.claimOutcome || "exchange";

          await createWarrantyClaim({
            transactionId: customerForm.transactionId,
            customerName: customerForm.customerName,
            reason: customerForm.reason,
            condition: customerForm.condition,
            notes: customerForm.notes,
            claimOutcome,
            refundMethod: claimOutcome === "refund" ? customerForm.refundMethod : "",
            replacementProductId:
              claimOutcome === "exchange" ? customerForm.replacementProductId : "",
            replacementQuantity:
              claimOutcome === "exchange" ? customerForm.replacementQuantity : "",
            items: [
              {
                transactionItemId: customerForm.transactionItemId,
                quantity: customerForm.quantity,
                unitPrice: selectedTransactionItem?.harga_satuan || 0,
                condition: customerForm.condition,
              },
            ],
          });
        },
        "CUSTOMER_RETURN.CREATE"
      );
      showNotification("success", "Klaim garansi konsumen sudah disimpan.");
      setCustomerForm(emptyCustomerForm);
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification(
        "error",
        getMoneySaveFailureMessage(error, "Gagal membuat klaim garansi.")
      );
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  };

  const openSettlement = (row) => {
    setSettlementTarget(row);
    setSettlementForm({
      ...emptySettlement,
      settlementAmount: String(row.total_estimated_value || ""),
      restock: ["diganti_barang", "ditolak"].includes(row.status),
    });
  };

  const handleSettlementSubmit = async (event) => {
    event.preventDefault();
    if (!settlementTarget) return;

    try {
      await executeSensitiveAction(
        async () => {
          await updateSupplierReturnStatus({
            id: settlementTarget.id,
            status: settlementForm.status,
            settlementAmount: settlementForm.settlementAmount,
            settlementMethod: settlementForm.settlementMethod,
            settlementNotes: settlementForm.settlementNotes,
            restock: ["diganti_barang", "ditolak"].includes(settlementForm.status)
              ? settlementForm.restock
              : undefined,
          });
        },
        "SUPPLIER_RETURN.RESOLVE"
      );
      showNotification("success", "Retur supplier sudah diproses.");
      setSettlementTarget(null);
      setSettlementForm(emptySettlement);
    } catch (error) {
      if (isPinActionCancelledError(error)) return;
      showNotification("error", error.message || "Gagal memproses retur supplier.");
    }
  };

  const handlePrintReturn = (row, type) => {
    const didPrint = printReturnReceipt(row, type);

    if (!didPrint) {
      showNotification("warning", "Jendela cetak diblokir browser. Izinkan popup, lalu tekan Cetak lagi.");
      return;
    }

    showNotification(
      "success",
      `Jendela cetak bukti ${type === "customer" ? "garansi" : "retur"} sudah dibuka.`
    );
  };

  const openReturnPreview = (row, type) => {
    setPreviewTarget({ row, type });
  };

  const closeReturnPreview = () => {
    setPreviewTarget(null);
  };

  const printPreviewTarget = () => {
    if (!previewTarget) return;
    handlePrintReturn(previewTarget.row, previewTarget.type);
  };

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    setDateRange(getDatePresetRange(preset));
  };

  const updateDateRange = (key, value) => {
    setDatePreset("custom");
    setDateRange((current) => ({ ...current, [key]: value }));
  };

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("semua");
    applyDatePreset("all");
  };

  const handleSearchKeyDown = (event) => {
    if (event.key !== "Enter") return;

    const keyword = search.trim().toLowerCase();
    if (!keyword) return;

    const sourceRows = activeTab === "supplier" ? filteredReturns : filteredCustomerReturns;
    const exactMatch = sourceRows.find((row) => row.no_retur?.toLowerCase() === keyword);
    if (!exactMatch) return;

    event.preventDefault();
    openReturnPreview(exactMatch, activeTab === "supplier" ? "supplier" : "customer");
  };

  const exportReturns = async () => {
    const fileDate = formatDateInput(new Date());
    const periodLabel = getDatePresetLabel(datePreset, dateRange)
      .replace(/\s+/g, "_")
      .replace(/[^\w-]/g, "");

    await exportReturnWorkbook({
      supplierRows: filteredReturns,
      customerRows: filteredCustomerReturns,
      fileName: `Laporan_Retur_Garansi_Raja_Aksesoris_${periodLabel}_${fileDate}.xlsx`,
    });
    showNotification("success", "Laporan retur dan garansi Excel berhasil dibuat.");
  };

  return (
    <ReturPage
      tab={activeTab}
      onTabChange={setActiveTab}
      counts={{
        supplier: supplierReturnPage.error
          ? supplierReturns.length
          : Math.max(supplierReturnPage.count || 0, filteredReturns.length),
        konsumen: customerReturnPage.error
          ? customerReturns.length
          : Math.max(customerReturnPage.count || 0, filteredCustomerReturns.length),
      }}
    >
      {activeTab === "supplier" ? (
        <div className="space-y-6">
          <FeatureLoadPanel
            error={coreError || supplierReturnPage.error}
            loading={coreLoading || supplierReturnPage.loading}
            loadingText="Sinkronisasi retur supplier..."
            onRetry={supplierReturnPage.error ? supplierReturnPage.refresh : refreshReturns}
          />
          <ReturSupplierForm
            form={form}
            setForm={setForm}
            products={activeProducts}
            selectedProduct={selectedProduct}
            reasonOptions={reasonOptions}
            estimatedValue={estimatedValue}
            formatRupiah={formatRupiah}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
          <ReturTable
            type="supplier"
            rows={filteredReturns}
            search={search}
            setSearch={setSearch}
            datePreset={datePreset}
            datePresetOptions={datePresetOptions}
            applyDatePreset={applyDatePreset}
            dateRange={dateRange}
            updateDateRange={updateDateRange}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            statusOptions={statusOptions}
            resetFilters={resetFilters}
            onSearchKeyDown={handleSearchKeyDown}
            onExport={exportReturns}
            onPreview={openReturnPreview}
            onSettlement={openSettlement}
            onCreate={() => setActiveTab("supplier")}
            formatRupiah={formatRupiah}
            formatDateTime={formatDateTime}
            getReasonLabel={getReasonLabel}
            StatusBadge={StatusBadge}
            pagination={
              supplierReturnPage.error
                ? null
                : {
                    page: supplierReturnPage.page,
                    pageCount: supplierReturnPage.pageCount,
                    from: supplierReturnPage.from,
                    to: supplierReturnPage.to,
                    count: supplierReturnPage.count,
                    setPage: supplierReturnPage.setPage,
                  }
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          <FeatureLoadPanel
            error={coreError || customerReturnPage.error}
            loading={coreLoading || customerReturnPage.loading}
            loadingText="Sinkronisasi klaim garansi..."
            onRetry={customerReturnPage.error ? customerReturnPage.refresh : refreshReturns}
          />
          <ReturKonsumenForm
            form={customerForm}
            setForm={setCustomerForm}
            transactions={accessoryTransactions}
            products={activeProducts}
            selectedTransaction={selectedTransaction}
            selectedTransactionItem={selectedTransactionItem}
            selectedReplacementProduct={selectedReplacementProduct}
            reasonOptions={reasonOptions}
            outcomeOptions={warrantyOutcomeOptions}
            estimatedRefund={customerEstimatedRefund}
            formatRupiah={formatRupiah}
            submitting={submitting}
            onSubmit={handleCustomerSubmit}
          />
          <ReturTable
            type="customer"
            rows={filteredCustomerReturns}
            search={search}
            setSearch={setSearch}
            datePreset={datePreset}
            datePresetOptions={datePresetOptions}
            applyDatePreset={applyDatePreset}
            dateRange={dateRange}
            updateDateRange={updateDateRange}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            statusOptions={statusOptions}
            resetFilters={resetFilters}
            onSearchKeyDown={handleSearchKeyDown}
            onExport={exportReturns}
            onPreview={openReturnPreview}
            onSettlement={openSettlement}
            onCreate={() => setActiveTab("konsumen")}
            formatRupiah={formatRupiah}
            formatDateTime={formatDateTime}
            getReasonLabel={getReasonLabel}
            StatusBadge={StatusBadge}
            pagination={
              customerReturnPage.error
                ? null
                : {
                    page: customerReturnPage.page,
                    pageCount: customerReturnPage.pageCount,
                    from: customerReturnPage.from,
                    to: customerReturnPage.to,
                    count: customerReturnPage.count,
                    setPage: customerReturnPage.setPage,
                  }
            }
          />
        </div>
      )}

      {settlementTarget ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <form onSubmit={handleSettlementSubmit} className="brand-panel w-full max-w-lg p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
              Proses retur
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
              {settlementTarget.no_retur}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {settlementTarget.supplier_name} - {formatRupiah(settlementTarget.total_estimated_value)}
            </p>

            <div className="mt-5 space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                Status penyelesaian
                <select
                  value={settlementForm.status}
                  onChange={(event) =>
                    setSettlementForm((current) => ({
                      ...current,
                      status: event.target.value,
                      restock: ["diganti_barang", "ditolak"].includes(event.target.value),
                    }))
                  }
                  className="input mt-2"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {["diganti_barang", "ditolak"].includes(settlementForm.status) ? (
                <label className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <input
                    type="checkbox"
                    checked={settlementForm.restock}
                    onChange={(event) =>
                      setSettlementForm((current) => ({ ...current, restock: event.target.checked }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                  <span>
                    <span className="block font-semibold">Barang masuk kembali ke stok</span>
                    <span className="mt-1 block text-xs font-medium leading-5">
                      Bila dipilih, stok produk otomatis bertambah setelah penyelesaian disimpan.
                    </span>
                  </span>
                </label>
              ) : null}

              {["refund_uang", "potong_tagihan"].includes(settlementForm.status) ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Nominal
                    <CurrencyInput
                      value={settlementForm.settlementAmount}
                      onChange={(value) =>
                        setSettlementForm((current) => ({ ...current, settlementAmount: value }))
                      }
                      className="input mt-2"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-slate-700">
                    Metode
                    <input
                      value={settlementForm.settlementMethod}
                      onChange={(event) =>
                        setSettlementForm((current) => ({ ...current, settlementMethod: event.target.value }))
                      }
                      className="input mt-2"
                      placeholder="Cash, BCA, potong nota"
                    />
                  </label>
                </div>
              ) : null}

              <label className="block text-sm font-semibold text-slate-700">
                Catatan penyelesaian
                <textarea
                  value={settlementForm.settlementNotes}
                  onChange={(event) =>
                    setSettlementForm((current) => ({ ...current, settlementNotes: event.target.value }))
                  }
                  className="input mt-2 min-h-[96px] resize-y py-3"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSettlementTarget(null)}
                className="brand-button-secondary gap-2"
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Batal
              </button>
              <button type="submit" className="brand-button-primary gap-2">
                <Save className="h-4 w-4" aria-hidden="true" />
                Simpan Status
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {previewTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div className="brand-panel flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden shadow-2xl">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
                  Preview bukti {previewTarget.type === "customer" ? "garansi" : "retur"}
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
                  {previewTarget.row.no_retur}
                </h2>
              </div>
              {previewTarget.type === "customer" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-800">
                  {getWarrantyOutcomeLabel(previewTarget.row)}
                </span>
              ) : (
                <StatusBadge status={previewTarget.row.status} />
              )}
            </div>

            <div className="brand-scrollbar overflow-y-auto bg-slate-50 px-5 py-6">
              <ReturnReceiptPreview row={previewTarget.row} type={previewTarget.type} />
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-6 py-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeReturnPreview} className="brand-button-secondary gap-2">
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Tutup
              </button>
              <button type="button" onClick={printPreviewTarget} className="brand-button-primary gap-2">
                <Printer className="h-4 w-4" aria-hidden="true" />
                Cetak Bukti
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
    </ReturPage>
  );
}

