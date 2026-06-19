import { useMemo, useState } from "react";
import FeatureLoadPanel from "../components/FeatureLoadPanel";
import PaginationBar from "../components/PaginationBar";
import MetricCard from "../components/app/MetricCard";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { useAuditStorageSummary } from "../hooks/useAuditStorageSummary";
import { usePagedAuditLogs } from "../hooks/usePagedAuditLogs";
import { formatDateInput, formatDateTime, formatPlainNumber } from "../utils/format";
import { toClientMessage } from "../utils/clientMessages";

function createDefaultRange() {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 6);
  return {
    startDate: formatDateInput(startDate),
    endDate: formatDateInput(endDate),
  };
}

function formatJsonPreview(value) {
  const raw = JSON.stringify(value || {});
  if (!raw || raw === "{}") return "-";
  return raw.length > 110 ? `${raw.slice(0, 110)}...` : raw;
}

function formatAuditLabel(value) {
  return String(value || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatStorageSize(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** exponent;
  return `${amount.toLocaleString("id-ID", {
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  })} ${units[exponent]}`;
}

export default function AuditLogPage() {
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState(() => createDefaultRange());
  const auditPage = usePagedAuditLogs({
    search,
    dateRange,
    pageSize: 20,
  });
  const storageSummary = useAuditStorageSummary();

  const summary = useMemo(
    () =>
      auditPage.rows.reduce(
        (acc, row) => {
          acc.total += 1;
          acc.actions.add(row.action);
          acc.tables.add(row.target_table);
          return acc;
        },
        { total: 0, actions: new Set(), tables: new Set() }
      ),
    [auditPage.rows]
  );
  const storageTotals = useMemo(
    () =>
      storageSummary.rows.reduce(
        (acc, row) => {
          acc.bytes += Number(row.total_bytes || 0);
          acc.rows += Number(row.estimated_rows || 0);
          return acc;
        },
        { bytes: 0, rows: 0 }
      ),
    [storageSummary.rows]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kontrol Pemilik"
        title="Riwayat Aktivitas"
        description="Jejak aksi sensitif untuk reset, approval, perubahan stok, retur, dan operasi penting lain."
        icon="clipboard"
        actions={
          <button
            type="button"
            onClick={auditPage.refresh}
            className="brand-button-secondary"
          >
            Refresh
          </button>
        }
      />

      <FeatureLoadPanel
        error={auditPage.error}
        loading={auditPage.loading}
        loadingText="Sinkronisasi riwayat aktivitas..."
        onRetry={auditPage.refresh}
      />

      <Panel className="space-y-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="brand-kicker">Kapasitas data</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
              Kapasitas audit
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Ukuran total mencakup index database agar pertumbuhan riwayat dapat dipantau lebih awal.
            </p>
          </div>
          <button
            type="button"
            onClick={storageSummary.refresh}
            className="brand-button-secondary"
            disabled={storageSummary.loading}
          >
            {storageSummary.loading ? "Memuat..." : "Refresh kapasitas"}
          </button>
        </div>

        {storageSummary.error ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            Monitoring kapasitas audit belum aktif. Terapkan migration retention foundation, lalu refresh halaman.
          </p>
        ) : null}

        {storageSummary.rows.length ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard
                label="Total data"
                value={formatStorageSize(storageTotals.bytes)}
                helper="Audit, aktivitas produk, dan sesi"
              />
              <MetricCard
                label="Estimasi baris"
                value={formatPlainNumber(storageTotals.rows)}
                helper="Statistik ringan, tanpa scan penuh"
                accent="info"
              />
              <MetricCard
                label="Retensi audit"
                value="Dilindungi"
                helper="Audit kritis tidak dihapus otomatis"
                accent="danger"
              />
            </div>

            <div className="brand-scrollbar overflow-x-auto rounded-xl border border-slate-200">
              <table className="brand-table min-w-[880px]">
                <thead>
                  <tr>
                    <th>Sumber data</th>
                    <th>Ukuran total</th>
                    <th>Estimasi baris</th>
                    <th>Data tertua</th>
                    <th>Data terbaru</th>
                  </tr>
                </thead>
                <tbody>
                  {storageSummary.rows.map((row) => (
                    <tr key={row.source}>
                      <td>
                        <p className="font-semibold text-slate-950">
                          {formatAuditLabel(row.source)}
                        </p>
                        <p className="mt-1 max-w-[300px] text-xs text-slate-500">
                          {row.retention_note}
                        </p>
                      </td>
                      <td className="font-semibold text-slate-950">
                        {formatStorageSize(row.total_bytes)}
                      </td>
                      <td>{formatPlainNumber(row.estimated_rows)}</td>
                      <td className="text-slate-600">
                        {formatDateTime(row.oldest_created_at, { dateStyle: "medium" })}
                      </td>
                      <td className="text-slate-600">
                        {formatDateTime(row.newest_created_at, { dateStyle: "medium" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
              Audit kritis tidak dihapus otomatis. Archive atau cleanup hanya boleh diterapkan setelah
              kebijakan retensi dan backup terverifikasi.
            </p>
          </>
        ) : null}
      </Panel>

      <Panel className="grid gap-3 p-5 lg:grid-cols-[1fr_180px_180px_auto]">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="brand-input"
          placeholder="Cari aksi, bagian, peran, alasan, atau kode catatan..."
        />
        <input
          type="date"
          value={dateRange.startDate}
          onChange={(event) =>
            setDateRange((current) => ({ ...current, startDate: event.target.value }))
          }
          className="brand-input"
        />
        <input
          type="date"
          value={dateRange.endDate}
          onChange={(event) =>
            setDateRange((current) => ({ ...current, endDate: event.target.value }))
          }
          className="brand-input"
        />
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setDateRange(createDefaultRange());
          }}
          className="brand-button-secondary"
        >
          Reset
        </button>
      </Panel>

      <div className="grid gap-4 md:grid-cols-3">
        <Panel className="p-4">
          <p className="brand-kicker">Baris halaman ini</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{summary.total}</p>
        </Panel>
        <Panel className="p-4">
          <p className="brand-kicker">Jenis aksi</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{summary.actions.size}</p>
        </Panel>
        <Panel className="p-4">
          <p className="brand-kicker">Bagian data</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{summary.tables.size}</p>
        </Panel>
      </div>

      <Panel className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                Jejak aksi sensitif
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Riwayat dimuat per halaman supaya tetap ringan saat data mulai banyak.
              </p>
            </div>
            {auditPage.loading ? <span className="brand-badge-neutral">Memuat</span> : null}
          </div>
          {auditPage.error ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              {toClientMessage(auditPage.error?.message, "Riwayat aktivitas belum siap ditampilkan. Minta pemilik toko mengecek pengaturan aplikasi.")}
            </p>
          ) : null}
        </div>

        <div className="brand-scrollbar overflow-x-auto">
          <table className="brand-table min-w-[1060px]">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Pengguna</th>
                <th>Aksi</th>
                <th>Bagian</th>
                <th>Alasan</th>
                <th>Perubahan</th>
              </tr>
            </thead>
            <tbody>
              {auditPage.rows.length ? (
                auditPage.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="text-slate-600">
                      {formatDateTime(row.created_at, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td>
                      <p className="font-semibold text-slate-950">{row.actor_role || "-"}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {row.actor_id || "-"}
                      </p>
                    </td>
                    <td>
                      <p className="font-semibold text-slate-950">{formatAuditLabel(row.action)}</p>
                      {row.incident_code ? (
                        <p className="mt-1 text-xs text-rose-600">{row.incident_code}</p>
                      ) : null}
                    </td>
                    <td>
                      <p className="font-semibold text-slate-950">{formatAuditLabel(row.target_table)}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {row.target_id || "-"}
                      </p>
                    </td>
                    <td className="max-w-[220px] text-slate-600">{row.reason || "-"}</td>
                    <td className="max-w-[320px] font-mono text-xs text-slate-500">
                      <p>Sebelum: {formatJsonPreview(row.before_value)}</p>
                      <p className="mt-1">Sesudah: {formatJsonPreview(row.after_value)}</p>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-500">
                    Belum ada aktivitas pada filter ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={auditPage.page}
          pageCount={auditPage.pageCount}
          from={auditPage.from}
          to={auditPage.to}
          count={auditPage.count}
          onPageChange={auditPage.setPage}
        />
      </Panel>
    </div>
  );
}
