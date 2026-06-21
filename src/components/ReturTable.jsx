import {
  CheckCircle2,
  ChevronDown,
  Eye,
  FileDown,
  Filter,
  MoreHorizontal,
  PackageCheck,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import PaginationBar from "./PaginationBar";
import Panel from "./app/Panel";
import {
  getWarrantyOutcome,
  getWarrantyOutcomeLabel,
} from "../features/returns/services/returnReports";

export default function ReturTable({
  type,
  rows,
  search,
  setSearch,
  datePreset,
  datePresetOptions,
  applyDatePreset,
  dateRange,
  updateDateRange,
  statusFilter,
  setStatusFilter,
  statusOptions,
  resetFilters,
  onSearchKeyDown,
  onExport,
  onPreview,
  onSettlement,
  onCreate,
  formatRupiah,
  formatDateTime,
  getReasonLabel,
  StatusBadge,
  pagination,
}) {
  const isCustomer = type === "customer";
  const documentLabel = isCustomer ? "Garansi Konsumen" : "Retur Supplier";
  const matchingCount = Math.max(pagination?.count || 0, rows.length);
  const activeFilters = [
    search.trim()
      ? {
          key: "search",
          label: `Pencarian: ${search.trim()}`,
          clear: () => setSearch(""),
        }
      : null,
    !isCustomer && statusFilter !== "semua"
      ? {
          key: "status",
          label: `Status: ${statusOptions.find((option) => option.value === statusFilter)?.label || statusFilter}`,
          clear: () => setStatusFilter("semua"),
        }
      : null,
    datePreset !== "all"
      ? {
          key: "period",
          label:
            datePreset === "custom"
              ? `Tanggal: ${dateRange.startDate || "..."} - ${dateRange.endDate || "..."}`
              : `Periode: ${datePresetOptions.find((option) => option.value === datePreset)?.label || datePreset}`,
          clear: () => applyDatePreset("all"),
        }
      : null,
  ].filter(Boolean);
  const runActionAndCloseMenu = (event, action) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
    action();
  };

  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-xl font-bold tracking-tight text-slate-950">
                Riwayat {documentLabel}
              </h2>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                {matchingCount} catatan
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Scan nomor {isCustomer ? "klaim" : "retur"}, pantau status, atau buka bukti transaksi dengan cepat.
            </p>
          </div>
          <button type="button" onClick={onExport} className="brand-button-success w-full gap-2 sm:w-auto">
            <FileDown className="h-4 w-4" aria-hidden="true" />
            Export
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filter Riwayat
          </div>
          <div className="flex flex-wrap gap-2.5">
            {datePresetOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => applyDatePreset(option.value)}
                className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                  datePreset === option.value
                    ? "bg-slate-950 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div
            className={`mt-3 grid gap-3 md:grid-cols-2 ${
              isCustomer
                ? "xl:grid-cols-[minmax(240px,1.4fr)_repeat(2,minmax(145px,0.75fr))_auto]"
                : "xl:grid-cols-[minmax(220px,1.4fr)_minmax(160px,0.8fr)_repeat(2,minmax(145px,0.7fr))_auto]"
            }`}
          >
            <div className="relative min-w-0">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={onSearchKeyDown}
                className="input pl-9"
                placeholder={`Scan / cari no ${isCustomer ? "klaim" : "retur"}`}
              />
            </div>
            {!isCustomer ? (
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="input min-w-0"
              >
                <option value="semua">Semua status</option>
                <option value="pending">Pending</option>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(event) => updateDateRange("startDate", event.target.value)}
              className="input min-w-0"
            />
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(event) => updateDateRange("endDate", event.target.value)}
              className="input min-w-0"
            />
            <button
              type="button"
              onClick={resetFilters}
              className="brand-button-secondary gap-2 whitespace-nowrap md:col-span-2 xl:col-span-1"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset
            </button>
          </div>
          {activeFilters.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
              <span className="text-xs font-semibold text-slate-500">Aktif:</span>
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={filter.clear}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-gold)]/22 bg-[var(--brand-gold)]/10 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-[var(--brand-gold)]/16"
                  title="Hapus filter ini"
                >
                  {filter.label}
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-4 border-t border-slate-200 pt-4 text-xs text-slate-500">
              Menampilkan semua {isCustomer ? "garansi" : "retur"}. Pilih periode atau status untuk mempersempit arsip.
            </p>
          )}
        </div>
      </div>

      <div className="brand-scrollbar mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="brand-table min-w-[920px]">
          <thead>
            <tr>
              <th>{isCustomer ? "No Klaim" : "No Retur"}</th>
              <th>{isCustomer ? "Transaksi" : "Supplier"}</th>
              {isCustomer ? <th>Konsumen</th> : null}
              <th>Produk</th>
              {!isCustomer ? <th>Alasan</th> : null}
              <th>{isCustomer ? "Nilai Refund" : "Nilai"}</th>
              <th>{isCustomer ? "Hasil Klaim" : "Status"}</th>
              <th className="brand-table-action-cell text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => {
                const firstItem = row.items?.[0];
                const warrantyOutcome = isCustomer ? getWarrantyOutcome(row) : "";
                const warrantyOutcomeLabel = isCustomer ? getWarrantyOutcomeLabel(row) : "";

                return (
                  <tr key={row.id} className="group transition-colors hover:bg-amber-50/40">
                    <td>
                      <p className="font-bold text-slate-950">{row.no_retur}</p>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(row.created_at, { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </td>
                    <td className="text-slate-700">
                      {isCustomer ? row.transaction_no || "-" : row.supplier_name}
                    </td>
                    {isCustomer ? <td className="text-slate-700">{row.customer_name || "-"}</td> : null}
                    <td>
                      <p className="font-semibold text-slate-950">{firstItem?.product_name || "-"}</p>
                      <p className="text-xs text-slate-500">
                        {row.total_quantity} pcs
                        {!isCustomer && row.items?.length > 1 ? `, ${row.items.length} item` : ""}
                      </p>
                    </td>
                    {!isCustomer ? <td className="text-slate-600">{getReasonLabel(row.reason)}</td> : null}
                    <td className="font-semibold text-slate-950">
                      {isCustomer && warrantyOutcome !== "refund"
                        ? "-"
                        : formatRupiah(isCustomer ? row.total_refund_amount : row.total_estimated_value)}
                    </td>
                    <td>
                      {isCustomer ? (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                            warrantyOutcome === "exchange"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : warrantyOutcome === "rejected"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-sky-200 bg-sky-50 text-sky-700"
                          }`}
                        >
                          <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          {warrantyOutcomeLabel}
                        </span>
                      ) : (
                        <StatusBadge status={row.status} />
                      )}
                    </td>
                    <td className="brand-table-action-cell">
                      <details className="relative ml-auto w-fit">
                        <summary className="inline-flex min-h-[38px] cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-[var(--brand-gold)]/26 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          Aksi
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </summary>
                        <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
                          <button
                            type="button"
                            onClick={(event) =>
                              runActionAndCloseMenu(event, () =>
                                onPreview(row, isCustomer ? "customer" : "supplier")
                              )
                            }
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                            Preview bukti
                          </button>
                          {!isCustomer && row.status === "pending" ? (
                            <button
                              type="button"
                              onClick={(event) => runActionAndCloseMenu(event, () => onSettlement(row))}
                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                              Proses retur
                            </button>
                          ) : null}
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-14 text-center text-slate-500">
                  <div className="mx-auto flex max-w-md flex-col items-center">
                    <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-gold)]/12 text-[var(--brand-gold-strong)]">
                      <PackageCheck className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <p className="font-display text-lg font-bold text-slate-950">
                      Belum ada {isCustomer ? "klaim garansi" : "retur supplier"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {activeFilters.length
                        ? "Tidak ada catatan yang cocok dengan filter aktif. Reset filter atau catat dokumen baru."
                        : `${isCustomer ? "Klaim garansi" : "Retur supplier"} baru akan muncul di sini lengkap dengan nilai dan status operasionalnya.`}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      <button type="button" onClick={resetFilters} className="brand-button-secondary gap-2">
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Reset Filter
                      </button>
                      <button type="button" onClick={onCreate} className="brand-button-primary gap-2">
                        <PackageCheck className="h-4 w-4" aria-hidden="true" />
                        {isCustomer ? "Buat Klaim Garansi" : "Buat Retur Supplier"}
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pagination ? (
        <PaginationBar
          page={pagination.page}
          pageCount={pagination.pageCount}
          from={pagination.from}
          to={pagination.to}
          count={pagination.count}
          onPageChange={pagination.setPage}
        />
      ) : null}
    </Panel>
  );
}
