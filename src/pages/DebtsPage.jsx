import { useEffect, useMemo, useState } from "react";
import MetricCard from "../components/app/MetricCard";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { showNotification } from "../contexts/NotificationContext";
import { exportWorkbook } from "../utils/excelExport";
import { formatDateInput, formatDateTime, formatRupiah } from "../utils/format";

const STORAGE_KEY = "raja-debts-records-v1";

const directionOptions = [
  { value: "piutang", label: "Piutang pelanggan" },
  { value: "hutang", label: "Hutang supplier" },
];

const categoryOptions = [
  { value: "transaksi", label: "Transaksi" },
  { value: "restock", label: "Restock" },
  { value: "operasional", label: "Operasional" },
  { value: "pinjaman", label: "Pinjaman" },
  { value: "lainnya", label: "Lainnya" },
];

const statusFilterOptions = [
  { value: "semua", label: "Semua status" },
  { value: "belum_lunas", label: "Belum bayar" },
  { value: "cicil", label: "Cicil" },
  { value: "lunas", label: "Lunas" },
  { value: "jatuh_tempo", label: "Jatuh tempo <= 7 hari" },
  { value: "lewat_tempo", label: "Lewat tempo" },
];

const directionFilterOptions = [
  { value: "semua", label: "Semua jenis" },
  { value: "piutang", label: "Piutang" },
  { value: "hutang", label: "Hutang" },
];

const quickAmountOptions = [50000, 100000, 250000, 500000, 1000000];
const quickDueOptions = [7, 14, 30];

function createInitialForm() {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);

  return {
    direction: "piutang",
    partyName: "",
    category: "transaksi",
    totalAmount: "",
    initialPaidAmount: "0",
    dueDate: formatDateInput(dueDate),
    reference: "",
    note: "",
  };
}

function createInitialPaymentForm(amount = "") {
  return {
    amount,
    note: "",
  };
}

function toStartOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatPlainNumber(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

function getRemainingAmount(record) {
  return Math.max(0, Number(record.totalAmount || 0) - Number(record.paidAmount || 0));
}

function getPaymentStatus(record) {
  const remaining = getRemainingAmount(record);

  if (remaining <= 0) {
    return {
      value: "lunas",
      label: "Lunas",
      className: "bg-emerald-100 text-emerald-700",
    };
  }

  if (Number(record.paidAmount || 0) > 0) {
    return {
      value: "cicil",
      label: "Cicil",
      className: "bg-[var(--brand-gold)]/16 text-[var(--brand-gold)]",
    };
  }

  return {
    value: "belum_lunas",
    label: "Belum bayar",
    className: "bg-slate-100 text-slate-600",
  };
}

function getDueStatus(record) {
  const remaining = getRemainingAmount(record);
  if (remaining <= 0) {
    return {
      value: "aman",
      label: "Selesai",
      className: "bg-emerald-100 text-emerald-700",
      priority: 3,
    };
  }

  if (!record.dueDate) {
    return {
      value: "tanpa_tempo",
      label: "Tanpa tempo",
      className: "bg-slate-100 text-slate-600",
      priority: 2,
    };
  }

  const today = toStartOfDay(new Date());
  const dueDate = toStartOfDay(record.dueDate);
  const diffDays = Math.round((dueDate - today) / 86400000);

  if (diffDays < 0) {
    return {
      value: "lewat_tempo",
      label: `Lewat ${Math.abs(diffDays)} hari`,
      className: "bg-rose-100 text-rose-700",
      priority: 0,
    };
  }

  if (diffDays <= 7) {
    return {
      value: "jatuh_tempo",
      label: diffDays === 0 ? "Tempo hari ini" : `${diffDays} hari lagi`,
      className: "bg-amber-100 text-amber-700",
      priority: 1,
    };
  }

  return {
    value: "aman",
    label: "Masih aman",
    className: "bg-sky-100 text-sky-700",
    priority: 2,
  };
}

function normalizePayment(payment) {
  return {
    id: payment.id || crypto.randomUUID(),
    amount: Math.max(0, Number(payment.amount || 0)),
    note: String(payment.note || "").trim(),
    createdAt: payment.createdAt || new Date().toISOString(),
  };
}

function normalizeRecord(record) {
  const totalAmount = Math.max(0, Number(record.totalAmount || 0));
  const paidAmount = Math.min(totalAmount, Math.max(0, Number(record.paidAmount || 0)));
  const payments = Array.isArray(record.payments)
    ? record.payments
        .map(normalizePayment)
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    : [];

  return {
    id: record.id || crypto.randomUUID(),
    direction: record.direction === "hutang" ? "hutang" : "piutang",
    partyName: String(record.partyName || "").trim(),
    category: String(record.category || "lainnya").trim() || "lainnya",
    totalAmount,
    paidAmount,
    dueDate: record.dueDate || "",
    reference: String(record.reference || "").trim(),
    note: String(record.note || "").trim(),
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
    payments,
  };
}

function loadRecords() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeRecord) : [];
  } catch {
    return [];
  }
}

function persistRecords(records) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function createRecordSearchText(record) {
  return [
    record.direction,
    record.partyName,
    record.category,
    record.reference,
    record.note,
    ...record.payments.map((payment) => payment.note),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sortRecords(records) {
  return [...records].sort((left, right) => {
    const dueCompare = getDueStatus(left).priority - getDueStatus(right).priority;
    if (dueCompare !== 0) return dueCompare;

    const updatedCompare = new Date(right.updatedAt) - new Date(left.updatedAt);
    if (updatedCompare !== 0) return updatedCompare;

    return new Date(right.createdAt) - new Date(left.createdAt);
  });
}

function buildPaymentExportRows(records) {
  return records.flatMap((record) =>
    record.payments.map((payment) => ({
      partyName: record.partyName,
      direction: record.direction === "piutang" ? "Piutang" : "Hutang",
      category: record.category,
      reference: record.reference || "-",
      paidAt: formatDateTime(payment.createdAt, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      amount: payment.amount,
      note: payment.note || "-",
    }))
  );
}

function DetailInfo({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

export default function DebtsPage() {
  const [records, setRecords] = useState(loadRecords);
  const [form, setForm] = useState(createInitialForm);
  const [paymentForm, setPaymentForm] = useState(createInitialPaymentForm);
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState("semua");
  const [statusFilter, setStatusFilter] = useState("semua");
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    persistRecords(records);
  }, [records]);

  const filteredRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return sortRecords(records).filter((record) => {
      const paymentStatus = getPaymentStatus(record);
      const dueStatus = getDueStatus(record);
      const matchesSearch = keyword ? createRecordSearchText(record).includes(keyword) : true;
      const matchesDirection =
        directionFilter === "semua" ? true : record.direction === directionFilter;
      const matchesStatus =
        statusFilter === "semua"
          ? true
          : [paymentStatus.value, dueStatus.value].includes(statusFilter);

      return matchesSearch && matchesDirection && matchesStatus;
    });
  }, [directionFilter, records, search, statusFilter]);

  const selectedRecord = useMemo(
    () => filteredRecords.find((record) => record.id === selectedId) || null,
    [filteredRecords, selectedId]
  );

  useEffect(() => {
    if (!filteredRecords.length) {
      setSelectedId(null);
      return;
    }

    if (!filteredRecords.some((record) => record.id === selectedId)) {
      setSelectedId(filteredRecords[0].id);
    }
  }, [filteredRecords, selectedId]);

  useEffect(() => {
    setPaymentForm(createInitialPaymentForm());
  }, [selectedId]);

  const summary = useMemo(
    () =>
      records.reduce(
        (acc, record) => {
          const remaining = getRemainingAmount(record);
          const dueStatus = getDueStatus(record);

          if (record.direction === "piutang") {
            acc.totalPiutang += remaining;
          } else {
            acc.totalHutang += remaining;
          }

          if (dueStatus.value === "jatuh_tempo") {
            acc.jatuhTempo += remaining;
          }

          if (dueStatus.value === "lewat_tempo") {
            acc.lewatTempo += remaining;
            acc.lewatTempoCount += 1;
          }

          acc.totalTerbayar += Number(record.paidAmount || 0);
          return acc;
        },
        {
          totalPiutang: 0,
          totalHutang: 0,
          jatuhTempo: 0,
          lewatTempo: 0,
          lewatTempoCount: 0,
          totalTerbayar: 0,
        }
      ),
    [records]
  );

  const reminderRecords = useMemo(
    () =>
      sortRecords(records)
        .filter((record) => getRemainingAmount(record) > 0)
        .slice(0, 4),
    [records]
  );

  const selectedRemaining = selectedRecord ? getRemainingAmount(selectedRecord) : 0;

  const handleExportExcel = () => {
    const exportedAt = new Date();
    const paymentRows = buildPaymentExportRows(filteredRecords);

    exportWorkbook({
      fileName: `hutang-piutang-${formatDateInput(exportedAt)}.xlsx`,
      exportedAt,
      props: {
        Title: "Laporan hutang piutang Raja Aksesoris",
        Subject: "Laporan hutang piutang",
      },
      sheets: [
        {
          name: "Hutang Piutang",
          title: "Laporan Hutang Piutang Raja Aksesoris",
          metadataRows: [
            ["Total data tampil", filteredRecords.length],
            ["Total piutang aktif", formatRupiah(summary.totalPiutang)],
            ["Total hutang aktif", formatRupiah(summary.totalHutang)],
            ["Jatuh tempo dekat", formatRupiah(summary.jatuhTempo)],
            ["Lewat tempo", formatRupiah(summary.lewatTempo)],
          ],
          columns: [
            { key: "jenis", header: "Jenis", type: "text", minWidth: 12, maxWidth: 14 },
            { key: "pihak", header: "Pihak", type: "text", minWidth: 22, maxWidth: 28 },
            { key: "kategori", header: "Kategori", type: "text", minWidth: 14, maxWidth: 16 },
            {
              key: "statusPembayaran",
              header: "Status Pembayaran",
              type: "text",
              minWidth: 18,
              maxWidth: 20,
            },
            {
              key: "statusTempo",
              header: "Status Tempo",
              type: "text",
              minWidth: 18,
              maxWidth: 20,
            },
            { key: "tempo", header: "Tempo", type: "text", minWidth: 14, maxWidth: 16 },
            { key: "referensi", header: "Referensi", type: "text", minWidth: 18, maxWidth: 24 },
            { key: "total", header: "Total", type: "currency", minWidth: 16, maxWidth: 18 },
            {
              key: "terbayar",
              header: "Terbayar",
              type: "currency",
              minWidth: 16,
              maxWidth: 18,
            },
            { key: "sisa", header: "Sisa", type: "currency", minWidth: 16, maxWidth: 18 },
            { key: "catatan", header: "Catatan", type: "text", minWidth: 22, maxWidth: 32 },
          ],
          rows: filteredRecords.map((record) => ({
            jenis: record.direction === "piutang" ? "Piutang" : "Hutang",
            pihak: record.partyName,
            kategori: record.category,
            statusPembayaran: getPaymentStatus(record).label,
            statusTempo: getDueStatus(record).label,
            tempo: record.dueDate || "-",
            referensi: record.reference || "-",
            total: record.totalAmount,
            terbayar: record.paidAmount,
            sisa: getRemainingAmount(record),
            catatan: record.note || "-",
          })),
        },
        {
          name: "Riwayat Pembayaran",
          title: "Riwayat Pembayaran Hutang Piutang",
          metadataRows: [
            ["Total pembayaran", paymentRows.length],
            ["Data sumber", filteredRecords.length],
          ],
          columns: [
            { key: "pihak", header: "Pihak", type: "text", minWidth: 22, maxWidth: 28 },
            { key: "jenis", header: "Jenis", type: "text", minWidth: 12, maxWidth: 14 },
            { key: "kategori", header: "Kategori", type: "text", minWidth: 14, maxWidth: 16 },
            { key: "referensi", header: "Referensi", type: "text", minWidth: 18, maxWidth: 24 },
            {
              key: "tanggalBayar",
              header: "Tanggal Bayar",
              type: "text",
              minWidth: 20,
              maxWidth: 24,
            },
            { key: "nominal", header: "Nominal", type: "currency", minWidth: 16, maxWidth: 18 },
            { key: "catatan", header: "Catatan", type: "text", minWidth: 22, maxWidth: 32 },
          ],
          rows: paymentRows.map((payment) => ({
            pihak: payment.partyName,
            jenis: payment.direction,
            kategori: payment.category,
            referensi: payment.reference,
            tanggalBayar: payment.paidAt,
            nominal: payment.amount,
            catatan: payment.note,
          })),
        },
      ],
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(createInitialForm());
  };

  const handleSaveRecord = (event) => {
    event.preventDefault();

    const totalAmount = Number(form.totalAmount || 0);
    const initialPaidAmount = editingId
      ? Number(records.find((record) => record.id === editingId)?.paidAmount || 0)
      : Number(form.initialPaidAmount || 0);

    if (!form.partyName.trim()) {
      showNotification("warning", "Nama pihak wajib diisi.");
      return;
    }

    if (totalAmount <= 0) {
      showNotification("warning", "Nominal total harus lebih besar dari 0.");
      return;
    }

    if (editingId && totalAmount < initialPaidAmount) {
      showNotification("warning", "Total baru tidak boleh lebih kecil dari jumlah yang sudah dibayar.");
      return;
    }

    if (!editingId && initialPaidAmount > totalAmount) {
      showNotification("warning", "Pembayaran awal tidak boleh melebihi total tagihan.");
      return;
    }

    const now = new Date().toISOString();

    if (editingId) {
      setRecords((prev) =>
        prev.map((record) =>
          record.id === editingId
            ? normalizeRecord({
                ...record,
                direction: form.direction,
                partyName: form.partyName,
                category: form.category,
                totalAmount,
                dueDate: form.dueDate,
                reference: form.reference,
                note: form.note,
                updatedAt: now,
              })
            : record
        )
      );

      showNotification("success", `Data ${form.partyName} berhasil diperbarui.`);
      resetForm();
      return;
    }

    const openingPayment =
      initialPaidAmount > 0
        ? [
            normalizePayment({
              amount: initialPaidAmount,
              note: "Pembayaran awal saat input",
              createdAt: now,
            }),
          ]
        : [];

    const nextRecord = normalizeRecord({
      direction: form.direction,
      partyName: form.partyName,
      category: form.category,
      totalAmount,
      paidAmount: initialPaidAmount,
      dueDate: form.dueDate,
      reference: form.reference,
      note: form.note,
      createdAt: now,
      updatedAt: now,
      payments: openingPayment,
    });

    setRecords((prev) => sortRecords([nextRecord, ...prev]));
    setSelectedId(nextRecord.id);
    showNotification(
      "success",
      `${form.direction === "piutang" ? "Piutang" : "Hutang"} untuk ${form.partyName} berhasil ditambahkan.`
    );
    resetForm();
  };

  const handleEditRecord = (record) => {
    setEditingId(record.id);
    setSelectedId(record.id);
    setForm({
      direction: record.direction,
      partyName: record.partyName,
      category: record.category,
      totalAmount: String(record.totalAmount),
      initialPaidAmount: String(record.paidAmount),
      dueDate: record.dueDate || "",
      reference: record.reference || "",
      note: record.note || "",
    });
  };

  const handleDeleteRecord = (record) => {
    const shouldDelete = window.confirm(
      `Hapus ${record.direction === "piutang" ? "piutang" : "hutang"} ${record.partyName}?`
    );
    if (!shouldDelete) return;

    setRecords((prev) => prev.filter((item) => item.id !== record.id));
    if (editingId === record.id) {
      resetForm();
    }
    showNotification("success", "Data berhasil dihapus.");
  };

  const handleAddPayment = (event) => {
    event.preventDefault();

    if (!selectedRecord) {
      showNotification("warning", "Pilih data hutang/piutang lebih dulu.");
      return;
    }

    const amount = Number(paymentForm.amount || 0);
    if (amount <= 0) {
      showNotification("warning", "Jumlah pembayaran harus lebih besar dari 0.");
      return;
    }

    const remaining = getRemainingAmount(selectedRecord);
    if (remaining <= 0) {
      showNotification("info", "Tagihan ini sudah lunas.");
      return;
    }

    const appliedAmount = Math.min(amount, remaining);
    const payment = normalizePayment({
      amount: appliedAmount,
      note: paymentForm.note || "Pembayaran manual",
    });

    setRecords((prev) =>
      prev.map((record) =>
        record.id === selectedRecord.id
          ? normalizeRecord({
              ...record,
              paidAmount: Number(record.paidAmount || 0) + appliedAmount,
              updatedAt: payment.createdAt,
              payments: [payment, ...(record.payments || [])],
            })
          : record
      )
    );

    setPaymentForm(createInitialPaymentForm());
    showNotification(
      "success",
      `${selectedRecord.direction === "piutang" ? "Pembayaran masuk" : "Pembayaran keluar"} sebesar ${formatRupiah(appliedAmount)} berhasil dicatat.`
    );
  };

  const handleMarkAsPaid = () => {
    if (!selectedRecord) return;

    const remaining = getRemainingAmount(selectedRecord);
    if (remaining <= 0) {
      showNotification("info", "Data ini sudah lunas.");
      return;
    }

    const payment = normalizePayment({
      amount: remaining,
      note: "Pelunasan penuh",
    });

    setRecords((prev) =>
      prev.map((record) =>
        record.id === selectedRecord.id
          ? normalizeRecord({
              ...record,
              paidAmount: Number(record.paidAmount || 0) + remaining,
              updatedAt: payment.createdAt,
              payments: [payment, ...(record.payments || [])],
            })
          : record
      )
    );

    setPaymentForm(createInitialPaymentForm());
    showNotification("success", `Data ${selectedRecord.partyName} ditandai lunas.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Debt Tracking"
        title="Hutang dan piutang"
        description="Sekarang halaman ini bisa dipakai langsung untuk mencatat tagihan pelanggan, hutang supplier, cicilan pembayaran, dan reminder jatuh tempo."
        icon="debt"
        actions={
          <button
            type="button"
            onClick={handleExportExcel}
            className="brand-button-secondary"
          >
            Export Excel
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard label="Total piutang aktif" value={formatRupiah(summary.totalPiutang)} accent="success" />
        <MetricCard label="Total hutang aktif" value={formatRupiah(summary.totalHutang)} accent="danger" />
        <MetricCard
          label="Jatuh tempo dekat"
          value={formatRupiah(summary.jatuhTempo)}
          helper="Tagihan aktif yang jatuh tempo dalam 7 hari."
        />
        <MetricCard
          label="Lewat tempo"
          value={formatRupiah(summary.lewatTempo)}
          helper={`${summary.lewatTempoCount} data perlu follow-up cepat.`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
                {editingId ? "Edit data hutang/piutang" : "Tambah catatan baru"}
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Dipakai untuk piutang pelanggan, hutang supplier, atau tagihan internal yang perlu dipantau sampai lunas.
              </p>
            </div>
            <div className="rounded-3xl border border-[var(--brand-gold)]/18 bg-[var(--brand-gold)]/10 px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-950">MVP aktif</p>
              <p className="mt-1 leading-6">
                Data halaman ini disimpan di browser kerja ini supaya bisa langsung dipakai tanpa menunggu backend tambahan.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {directionOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    direction: option.value,
                    category: option.value === "piutang" ? "transaksi" : "restock",
                  }))
                }
                className={
                  form.direction === option.value ? "brand-button-primary" : "brand-button-secondary"
                }
              >
                {option.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSaveRecord} className="mt-5 grid gap-4 md:grid-cols-2">
            <input
              value={form.partyName}
              onChange={(event) => setForm((prev) => ({ ...prev, partyName: event.target.value }))}
              className="brand-input md:col-span-2"
              placeholder={form.direction === "piutang" ? "Nama pelanggan" : "Nama supplier"}
              required
            />
            <select
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              className="brand-select"
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value} className="bg-white">
                  {option.label}
                </option>
              ))}
            </select>
            <input
              value={form.reference}
              onChange={(event) => setForm((prev) => ({ ...prev, reference: event.target.value }))}
              className="brand-input"
              placeholder="No transaksi / invoice / referensi"
            />
            <div className="space-y-3">
              <input
                type="number"
                min="0"
                value={form.totalAmount}
                onChange={(event) => setForm((prev) => ({ ...prev, totalAmount: event.target.value }))}
                className="brand-input"
                placeholder="Total tagihan"
                required
              />
              <div className="flex flex-wrap gap-2">
                {quickAmountOptions.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, totalAmount: String(amount) }))}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      form.totalAmount === String(amount)
                        ? "bg-[var(--brand-gold)] text-slate-950"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {amount >= 1000 ? `${formatPlainNumber(amount / 1000)}k` : amount}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="number"
              min="0"
              value={form.initialPaidAmount}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, initialPaidAmount: event.target.value }))
              }
              className="brand-input"
              placeholder="Pembayaran awal"
              disabled={Boolean(editingId)}
            />
            <div className="space-y-3">
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                className="brand-input"
              />
              <div className="flex flex-wrap gap-2">
                {quickDueOptions.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => {
                      const dueDate = new Date();
                      dueDate.setDate(dueDate.getDate() + days);
                      setForm((prev) => ({ ...prev, dueDate: formatDateInput(dueDate) }));
                    }}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600"
                  >
                    +{days} hari
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              className="brand-textarea md:col-span-2"
              placeholder="Catatan follow-up, janji pembayaran, atau detail tambahan"
            />
            <div className="md:col-span-2 grid gap-3 sm:grid-cols-2">
              <button type="submit" className="brand-button-success">
                {editingId ? "Update Data" : "Simpan Data"}
              </button>
              <button type="button" onClick={resetForm} className="brand-button-secondary">
                Reset Form
              </button>
            </div>
          </form>
        </Panel>

        <Panel variant="strong" className="p-6">
          <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Reminder dan follow-up
          </h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Prioritas paling atas adalah data yang lewat tempo atau paling dekat jatuh temponya.
          </p>

          <div className="mt-5 space-y-3">
            {reminderRecords.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
                Belum ada hutang atau piutang aktif.
              </div>
            ) : (
              reminderRecords.map((record) => {
                const dueStatus = getDueStatus(record);
                const paymentStatus = getPaymentStatus(record);
                const remaining = getRemainingAmount(record);

                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => setSelectedId(record.id)}
                    className="w-full rounded-3xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-[var(--brand-gold)]/24 hover:bg-[var(--brand-gold)]/6"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{record.partyName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {record.direction === "piutang" ? "Piutang" : "Hutang"} - {record.reference || record.category}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${dueStatus.className}`}>
                        {dueStatus.label}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${paymentStatus.className}`}>
                        {paymentStatus.label}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        Sisa {formatRupiah(remaining)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_390px]">
        <Panel className="p-6">
          <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid gap-3 md:grid-cols-[1.3fr_180px_220px]">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="brand-input"
                placeholder="Cari nama pihak, referensi, kategori, atau catatan..."
              />
              <select
                value={directionFilter}
                onChange={(event) => setDirectionFilter(event.target.value)}
                className="brand-select"
              >
                {directionFilterOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-white">
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="brand-select"
              >
                {statusFilterOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-white">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-sm text-slate-600">{filteredRecords.length} data tampil</p>
          </div>

          <div className="brand-scrollbar overflow-x-auto">
            <table className="brand-table">
              <thead>
                <tr>
                  <th>Pihak</th>
                  <th>Jenis</th>
                  <th>Tempo</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Sisa</th>
                  <th>Status</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-14 text-center text-slate-500">
                      Belum ada data yang cocok dengan filter aktif.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((record) => {
                    const paymentStatus = getPaymentStatus(record);
                    const dueStatus = getDueStatus(record);

                    return (
                      <tr key={record.id}>
                        <td>
                          <button
                            type="button"
                            onClick={() => setSelectedId(record.id)}
                            className="text-left"
                          >
                            <p className="font-semibold text-slate-950">{record.partyName}</p>
                            <p className="text-xs text-slate-500">{record.reference || record.category}</p>
                          </button>
                        </td>
                        <td className="text-slate-600">
                          {record.direction === "piutang" ? "Piutang" : "Hutang"}
                        </td>
                        <td>
                          <p className="text-slate-700">{record.dueDate || "-"}</p>
                          <p className="mt-1 text-xs text-slate-500">{dueStatus.label}</p>
                        </td>
                        <td className="text-right text-slate-600">{formatRupiah(record.totalAmount)}</td>
                        <td className="text-right font-semibold text-slate-950">
                          {formatRupiah(getRemainingAmount(record))}
                        </td>
                        <td>
                          <div className="flex flex-col gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${paymentStatus.className}`}>
                              {paymentStatus.label}
                            </span>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${dueStatus.className}`}>
                              {dueStatus.label}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditRecord(record)}
                              className="brand-button-secondary px-3 py-2"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRecord(record)}
                              className="brand-button-secondary px-3 py-2"
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel variant="strong" className="p-6 xl:sticky xl:top-6 xl:self-start">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand-gold)]">
                Detail
              </p>
              <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
                {selectedRecord ? selectedRecord.partyName : "Belum ada pilihan"}
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {selectedRecord
                  ? `${selectedRecord.direction === "piutang" ? "Piutang" : "Hutang"} - dibuat ${formatDateTime(selectedRecord.createdAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}`
                  : "Pilih salah satu data di tabel untuk melihat detail dan mencatat pembayaran."}
              </p>
            </div>
            {selectedRecord ? (
              <button
                type="button"
                onClick={handleMarkAsPaid}
                className="brand-button-primary"
              >
                Tandai Lunas
              </button>
            ) : null}
          </div>

          {selectedRecord ? (
            <>
              <div className="mt-5 grid gap-3">
                <DetailInfo label="Total tagihan" value={formatRupiah(selectedRecord.totalAmount)} />
                <DetailInfo label="Sudah dibayar" value={formatRupiah(selectedRecord.paidAmount)} />
                <DetailInfo label="Sisa tagihan" value={formatRupiah(selectedRemaining)} />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <DetailInfo label="Kategori" value={selectedRecord.category} />
                <DetailInfo label="Tempo" value={selectedRecord.dueDate || "-"} />
                <DetailInfo label="Referensi" value={selectedRecord.reference || "-"} />
                <DetailInfo label="Status" value={getPaymentStatus(selectedRecord).label} />
              </div>

              <form
                onSubmit={handleAddPayment}
                className="mt-5 rounded-[28px] border border-slate-200 bg-white p-4"
              >
                <p className="text-sm font-semibold text-slate-950">Catat pembayaran / cicilan</p>
                <div className="mt-4 space-y-4">
                  <input
                    type="number"
                    min="0"
                    max={selectedRemaining}
                    value={paymentForm.amount}
                    onChange={(event) =>
                      setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))
                    }
                    className="brand-input"
                    placeholder={`Maksimal ${formatRupiah(selectedRemaining)}`}
                  />
                  <div className="flex flex-wrap gap-2">
                    {[0.25, 0.5, 1].map((ratio) => {
                      const amount = Math.max(0, Math.round(selectedRemaining * ratio));
                      return (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() =>
                            setPaymentForm((prev) => ({ ...prev, amount: String(amount) }))
                          }
                          className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600"
                        >
                          {ratio === 1 ? "Lunas" : `${ratio * 100}%`}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    value={paymentForm.note}
                    onChange={(event) =>
                      setPaymentForm((prev) => ({ ...prev, note: event.target.value }))
                    }
                    className="brand-textarea"
                    placeholder="Catatan pembayaran, nama penagih, atau follow-up"
                  />
                  <button
                    type="submit"
                    disabled={selectedRemaining <= 0}
                    className="brand-button-success w-full disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Simpan Pembayaran
                  </button>
                </div>
              </form>

              {selectedRecord.note ? (
                <div className="mt-5 rounded-[28px] border border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Catatan utama
                  </p>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{selectedRecord.note}</p>
                </div>
              ) : null}

              <div className="mt-5 rounded-[28px] border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-950">Riwayat pembayaran</p>
                <div
                  className="brand-scrollbar mt-4 space-y-3 overflow-y-auto pr-1"
                  style={{ maxHeight: "280px" }}
                >
                  {selectedRecord.payments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                      Belum ada pembayaran tercatat.
                    </div>
                  ) : (
                    selectedRecord.payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-950">
                              {formatRupiah(payment.amount)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatDateTime(payment.createdAt, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </p>
                          </div>
                          <p className="text-sm text-slate-600">{payment.note || "-"}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-4 py-14 text-center text-sm text-slate-500">
              Belum ada data terpilih.
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
