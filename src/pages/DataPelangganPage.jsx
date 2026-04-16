import { useDeferredValue, useEffect, useMemo, useState } from "react";
import MetricCard from "../components/app/MetricCard";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { useData } from "../contexts/DataContext";
import { showNotification } from "../contexts/NotificationContext";
import { serviceTypeLabelMap } from "../data/businessOptions";
import { formatCashierName } from "../utils/cashier";
import { formatDateTime, formatRupiah } from "../utils/format";

const STORAGE_KEY = "raja-customers-crm-v1";
const FILTER_OPTIONS = [
  { value: "semua", label: "Semua" },
  { value: "aktif", label: "Pelanggan Aktif" },
  { value: "loyal", label: "Pelanggan Loyal" },
];
const CATEGORY_OPTIONS = [
  { value: "umum", label: "Umum" },
  { value: "loyal", label: "Loyal" },
  { value: "grosir", label: "Grosir" },
];

function createInitialForm() {
  return {
    name: "",
    phone: "",
    category: "umum",
    notes: "",
  };
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizePhone(value) {
  const digits = normalizeDigits(value);
  if (!digits) return "";
  if (digits.startsWith("62")) return `0${digits.slice(2)}`;
  return digits;
}

function formatPhone(value) {
  return normalizeText(value) || "-";
}

function normalizeCustomer(record) {
  return {
    id: record.id || crypto.randomUUID(),
    name: normalizeText(record.name),
    phone: normalizeText(record.phone),
    category: CATEGORY_OPTIONS.some((option) => option.value === record.category)
      ? record.category
      : "umum",
    notes: normalizeText(record.notes),
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
  };
}

function loadCustomers() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeCustomer) : [];
  } catch {
    return [];
  }
}

function persistCustomers(customers) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
}

function getCategoryMeta(category) {
  if (category === "grosir") {
    return { label: "Grosir", className: "bg-slate-100 text-slate-700" };
  }

  if (category === "loyal") {
    return {
      label: "Loyal",
      className: "bg-[var(--brand-gold)]/16 text-[var(--brand-gold)]",
    };
  }

  return { label: "Umum", className: "bg-white text-slate-600" };
}

function formatPaymentMethod(value) {
  const normalized = normalizeText(value).toLowerCase();

  if (!normalized) return "-";
  if (normalized === "tunai") return "Tunai";
  if (normalized === "qris") return "QRIS";
  if (normalized === "transfer") return "Transfer";

  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildAccessoryLabel(transaction) {
  const items = Array.isArray(transaction.items) ? transaction.items : [];
  const names = items.map((item) => normalizeText(item.nama_produk)).filter(Boolean);

  if (!names.length) return "Penjualan Aksesoris";
  if (names.length === 1) return names[0];
  return `${names[0]} + ${names.length - 1} item lain`;
}

function buildDigitalLabel(transaction) {
  const serviceLabel =
    serviceTypeLabelMap[transaction.jenis] || normalizeText(transaction.jenis) || "Layanan Digital";
  const provider = normalizeText(transaction.provider);
  return [serviceLabel, provider].filter(Boolean).join(" - ");
}

function matchesPhone(customerPhone, candidates) {
  if (!customerPhone) return false;

  return candidates.some((candidate) => {
    const phone = normalizePhone(candidate);
    if (!phone) return false;

    return (
      phone === customerPhone ||
      phone.endsWith(customerPhone) ||
      customerPhone.endsWith(phone)
    );
  });
}

function matchesName(customerName, candidates) {
  if (!customerName) return false;

  return candidates.some((candidate) => {
    const text = normalizeText(candidate).toLowerCase();
    return text ? text.includes(customerName) : false;
  });
}

function buildCustomerHistory(customer, data) {
  const customerName = normalizeText(customer.name).toLowerCase();
  const customerPhone = normalizePhone(customer.phone);
  const rows = [];

  data.accessoryTransactions.forEach((transaction) => {
    const matched =
      matchesPhone(customerPhone, [transaction.catatan]) ||
      matchesName(customerName, [transaction.catatan]);

    if (!matched) return;

    rows.push({
      id: `aks-${transaction.id}`,
      createdAt: transaction.created_at,
      tanggal: formatDateTime(transaction.created_at, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      produk: buildAccessoryLabel(transaction),
      total: Number(transaction.total_bayar || 0),
      metode: formatPaymentMethod(transaction.metode_bayar),
      kasir: formatCashierName(transaction.kasir_id),
      noTransaksi: transaction.no_transaksi || `TRX-${transaction.id}`,
    });
  });

  data.digitalTransactions.forEach((transaction) => {
    const matched =
      matchesPhone(customerPhone, [transaction.nomor_tujuan, transaction.catatan]) ||
      matchesName(customerName, [
        transaction.nama_tujuan,
        transaction.catatan,
        transaction.provider,
      ]);

    if (!matched) return;

    rows.push({
      id: `dig-${transaction.id}`,
      createdAt: transaction.created_at,
      tanggal: formatDateTime(transaction.created_at, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      produk: buildDigitalLabel(transaction),
      total: Number(transaction.harga_jual || 0),
      metode: "Digital",
      kasir: formatCashierName(transaction.kasir_id),
      noTransaksi: transaction.no_transaksi || `LYN-${transaction.id}`,
    });
  });

  data.logisticsTransactions.forEach((transaction) => {
    const matched =
      matchesPhone(customerPhone, [transaction.catatan]) ||
      matchesName(customerName, [
        transaction.catatan,
        transaction.ekspedisi,
        transaction.courier,
        transaction.sender,
        transaction.sender_name,
        transaction.receiver,
        transaction.receiver_name,
      ]);

    if (!matched) return;

    rows.push({
      id: `log-${transaction.id}`,
      createdAt: transaction.created_at,
      tanggal: formatDateTime(transaction.created_at, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      produk:
        [
          normalizeText(transaction.courier || transaction.ekspedisi),
          normalizeText(transaction.receiver || transaction.receiver_name),
          normalizeText(transaction.destination),
        ]
          .filter(Boolean)
          .join(" - ") || "Logistik",
      total: Number(transaction.price || transaction.harga_jual || 0),
      metode: "Logistik",
      kasir: formatCashierName(transaction.kasir_id),
      noTransaksi: transaction.no_transaksi || `LOG-${transaction.id}`,
    });
  });

  return rows.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

function getEffectiveCategory(customer, history) {
  if (customer.category === "grosir") return "grosir";
  if (customer.category === "loyal") return "loyal";

  const totalTransactions = history.length;
  const totalSpending = history.reduce((sum, row) => sum + row.total, 0);

  if (totalTransactions >= 5 || totalSpending >= 1500000) {
    return "loyal";
  }

  return "umum";
}

function buildCustomerViewModel(customer, data) {
  const history = buildCustomerHistory(customer, data);
  const totalTransactions = history.length;
  const totalSpending = history.reduce((sum, row) => sum + row.total, 0);
  const lastTransaction = history[0]?.createdAt || "";
  const effectiveCategory = getEffectiveCategory(customer, history);

  return {
    ...customer,
    baseCategory: customer.category,
    category: effectiveCategory,
    totalTransactions,
    totalSpending,
    lastTransaction,
    averageSpending: totalTransactions ? totalSpending / totalTransactions : 0,
    history,
    isActive: totalTransactions > 0,
  };
}

function CustomerBadge({ category }) {
  const meta = getCategoryMeta(category);

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function DetailMetric({ label, value, accent = "default" }) {
  const accentClass =
    accent === "gold"
      ? "border-[var(--brand-gold)]/20 bg-[var(--brand-gold)]/10"
      : accent === "success"
        ? "border-emerald-200 bg-emerald-50"
        : "border-slate-200 bg-slate-50";

  return (
    <div className={`rounded-[24px] border px-4 py-4 ${accentClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-xl font-black tracking-tight text-slate-950">{value}</p>
    </div>
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

function CustomerFormModal({ form, editingId, submitting, onClose, onChange, onSubmit }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-2xl rounded-[32px] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand-gold)]">
              CRM
            </p>
            <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
              {editingId ? "Edit pelanggan" : "Tambah pelanggan"}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Simpan data pelanggan prioritas supaya follow-up dan repeat order lebih rapi.
            </p>
          </div>

          <button type="button" onClick={onClose} className="brand-button-secondary px-3 py-2">
            Tutup
          </button>
        </div>

        <form onSubmit={onSubmit} className="grid gap-4 px-6 py-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Nama</label>
            <input
              value={form.name}
              onChange={(event) => onChange("name", event.target.value)}
              className="brand-input"
              placeholder="Nama pelanggan"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">No HP</label>
            <input
              value={form.phone}
              onChange={(event) => onChange("phone", event.target.value)}
              className="brand-input"
              placeholder="08xxxxxxxxxx"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Kategori</label>
            <select
              value={form.category}
              onChange={(event) => onChange("category", event.target.value)}
              className="brand-select"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-white text-slate-950">
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Catatan</label>
            <textarea
              value={form.notes}
              onChange={(event) => onChange("notes", event.target.value)}
              className="brand-textarea"
              placeholder="Preferensi produk, catatan follow-up, atau kebiasaan belanja pelanggan."
              rows="4"
            />
          </div>

          <div className="md:col-span-2 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={onClose} className="brand-button-secondary">
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="brand-button-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Menyimpan..." : editingId ? "Update Pelanggan" : "Simpan Pelanggan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DataPelangganPage() {
  const { accessoryTransactions, digitalTransactions, logisticsTransactions } = useData();
  const [records, setRecords] = useState(loadCustomers);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("semua");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(createInitialForm);
  const [editingId, setEditingId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const deferredSearch = useDeferredValue(searchTerm);

  useEffect(() => {
    persistCustomers(records);
  }, [records]);

  const customerData = useMemo(
    () => ({
      accessoryTransactions,
      digitalTransactions,
      logisticsTransactions,
    }),
    [accessoryTransactions, digitalTransactions, logisticsTransactions]
  );

  const customers = useMemo(
    () =>
      records
        .map((record) => buildCustomerViewModel(record, customerData))
        .sort((left, right) => {
          if (right.totalSpending !== left.totalSpending) {
            return right.totalSpending - left.totalSpending;
          }

          if (left.name !== right.name) {
            return left.name.localeCompare(right.name, "id-ID");
          }

          return new Date(right.updatedAt) - new Date(left.updatedAt);
        }),
    [customerData, records]
  );

  const filteredCustomers = useMemo(() => {
    const keyword = normalizeText(deferredSearch).toLowerCase();

    return customers.filter((customer) => {
      const matchesSearch = keyword
        ? [customer.name, customer.phone, customer.notes]
            .join(" ")
            .toLowerCase()
            .includes(keyword)
        : true;
      const matchesFilter =
        filter === "semua"
          ? true
          : filter === "aktif"
            ? customer.isActive
            : customer.category === "loyal";

      return matchesSearch && matchesFilter;
    });
  }, [customers, deferredSearch, filter]);

  const selectedCustomer = useMemo(
    () => filteredCustomers.find((customer) => customer.id === selectedId) || null,
    [filteredCustomers, selectedId]
  );

  useEffect(() => {
    if (!filteredCustomers.length) {
      setSelectedId(null);
      return;
    }

    if (!filteredCustomers.some((customer) => customer.id === selectedId)) {
      setSelectedId(filteredCustomers[0].id);
    }
  }, [filteredCustomers, selectedId]);

  const summary = useMemo(
    () =>
      customers.reduce(
        (acc, customer) => {
          acc.total += 1;
          if (customer.isActive) acc.active += 1;
          if (customer.category === "loyal") acc.loyal += 1;
          acc.spending += customer.totalSpending;
          return acc;
        },
        {
          total: 0,
          active: 0,
          loyal: 0,
          spending: 0,
        }
      ),
    [customers]
  );

  const openCreateModal = () => {
    setEditingId(null);
    setForm(createInitialForm());
    setShowModal(true);
  };

  const openEditModal = (customer) => {
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      phone: customer.phone,
      category: customer.baseCategory || customer.category,
      notes: customer.notes,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(createInitialForm());
    setSubmitting(false);
  };

  const handleSaveCustomer = (event) => {
    event.preventDefault();
    setSubmitting(true);

    const normalizedName = normalizeText(form.name);
    const normalizedPhone = normalizeText(form.phone);

    if (!normalizedName || !normalizedPhone) {
      showNotification("warning", "Nama dan nomor HP pelanggan wajib diisi.");
      setSubmitting(false);
      return;
    }

    const duplicatePhone = records.find(
      (record) =>
        record.id !== editingId &&
        normalizePhone(record.phone) &&
        normalizePhone(record.phone) === normalizePhone(normalizedPhone)
    );

    if (duplicatePhone) {
      showNotification("warning", "Nomor HP pelanggan sudah dipakai oleh data lain.");
      setSubmitting(false);
      return;
    }

    const now = new Date().toISOString();

    if (editingId) {
      setRecords((prev) =>
        prev.map((record) =>
          record.id === editingId
            ? normalizeCustomer({
                ...record,
                ...form,
                name: normalizedName,
                phone: normalizedPhone,
                updatedAt: now,
              })
            : record
        )
      );
      showNotification("success", `Data ${normalizedName} berhasil diperbarui.`);
    } else {
      const nextCustomer = normalizeCustomer({
        ...form,
        id: crypto.randomUUID(),
        name: normalizedName,
        phone: normalizedPhone,
        createdAt: now,
        updatedAt: now,
      });

      setRecords((prev) => [nextCustomer, ...prev]);
      setSelectedId(nextCustomer.id);
      showNotification("success", `${normalizedName} berhasil ditambahkan ke CRM.`);
    }

    closeModal();
  };

  const handleDeleteCustomer = (customer) => {
    const confirmed = window.confirm(`Hapus data pelanggan ${customer.name}?`);
    if (!confirmed) return;

    setRecords((prev) => prev.filter((record) => record.id !== customer.id));
    showNotification("success", `Data ${customer.name} berhasil dihapus.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM"
        title="Data Pelanggan"
        description="Kelola pelanggan, pantau histori transaksi, dan tingkatkan repeat order."
        icon="users"
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          label="Total pelanggan"
          value={String(summary.total)}
          helper="Semua data pelanggan yang tersimpan."
        />
        <MetricCard
          label="Pelanggan aktif"
          value={String(summary.active)}
          helper="Pelanggan dengan histori transaksi terdeteksi."
          accent="success"
        />
        <MetricCard
          label="Pelanggan loyal"
          value={String(summary.loyal)}
          helper="Dari kategori manual atau repeat order tinggi."
          accent="gold"
        />
        <MetricCard
          label="Total belanja"
          value={formatRupiah(summary.spending)}
          helper="Akumulasi transaksi yang berhasil dipetakan."
        />
      </div>

      <Panel className="p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Cari nama pelanggan atau nomor HP..."
            className="brand-input"
          />

          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={filter === option.value ? "brand-button-primary" : "brand-button-secondary"}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button type="button" onClick={openCreateModal} className="brand-button-primary">
            + Tambah Pelanggan
          </button>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.22fr)_390px]">
        <Panel className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-5">
            <h3 className="font-display text-2xl font-bold tracking-tight text-slate-950">
              Daftar pelanggan
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Pantau pelanggan aktif, nilai belanja, dan follow-up pelanggan loyal dalam satu tabel.
            </p>
          </div>

          <div className="brand-scrollbar overflow-x-auto">
            <table className="brand-table">
              <thead>
                <tr>
                  <th>Nama Pelanggan</th>
                  <th>No HP</th>
                  <th>Kategori</th>
                  <th className="text-right">Total Transaksi</th>
                  <th className="text-right">Total Belanja</th>
                  <th>Terakhir Transaksi</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-14 text-center text-slate-500">
                      Belum ada pelanggan yang cocok dengan pencarian atau filter aktif.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((customer, index) => {
                    const active = selectedId === customer.id;

                    return (
                      <tr
                        key={customer.id}
                        onClick={() => setSelectedId(customer.id)}
                        className={`cursor-pointer transition ${
                          active
                            ? "bg-[var(--brand-gold)]/10"
                            : index % 2 === 0
                              ? "bg-white hover:bg-slate-50"
                              : "bg-slate-50/70 hover:bg-slate-100/70"
                        }`}
                      >
                        <td>
                          <div>
                            <p className="font-semibold text-slate-950">{customer.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {customer.notes || "Belum ada catatan follow-up."}
                            </p>
                          </div>
                        </td>
                        <td className="text-slate-600">{formatPhone(customer.phone)}</td>
                        <td>
                          <CustomerBadge category={customer.category} />
                        </td>
                        <td className="text-right font-semibold text-slate-950">
                          {customer.totalTransactions}
                        </td>
                        <td className="text-right font-semibold text-slate-950">
                          {formatRupiah(customer.totalSpending)}
                        </td>
                        <td className="text-slate-600">
                          {customer.lastTransaction
                            ? formatDateTime(customer.lastTransaction, {
                                dateStyle: "medium",
                              })
                            : "-"}
                        </td>
                        <td>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedId(customer.id);
                              }}
                              className="brand-button-secondary px-3 py-2"
                            >
                              Detail
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditModal(customer);
                              }}
                              className="brand-button-secondary px-3 py-2"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteCustomer(customer);
                              }}
                              className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
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
                Detail pelanggan
              </p>
              <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
                {selectedCustomer ? selectedCustomer.name : "Belum ada pilihan"}
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {selectedCustomer
                  ? "Ringkasan hubungan pelanggan dan histori transaksi terbaru."
                  : "Pilih salah satu pelanggan dari tabel untuk melihat detail lengkapnya."}
              </p>
            </div>

            {selectedCustomer ? <CustomerBadge category={selectedCustomer.category} /> : null}
          </div>

          {selectedCustomer ? (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <DetailInfo label="Nama" value={selectedCustomer.name} />
                <DetailInfo label="No HP" value={formatPhone(selectedCustomer.phone)} />
                <DetailInfo
                  label="Kategori"
                  value={getCategoryMeta(selectedCustomer.category).label}
                />
                <DetailInfo
                  label="Terakhir transaksi"
                  value={
                    selectedCustomer.lastTransaction
                      ? formatDateTime(selectedCustomer.lastTransaction, {
                          dateStyle: "full",
                        })
                      : "Belum ada transaksi"
                  }
                />
              </div>

              <div className="mt-5 grid gap-3">
                <DetailMetric
                  label="Total transaksi"
                  value={String(selectedCustomer.totalTransactions)}
                />
                <DetailMetric
                  label="Total belanja"
                  value={formatRupiah(selectedCustomer.totalSpending)}
                  accent="gold"
                />
                <DetailMetric
                  label="Rata-rata pembelian"
                  value={formatRupiah(selectedCustomer.averageSpending)}
                  accent="success"
                />
              </div>

              <div className="mt-5 rounded-[28px] border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Histori transaksi
                    </p>
                    <p className="mt-2 text-lg font-bold text-slate-950">
                      {selectedCustomer.history.length} transaksi terhubung
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedCustomer)}
                    className="brand-button-secondary"
                  >
                    Edit Data
                  </button>
                </div>

                <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200">
                  <div className="brand-scrollbar overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-[var(--brand-gold)] text-white">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em]">
                            Tanggal
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em]">
                            Produk
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em]">
                            Total
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em]">
                            Metode
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {selectedCustomer.history.length === 0 ? (
                          <tr>
                            <td colSpan="4" className="px-4 py-8 text-center text-sm text-slate-500">
                              Belum ada histori transaksi yang cocok. Riwayat akan muncul otomatis
                              saat nama atau nomor HP pelanggan terdeteksi di transaksi POS.
                            </td>
                          </tr>
                        ) : (
                          selectedCustomer.history.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3 text-sm text-slate-600">{item.tanggal}</td>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-slate-950">{item.produk}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {item.noTransaksi} - {item.kasir}
                                </p>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-slate-950">
                                {formatRupiah(item.total)}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-600">{item.metode}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {selectedCustomer.notes ? (
                <div className="mt-5 rounded-[28px] border border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Catatan
                  </p>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{selectedCustomer.notes}</p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-5 rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
              Tambahkan pelanggan baru atau pilih salah satu data dari tabel untuk mulai melihat
              ringkasan dan histori transaksi.
            </div>
          )}
        </Panel>
      </div>

      {showModal ? (
        <CustomerFormModal
          form={form}
          editingId={editingId}
          submitting={submitting}
          onClose={closeModal}
          onChange={(key, value) => setForm((prev) => ({ ...prev, [key]: value }))}
          onSubmit={handleSaveCustomer}
        />
      ) : null}
    </div>
  );
}
