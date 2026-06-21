import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Banknote,
  Box,
  CheckCircle2,
  Clock3,
  CircleDollarSign,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  KeyRound,
  Loader2,
  LockKeyhole,
  MoreHorizontal,
  MonitorSmartphone,
  Plus,
  ReceiptText,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  StickyNote,
  UserRound,
  Users,
  X,
} from "lucide-react";
import FeatureLoadPanel from "../components/FeatureLoadPanel";
import SecurityActionModal from "../components/SecurityActionModal";
import Panel from "../components/app/Panel";
import { showNotification } from "../contexts/NotificationContext";
import { useAuth } from "../contexts/useAuth";
import { useEmployees } from "../hooks/useEmployees";
import { useEmployeePresence } from "../contexts/useEmployeePresence";
import { useEmployeeActivity } from "../hooks/useEmployeeActivity";
import { useEmployeeNotes } from "../hooks/useEmployeeNotes";
import { useEmployeePerformance } from "../hooks/useEmployeePerformance";
import { useEmployeePermissions } from "../hooks/useEmployeePermissions";
import {
  formatDateTime,
  formatDisplayDate,
  formatPlainNumber,
  formatRupiah,
} from "../utils/format";
import { CASHIER_STATIONS } from "../utils/shift";
import {
  buildEmployeeDailyPerformance,
  buildEmployees,
  formatClock,
  formatRelativeTime,
  getActionMenuPosition,
  getCashierId,
  getInitials,
  getRoleLabel,
  getSessionLabel,
  getTransactionAmount,
  getTransactionItems,
  normalizeDay,
  splitDeviceLabel,
} from "../features/employee/selectors/employees";

const roleOptions = [
  { value: "all", label: "Semua role" },
  { value: "pemilik", label: "Pemilik" },
  { value: "kasir", label: "Kasir" },
];

const cashierStationOptions = [
  { value: "", label: "Belum ditentukan" },
  ...CASHIER_STATIONS.map((station) => ({ value: station, label: station })),
];

const statusOptions = [
  { value: "all", label: "Semua status" },
  { value: "online", label: "Aktif sekarang" },
  { value: "idle", label: "Idle" },
  { value: "offline", label: "Offline" },
  { value: "inactive", label: "Nonaktif" },
  { value: "suspended", label: "Suspended" },
  { value: "archived", label: "Diarsipkan" },
];

const payrollStatusMap = {
  paid: {
    label: "Sudah Dibayar",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  waiting: {
    label: "Menunggu",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  late: {
    label: "Terlambat",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

const sensitiveActions = [
  { id: "refund", label: "Refund", helper: "Validasi pengembalian dana", icon: CreditCard },
  { id: "retur", label: "Retur", helper: "Retur pelanggan dan barang", icon: ReceiptText },
  { id: "stock", label: "Edit stok", helper: "Perubahan stok fisik", icon: Box },
  { id: "price", label: "Edit harga", helper: "Ubah harga jual produk", icon: Banknote },
  {
    id: "delete_transaction",
    label: "Delete transaksi",
    helper: "Hapus atau arsip transaksi",
    icon: AlertTriangle,
  },
  { id: "closing_shift", label: "Closing shift", helper: "Penutupan shift kasir", icon: LockKeyhole },
];

const securityRoleOptions = [
  { value: "owner_only", label: "Owner only" },
  { value: "kasir_owner", label: "Kasir + Owner" },
  { value: "all_users", label: "Semua user" },
];

const drawerTabs = [
  { id: "overview", label: "Overview", icon: UserRound },
  { id: "activity", label: "Aktivitas", icon: Clock3 },
  { id: "performance", label: "Performa", icon: Gauge },
  { id: "access", label: "Akses", icon: ShieldCheck },
  { id: "payroll", label: "Payroll", icon: CircleDollarSign },
  { id: "notes", label: "Catatan", icon: StickyNote },
];

function Badge({ children, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}
    >
      {children}
    </span>
  );
}

function Avatar({ employee, size = "md" }) {
  const sizeClass = size === "lg" ? "h-16 w-16 text-lg" : "h-9 w-9 text-xs";

  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-xl border border-[var(--brand-gold)]/20 bg-[var(--brand-gold)]/15 font-black text-[var(--brand-gold-strong)] shadow-sm`}
    >
      {getInitials(employee?.name)}
    </div>
  );
}

function StatusBadge({ status, lastSeenAt, now = Date.now(), activityStatus = "" }) {
  if (status === "online") {
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_0_0_3px_rgba(16,185,129,0.08)]">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="max-w-[150px] truncate">
          {getSessionLabel(status, lastSeenAt, now, activityStatus)}
        </span>
      </Badge>
    );
  }

  if (status === "idle") {
    return (
      <Badge className="border-amber-200 bg-amber-50 text-amber-700">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        {getSessionLabel(status, lastSeenAt, now)}
      </Badge>
    );
  }

  if (status === "inactive") {
    return (
      <Badge className="border-rose-200 bg-rose-50 text-rose-700">
        <span className="h-2 w-2 rounded-full bg-rose-500" />
        Nonaktif
      </Badge>
    );
  }

  if (status === "suspended") {
    return (
      <Badge className="border-amber-200 bg-amber-50 text-amber-700">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Suspended
      </Badge>
    );
  }

  if (status === "archived") {
    return (
      <Badge className="border-slate-300 bg-slate-100 text-slate-600">
        <span className="h-2 w-2 rounded-full bg-slate-500" />
        Diarsipkan
      </Badge>
    );
  }

  return (
    <Badge className="border-slate-200 bg-slate-50 text-slate-500">
      <span className="h-2 w-2 rounded-full bg-slate-400" />
      {getSessionLabel(status, lastSeenAt, now)}
    </Badge>
  );
}

function LiveDot({ status }) {
  if (status === "online") {
    return (
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
      </span>
    );
  }

  const tone = status === "idle" ? "bg-amber-500 ring-4 ring-amber-100" : "bg-slate-400 ring-4 ring-slate-100";

  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} />;
}

function LiveStaffCell({ employee, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[48px] min-w-0 items-center gap-3 text-left"
      title={employee.deviceFull}
    >
      <div className="relative shrink-0">
        <Avatar employee={employee} />
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5">
          <LiveDot status={employee.sessionStatus} />
        </span>
      </div>
      <span className="min-w-0">
        <span className="block truncate font-black text-slate-950">{employee.name}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="truncate">@{employee.username}</span>
        </span>
      </span>
    </button>
  );
}

function PayrollBadge({ status }) {
  const meta = payrollStatusMap[status] || payrollStatusMap.waiting;

  return <Badge className={meta.className}>{meta.label}</Badge>;
}

function SummaryCard({ icon: Icon, label, value, helper, tone = "gold" }) {
  const toneClass = {
    gold: "bg-[var(--brand-gold)]/15 text-[var(--brand-gold-strong)]",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-rose-50 text-rose-700",
    info: "bg-blue-50 text-blue-700",
  }[tone];
  const accentClass = {
    gold: "bg-[var(--brand-gold)]",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    info: "bg-blue-500",
  }[tone];

  return (
    <Panel className="min-w-[210px] overflow-hidden border-white/70 bg-white/95 p-3.5 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{helper}</p>
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </div>
      </div>
      <div className={`mt-3 h-1 rounded-full ${accentClass}`} />
    </Panel>
  );
}

function MiniStat({ label, value, tone = "default" }) {
  const valueClass =
    tone === "danger"
      ? "text-rose-600"
      : tone === "success"
        ? "text-emerald-700"
        : "text-slate-950";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-2 text-lg font-black ${valueClass}`}>{value}</p>
    </div>
  );
}

function SecurityToggle({ checked, loading, disabled = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
        checked
          ? "border-emerald-400 bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
          : "border-slate-300 bg-slate-200"
      }`}
      aria-pressed={checked}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white shadow-sm transition duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function DisableSecurityModal({ action, onCancel, onConfirm, loading }) {
  if (!action) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:items-center">
      <div className="brand-success-popover w-full max-w-sm scale-100 rounded-2xl border border-white/70 bg-white p-5 shadow-2xl transition">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-black tracking-tight text-slate-950">
              Nonaktifkan Validasi PIN?
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Aksi ini dapat meningkatkan risiko operasional toko.
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-800">
          {action.label} dapat dilakukan tanpa validasi PIN.
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Menyimpan..." : "Tetap Nonaktifkan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PayrollCard({ employee, metrics, onPay }) {
  const totalSalary = employee.baseSalary + employee.bonus - employee.deduction;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-950">Payroll bulan ini</p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Bonus mengikuti omzet dan transaksi kasir.
          </p>
        </div>
        <PayrollBadge status={employee.payrollStatus} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <MiniStat label="Gaji Pokok" value={formatRupiah(employee.baseSalary)} />
        <MiniStat label="Bonus" value={formatRupiah(employee.bonus)} tone="success" />
        <MiniStat label="Potongan" value={formatRupiah(employee.deduction)} tone="danger" />
        <MiniStat label="Total Gaji" value={formatRupiah(totalSalary)} />
      </div>

      <div className="mt-4 rounded-xl border border-[var(--brand-gold)]/25 bg-[var(--brand-gold)]/10 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--brand-gold-strong)]">
              Basis bonus
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {formatPlainNumber(metrics.transactions)} transaksi - {formatRupiah(metrics.revenue)}
            </p>
          </div>
          <CircleDollarSign className="h-5 w-5 text-[var(--brand-gold-strong)]" />
        </div>
      </div>

      <button
        type="button"
        disabled={employee.payrollStatus === "paid"}
        onClick={() => onPay(employee)}
        className="brand-button-primary mt-4 w-full rounded-xl disabled:cursor-not-allowed disabled:opacity-60"
      >
        Tandai Sudah Dibayar
      </button>
    </div>
  );
}

function LegacyPinSecurityModal({ request, onClose, onConfirm, requireCurrentPin = true }) {
  const { verifyPin } = useAuth();
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!request) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      if (request.kind === "reset-pin" && !/^[0-9]{4,8}$/.test(newPin)) {
        throw new Error("PIN baru harus berisi 4 sampai 8 digit angka.");
      }
      if (requireCurrentPin) {
        await verifyPin(pin);
      }
      await onConfirm({ ...request, newPin });
      setPin("");
      setNewPin("");
    } catch (err) {
      setError(err.message || "PIN belum sesuai.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="brand-success-popover w-full max-w-sm rounded-2xl border border-white/70 bg-white p-5 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-[var(--brand-gold)] shadow-lg">
            <LockKeyhole className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <h3 className="mt-4 text-xl font-black tracking-tight text-slate-950">Verifikasi PIN</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{request.message}</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          {requireCurrentPin ? (
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength="6"
              value={pin}
              onChange={(event) => {
                setPin(event.target.value.replace(/\D/g, ""));
                setError("");
              }}
              className="brand-input h-14 rounded-xl text-center font-mono text-2xl tracking-[0.46em]"
              placeholder="••••••"
              autoFocus
            />
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700">
              Proteksi PIN sedang nonaktif. Aksi owner bisa dilanjutkan tanpa PIN.
            </div>
          )}

          {requireCurrentPin ? (
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => setPin((current) => `${current}${digit}`.slice(0, 6))}
                className={`rounded-xl border border-slate-200 bg-slate-50 py-3 text-base font-black text-slate-800 transition hover:bg-[var(--brand-gold)]/10 ${
                  digit === "0" ? "col-start-2" : ""
                }`}
              >
                {digit}
              </button>
            ))}
          </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}

          {request.kind === "reset-pin" ? (
            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              PIN baru karyawan
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength="8"
                value={newPin}
                onChange={(event) => {
                  setNewPin(event.target.value.replace(/\D/g, ""));
                  setError("");
                }}
                className="brand-input rounded-xl text-center font-mono text-lg tracking-[0.24em]"
                placeholder="4-8 digit"
              />
            </label>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={onClose} className="brand-button-secondary rounded-xl">
              Batal
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                (requireCurrentPin && pin.length < 4) ||
                (request.kind === "reset-pin" && newPin.length < 4)
              }
              className="brand-button-primary rounded-xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Cek..." : "Konfirmasi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

LegacyPinSecurityModal.displayName = "LegacyPinSecurityModal";

const employeeFormFieldClass =
  "brand-input rounded-xl border-slate-200 bg-white transition-all duration-200 focus:border-gold-500 focus:ring-4 focus:ring-gold-500/10";
const employeeFormSelectClass =
  "brand-select rounded-xl border-slate-200 bg-white transition-all duration-200 focus:border-gold-500 focus:ring-4 focus:ring-gold-500/10";

function EmployeeFormSection({ icon: Icon, title, helper, children }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--brand-gold)]/20 bg-[var(--brand-gold)]/10 text-[var(--brand-gold-strong)]">
          <Icon className="h-5 w-5" strokeWidth={1.9} />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-950">{title}</h4>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{helper}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function PayrollAmountInput({ id, value, onChange, placeholder }) {
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      value={value === "" ? "" : formatRupiah(value)}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
      className={employeeFormFieldClass}
      placeholder={placeholder}
    />
  );
}

function EmployeeFormModal({ employee, onClose, onSave, submitting = false }) {
  const isEdit = Boolean(employee);
  const [errors, setErrors] = useState({});
  const [revealedFields, setRevealedFields] = useState({
    password: false,
    pin: false,
  });
  const [form, setForm] = useState({
    name: employee?.name || "",
    email: employee?.email || "",
    username: employee?.username || "",
    phone: employee?.phone === "-" ? "" : employee?.phone || "",
    role: employee?.role || "kasir",
    cashierStation: employee?.cashierStation || employee?.cashier_station || "",
    password: "",
    pin: "",
    baseSalary: String(employee?.baseSalary ?? 1800000),
    bonus: String(employee?.bonus ?? 0),
    deduction: String(employee?.deduction ?? 0),
  });

  const takeHomeEstimate = Math.max(
    0,
    Number(form.baseSalary || 0) + Number(form.bonus || 0) - Number(form.deduction || 0)
  );
  const passwordStrength = (() => {
    if (!form.password) return null;
    if (
      form.password.length >= 12 &&
      /[A-Z]/.test(form.password) &&
      /\d/.test(form.password) &&
      /[^A-Za-z0-9]/.test(form.password)
    ) {
      return { label: "Kuat", width: "w-full", color: "bg-emerald-500", text: "text-emerald-700" };
    }
    if (form.password.length >= 8) {
      return { label: "Cukup", width: "w-2/3", color: "bg-amber-400", text: "text-amber-700" };
    }
    return { label: "Lemah", width: "w-1/3", color: "bg-rose-400", text: "text-rose-600" };
  })();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !submitting) {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, submitting]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
  };

  const toggleRevealedField = (field) => {
    setRevealedFields((current) => ({ ...current, [field]: !current[field] }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Nama lengkap wajib diisi.";
    if (!form.username.trim()) nextErrors.username = "Username wajib diisi.";
    if (!isEdit && !form.email.trim()) nextErrors.email = "Email login wajib diisi.";
    if (!isEdit && form.password.length < 8) {
      nextErrors.password = "Password minimal 8 karakter.";
    }
    if (!isEdit && !/^[0-9]{4,8}$/.test(form.pin)) {
      nextErrors.pin = "PIN harus berisi 4 sampai 8 digit angka.";
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      showNotification("warning", "Periksa field bertanda sebelum menyimpan karyawan.");
      return;
    }

    setErrors({});
    onSave({
      id: employee?.id,
      name: form.name.trim(),
      email: form.email.trim(),
      username: form.username.trim(),
      password: form.password,
      phone: form.phone.trim(),
      role: form.role,
      cashierStation: form.cashierStation,
      pin: form.pin,
      baseSalary: Number(form.baseSalary || 0),
      defaultBonus: Number(form.bonus || 0),
      defaultDeduction: Number(form.deduction || 0),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-form-title"
        className="brand-success-popover flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200/60 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:max-w-3xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-br from-white to-amber-50/60 px-4 py-5 sm:px-7 sm:py-6">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-[var(--brand-gold)] shadow-sm">
              <UserRound className="h-5 w-5" strokeWidth={1.9} />
            </div>
            <div>
              <h3 id="employee-form-title" className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                {isEdit ? "Edit Karyawan" : "Tambah Karyawan"}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {isEdit
                  ? "Perbarui profil, akses, dan paket payroll karyawan."
                  : "Siapkan akses kerja dan profil payroll dalam satu alur onboarding."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm hover:border-slate-300 hover:text-slate-950"
            aria-label="Tutup form tambah karyawan"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="brand-scroll-region-y flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
            <EmployeeFormSection
              icon={LockKeyhole}
              title="Account Access"
              helper="Kredensial aman untuk login dan otorisasi tindakan operasional."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="employee-email" className="block text-sm font-semibold text-slate-700">
                    Email login
                  </label>
                  <input
                    id="employee-email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(event) => updateField("email", event.target.value)}
                    className={`${employeeFormFieldClass} ${errors.email ? "border-rose-300" : ""}`}
                    placeholder="kasir@rajaaksesoris.local"
                    disabled={isEdit}
                    aria-invalid={Boolean(errors.email)}
                  />
                  {errors.email ? <p className="text-xs font-semibold text-rose-600" role="alert">{errors.email}</p> : null}
                </div>
                <div className="space-y-2">
                  <label htmlFor="employee-username" className="block text-sm font-semibold text-slate-700">
                    Username
                  </label>
                  <input
                    id="employee-username"
                    autoComplete="username"
                    value={form.username}
                    onChange={(event) => updateField("username", event.target.value)}
                    className={`${employeeFormFieldClass} ${errors.username ? "border-rose-300" : ""}`}
                    placeholder="kasir.raja"
                    aria-invalid={Boolean(errors.username)}
                  />
                  {errors.username ? <p className="text-xs font-semibold text-rose-600" role="alert">{errors.username}</p> : null}
                </div>
                {!isEdit ? (
                  <>
                    <div className="space-y-2">
                      <label htmlFor="employee-password" className="block text-sm font-semibold text-slate-700">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          id="employee-password"
                          type={revealedFields.password ? "text" : "password"}
                          autoComplete="new-password"
                          value={form.password}
                          onChange={(event) => updateField("password", event.target.value)}
                          className={`${employeeFormFieldClass} pr-12 ${errors.password ? "border-rose-300" : ""}`}
                          placeholder="Minimal 8 karakter"
                          aria-invalid={Boolean(errors.password)}
                        />
                        <button
                          type="button"
                          onClick={() => toggleRevealedField("password")}
                          className="absolute inset-y-1 right-1 flex w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          aria-label={revealedFields.password ? "Sembunyikan password" : "Tampilkan password"}
                        >
                          {revealedFields.password ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {errors.password ? <p className="text-xs font-semibold text-rose-600" role="alert">{errors.password}</p> : null}
                      {passwordStrength ? (
                        <div className="flex items-center gap-2" aria-live="polite">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                            <div className={`h-full rounded-full ${passwordStrength.width} ${passwordStrength.color}`} />
                          </div>
                          <span className={`text-xs font-semibold ${passwordStrength.text}`}>{passwordStrength.label}</span>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">Minimal 8 karakter untuk keamanan akses.</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="employee-pin" className="block text-sm font-semibold text-slate-700">
                        PIN operasional
                      </label>
                      <div className="relative">
                        <input
                          id="employee-pin"
                          type={revealedFields.pin ? "text" : "password"}
                          inputMode="numeric"
                          autoComplete="new-password"
                          maxLength="8"
                          value={form.pin}
                          onChange={(event) => updateField("pin", event.target.value.replace(/\D/g, ""))}
                          className={`${employeeFormFieldClass} pr-12 ${errors.pin ? "border-rose-300" : ""}`}
                          placeholder="4-8 digit"
                          aria-invalid={Boolean(errors.pin)}
                        />
                        <button
                          type="button"
                          onClick={() => toggleRevealedField("pin")}
                          className="absolute inset-y-1 right-1 flex w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          aria-label={revealedFields.pin ? "Sembunyikan PIN" : "Tampilkan PIN"}
                        >
                          {revealedFields.pin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {errors.pin ? <p className="text-xs font-semibold text-rose-600" role="alert">{errors.pin}</p> : null}
                      <p className="text-xs text-slate-500">Dipakai untuk approval tindakan sensitif di kasir.</p>
                    </div>
                  </>
                ) : null}
              </div>
            </EmployeeFormSection>

            <EmployeeFormSection
              icon={UserRound}
              title="Personal Info"
              helper="Identitas yang akan dikenali tim pada shift dan laporan."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="employee-name" className="block text-sm font-semibold text-slate-700">
                    Nama lengkap
                  </label>
                  <input
                    id="employee-name"
                    autoComplete="name"
                    value={form.name}
                    onChange={(event) => updateField("name", event.target.value)}
                    className={`${employeeFormFieldClass} ${errors.name ? "border-rose-300" : ""}`}
                    placeholder="Nama lengkap karyawan"
                    aria-invalid={Boolean(errors.name)}
                  />
                  {errors.name ? <p className="text-xs font-semibold text-rose-600" role="alert">{errors.name}</p> : null}
                </div>
                <div className="space-y-2">
                  <label htmlFor="employee-phone" className="block text-sm font-semibold text-slate-700">
                    Nomor HP
                  </label>
                  <input
                    id="employee-phone"
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(event) => updateField("phone", event.target.value)}
                    className={employeeFormFieldClass}
                    placeholder="08xxxxxxxxxx"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="employee-role" className="block text-sm font-semibold text-slate-700">
                    Role
                  </label>
                  <select
                    id="employee-role"
                    value={form.role}
                    onChange={(event) => updateField("role", event.target.value)}
                    className={employeeFormSelectClass}
                  >
                    <option value="kasir">Kasir</option>
                    <option value="pemilik">Pemilik</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="employee-cashier-station" className="block text-sm font-semibold text-slate-700">
                    Pos Kasir
                  </label>
                  <select
                    id="employee-cashier-station"
                    value={form.cashierStation}
                    onChange={(event) => updateField("cashierStation", event.target.value)}
                    className={employeeFormSelectClass}
                  >
                    {cashierStationOptions.map((option) => (
                      <option key={option.value || "none"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </EmployeeFormSection>

            <EmployeeFormSection
              icon={Banknote}
              title="Payroll"
              helper="Nilai default untuk penggajian bulanan. Dapat diperbarui kemudian."
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <label htmlFor="employee-base-salary" className="block text-sm font-semibold text-slate-700">
                    Gaji pokok
                  </label>
                  <PayrollAmountInput
                    id="employee-base-salary"
                    value={form.baseSalary}
                    onChange={(value) => updateField("baseSalary", value)}
                    placeholder="Rp 1.800.000"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="employee-bonus" className="block text-sm font-semibold text-slate-700">
                    Bonus default
                  </label>
                  <PayrollAmountInput
                    id="employee-bonus"
                    value={form.bonus}
                    onChange={(value) => updateField("bonus", value)}
                    placeholder="Rp 0"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="employee-deduction" className="block text-sm font-semibold text-slate-700">
                    Potongan default
                  </label>
                  <PayrollAmountInput
                    id="employee-deduction"
                    value={form.deduction}
                    onChange={(value) => updateField("deduction", value)}
                    placeholder="Rp 0"
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-1 rounded-xl border border-[var(--brand-gold)]/20 bg-[var(--brand-gold)]/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold text-slate-600">Estimasi diterima per bulan</p>
                <p className="text-base font-black text-slate-950">{formatRupiah(takeHomeEstimate)}</p>
              </div>
            </EmployeeFormSection>
          </div>

          <div className="flex shrink-0 flex-row-reverse gap-3 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-7 sm:py-5">
            <button
              type="submit"
              disabled={submitting}
              className="brand-button-primary min-h-[52px] flex-1 sm:min-w-[196px] sm:flex-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Menyimpan..." : "Simpan Karyawan"}
            </button>
            <button type="button" onClick={onClose} className="brand-button-secondary min-h-[52px] border-transparent bg-transparent px-3 shadow-none sm:min-w-[108px]">
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DrawerEmptyState({ icon: Icon = FileText, title, helper }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <p className="mt-3 text-sm font-black text-slate-950">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
    </div>
  );
}

function DrawerLoading({ label = "Memuat data..." }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-600">
      <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-gold-strong)]" />
      {label}
    </div>
  );
}

function getActivityToneClass(tone) {
  if (tone === "danger") return "bg-rose-500";
  if (tone === "warning") return "bg-amber-500";
  if (tone === "success") return "bg-emerald-500";
  return "bg-slate-400";
}

const noteTypeOptions = [
  { value: "note", label: "Catatan", icon: StickyNote },
  { value: "warning", label: "Warning", icon: ShieldAlert },
  { value: "trusted", label: "Trusted", icon: CheckCircle2 },
];

function NoteTypeBadge({ type }) {
  const meta = {
    note: "border-slate-200 bg-slate-50 text-slate-600",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    trusted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  }[type || "note"];

  const label = noteTypeOptions.find((option) => option.value === type)?.label || "Catatan";
  return <Badge className={meta}>{label}</Badge>;
}

function EmployeeDrawer({
  employee,
  metrics,
  activeShift,
  performanceRows = [],
  onClose,
  onResetPin,
  onPay,
  onSavePermissions,
  onSaveNote,
  onRevokeSession,
}) {
  const employeeId = employee?.id || "";
  const [activeTab, setActiveTab] = useState("overview");
  const [savingPermission, setSavingPermission] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const activity = useEmployeeActivity(employeeId, Boolean(employeeId && activeTab === "activity"));
  const performance = useEmployeePerformance(employeeId, Boolean(employeeId && activeTab === "performance"));
  const access = useEmployeePermissions(employeeId, Boolean(employeeId && activeTab === "access"));
  const notes = useEmployeeNotes(employeeId, Boolean(employeeId && activeTab === "notes"));

  useEffect(() => {
    setActiveTab("overview");
    setSavingPermission("");
    setNoteType("note");
    setNoteDraft("");
  }, [employeeId]);

  if (!employee) return null;

  const lastSeenValue = employee.lastSeenAt || employee.lastLogin;
  const permissionGroups = access.groups || [];
  const permissionDataReady = access.loaded && !access.loading && !access.error;

  const handlePermissionToggle = async (permission) => {
    if (!permissionDataReady) {
      showNotification("warning", "Permission backend belum siap. Muat ulang akses sebelum mengubah.");
      return;
    }

    const nextValue = !permission.allowed;
    setSavingPermission(permission.key);
    try {
      await onSavePermissions(employee, { [permission.key]: nextValue });
      await access.refresh();
    } finally {
      setSavingPermission("");
    }
  };

  const handleSaveNote = async (event) => {
    event.preventDefault();
    const cleanNote = noteDraft.trim();
    if (!cleanNote) {
      showNotification("warning", "Isi catatan terlebih dahulu.");
      return;
    }

    setSavingNote(true);
    try {
      await onSaveNote(employee, noteType, cleanNote);
      setNoteDraft("");
      await notes.refresh();
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/45 backdrop-blur-[2px]">
      <button
        type="button"
        onClick={onClose}
        className="hidden flex-1 cursor-default lg:block"
        aria-label="Tutup detail karyawan"
      />
      <aside className="brand-success-popover h-full w-full overflow-hidden bg-white shadow-2xl sm:max-w-2xl xl:max-w-[720px]">
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200 bg-white/95 p-4 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar employee={employee} size="lg" />
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--brand-gold-strong)]">
                    Detail Karyawan
                  </p>
                  <h2 className="mt-1 truncate text-2xl font-black tracking-tight text-slate-950">
                    {employee.name}
                  </h2>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-500">
                    @{employee.username} - {getRoleLabel(employee.role)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-950"
                aria-label="Tutup drawer detail karyawan"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="brand-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
              {drawerTabs.map((tab) => {
                const Icon = tab.icon;
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-black transition ${
                      selected
                        ? "border-[var(--brand-gold)] bg-[var(--brand-gold)] text-slate-950 shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                    aria-pressed={selected}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="brand-scrollbar flex-1 overflow-y-auto p-4">
            {activeTab === "overview" ? (
              <div className="grid gap-4">
                <Panel className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-[var(--brand-gold)]/30 bg-[var(--brand-gold)]/10 text-[var(--brand-gold-strong)]">
                      {getRoleLabel(employee.role)}
                    </Badge>
                    <StatusBadge
                      status={employee.status}
                      lastSeenAt={lastSeenValue}
                      activityStatus={employee.activityStatus}
                    />
                    <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                      {employee.securityLevel}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MiniStat label="Nomor HP" value={employee.phone} />
                    <MiniStat label="Pos Kasir" value={employee.cashierStation || "Belum ditentukan"} />
                    <MiniStat label="Bergabung" value={formatDisplayDate(employee.joinedAt)} />
                    <MiniStat label="Shift aktif" value={activeShift ? "Aktif" : "Tidak aktif"} />
                    <MiniStat
                      label="Last seen"
                      value={lastSeenValue ? formatRelativeTime(lastSeenValue) : "Belum aktif"}
                    />
                  </div>
                </Panel>

                <Panel className="p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">Statistik hari ini</p>
                      <p className="text-xs text-slate-500">Ringkasan cepat untuk scan owner.</p>
                    </div>
                    <Activity className="h-5 w-5 text-[var(--brand-gold-strong)]" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <MiniStat label="Transaksi" value={formatPlainNumber(metrics.transactions)} />
                    <MiniStat label="Omzet" value={formatRupiah(metrics.revenue)} />
                    <MiniStat label="Refund" value={formatRupiah(metrics.refund)} tone="danger" />
                    <MiniStat label="Item" value={formatPlainNumber(metrics.items)} />
                  </div>
                </Panel>

                <Panel className="p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">Session & device</p>
                      <p className="text-xs text-slate-500">Soft revoke hanya memutus sesi aktif.</p>
                    </div>
                    <MonitorSmartphone className="h-5 w-5 text-slate-500" />
                  </div>
                  <div className="grid gap-3">
                    <MiniStat label="Device aktif" value={employee.device || "Belum tercatat"} />
                    <MiniStat
                      label="Route terakhir"
                      value={employee.activityStatus || employee.route || "Belum tercatat"}
                    />
                    <MiniStat
                      label="Mulai sesi"
                      value={employee.sessionStartedAt ? formatClock(employee.sessionStartedAt) : "-"}
                    />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => onResetPin(employee)}
                      className="brand-button-secondary rounded-xl"
                    >
                      <KeyRound className="h-4 w-4" />
                      Reset PIN
                    </button>
                    <button
                      type="button"
                      onClick={() => onRevokeSession(employee)}
                      disabled={!employee.sessionId || employee.revokedAt || employee.status === "offline"}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ShieldX className="h-4 w-4" />
                      Revoke session
                    </button>
                  </div>
                </Panel>
              </div>
            ) : null}

            {activeTab === "activity" ? (
              <Panel className="p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-950">Timeline aktivitas</p>
                    <p className="text-xs text-slate-500">Default 30 item, bounded dari audit server.</p>
                  </div>
                  <ReceiptText className="h-5 w-5 text-slate-500" />
                </div>
                {activity.loading ? <DrawerLoading label="Memuat timeline..." /> : null}
                {activity.error ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-semibold text-rose-700">
                    <p>{activity.error}</p>
                    <button
                      type="button"
                      onClick={() => void activity.refresh()}
                      className="brand-button-secondary mt-3 rounded-lg"
                    >
                      Coba lagi
                    </button>
                  </div>
                ) : null}
                {!activity.loading && !activity.error && !activity.rows.length ? (
                  <DrawerEmptyState
                    icon={Clock3}
                    title="Belum ada aktivitas"
                    helper="Aktivitas akan muncul dari audit, transaksi, shift, retur, dan session yang relevan."
                  />
                ) : null}
                <div className="grid gap-3">
                  {activity.rows.map((row) => (
                    <div key={row.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${getActivityToneClass(row.tone)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-black text-slate-950">{row.title}</p>
                          <span className="text-xs font-bold text-slate-500">
                            {formatDateTime(row.created_at, { timeStyle: "short" })}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{row.detail}</p>
                        <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">
                          {row.source}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {activity.hasMore ? (
                  <button
                    type="button"
                    onClick={activity.loadMore}
                    disabled={activity.loadingMore}
                    className="brand-button-secondary mt-4 w-full rounded-xl disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {activity.loadingMore ? "Memuat..." : `Load more (${activity.pageSize})`}
                  </button>
                ) : null}
              </Panel>
            ) : null}

            {activeTab === "performance" ? (
              <Panel className="p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-950">Performa karyawan</p>
                      <p className="text-xs text-slate-500">Ringkasan 7 hari tanpa grafik besar.</p>
                  </div>
                  <Gauge className="h-5 w-5 text-[var(--brand-gold-strong)]" />
                </div>
                {performance.loading ? <DrawerLoading label="Memuat performa..." /> : null}
                {performance.error ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-800">
                    {performance.error}
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Transaksi" value={formatPlainNumber(performance.data.summary.transactions || metrics.transactions)} />
                  <MiniStat label="Omzet" value={formatRupiah(performance.data.summary.revenue || metrics.revenue)} />
                  <MiniStat label="Avg trx" value={formatRupiah(performance.data.summary.avgTransaction)} />
                  <MiniStat label="Jam aktif" value={`${formatPlainNumber(performance.data.summary.activeHours)} jam`} />
                  <MiniStat label="Refund" value={formatPlainNumber(performance.data.summary.refundCount)} tone="danger" />
                  <MiniStat label="Void" value={formatPlainNumber(performance.data.summary.voidCount)} tone="danger" />
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                      Trend 7 hari
                    </p>
                    <div className="grid gap-2">
                      {(performance.data.trend.length ? performance.data.trend : performanceRows).slice(0, 7).map((row) => (
                        <div key={row.date} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-black text-slate-950">{formatDisplayDate(row.date)}</span>
                            <span className="font-bold text-emerald-700">{formatRupiah(row.revenue || 0)}</span>
                          </div>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {formatPlainNumber(row.transactions || 0)} transaksi
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                      Top produk
                    </p>
                    {performance.data.topProducts.length ? (
                      <div className="grid gap-2">
                        {performance.data.topProducts.map((item) => (
                          <div key={item.productName} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="truncate font-black text-slate-950">{item.productName}</span>
                              <span className="font-bold text-slate-600">{formatPlainNumber(item.qty)}x</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <DrawerEmptyState
                        icon={Box}
                        title="Belum ada top produk"
                        helper="Top produk dibatasi maksimal 5 item agar tetap ringan."
                      />
                    )}
                  </div>
                </div>
              </Panel>
            ) : null}

            {activeTab === "access" ? (
              <Panel className="p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-950">Akses per karyawan</p>
                    <p className="text-xs text-slate-500">Permission aktif ditampilkan setelah dibaca dari RPC backend.</p>
                  </div>
                  <ShieldCheck className="h-5 w-5 text-emerald-700" />
                </div>
                {access.loading ? <DrawerLoading label="Memuat permission..." /> : null}
                {access.error ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-semibold text-rose-700">
                    <p>{access.error}</p>
                    <button
                      type="button"
                      onClick={() => void access.refresh()}
                      className="brand-button-secondary mt-3 rounded-lg"
                    >
                      Coba lagi
                    </button>
                  </div>
                ) : null}
                {!access.loading && !access.error && !access.loaded ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-800">
                    <p>Akses belum dapat diverifikasi dari backend.</p>
                    <button
                      type="button"
                      onClick={() => void access.refresh()}
                      className="brand-button-secondary mt-3 rounded-lg"
                    >
                      Muat permission backend
                    </button>
                  </div>
                ) : null}
                {permissionDataReady ? <div className="grid gap-3">
                  {permissionGroups.map((group) => (
                    <div key={group.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="mb-3">
                        <p className="font-black text-slate-950">{group.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{group.helper}</p>
                      </div>
                      <div className="grid gap-2">
                        {group.permissions.map((permission) => (
                          <div
                            key={permission.key}
                            className="flex min-h-[58px] items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className={`truncate text-sm font-black ${permission.danger ? "text-rose-700" : "text-slate-950"}`}>
                                {permission.label}
                              </p>
                              <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500">
                                {permission.helper}
                              </p>
                            </div>
                            <SecurityToggle
                              checked={permission.allowed}
                              loading={savingPermission === permission.key}
                              disabled={!permissionDataReady}
                              onClick={() => handlePermissionToggle(permission)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div> : null}
              </Panel>
            ) : null}

            {activeTab === "payroll" ? (
              <div className="grid gap-4">
                <PayrollCard employee={employee} metrics={metrics} onPay={onPay} />
                <Panel className="p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">Komponen payroll</p>
                      <p className="text-xs text-slate-500">Ringkasan gaji, bonus, dan potongan bulan ini.</p>
                    </div>
                    <CircleDollarSign className="h-5 w-5 text-[var(--brand-gold-strong)]" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <MiniStat label="Gaji pokok" value={formatRupiah(employee.baseSalary)} />
                    <MiniStat label="Bonus" value={formatRupiah(employee.bonus)} tone="success" />
                    <MiniStat label="Potongan" value={formatRupiah(employee.deduction)} tone="danger" />
                    <MiniStat label="Status" value={payrollStatusMap[employee.payrollStatus]?.label || "Menunggu"} />
                  </div>
                </Panel>
              </div>
            ) : null}

            {activeTab === "notes" ? (
              <Panel className="p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-950">Catatan owner</p>
                    <p className="text-xs text-slate-500">Warning dan trusted note untuk evaluasi internal.</p>
                  </div>
                  <StickyNote className="h-5 w-5 text-slate-500" />
                </div>
                <form onSubmit={handleSaveNote} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {noteTypeOptions.map((option) => {
                      const Icon = option.icon;
                      const selected = noteType === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setNoteType(option.value)}
                          className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border text-sm font-black transition ${
                            selected
                              ? "border-[var(--brand-gold)] bg-white text-slate-950"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    className="brand-input mt-3 min-h-[92px] resize-none rounded-xl text-sm"
                    placeholder="Tulis catatan singkat untuk evaluasi staff."
                  />
                  <button
                    type="submit"
                    disabled={savingNote || !noteDraft.trim()}
                    className="brand-button-primary mt-3 w-full rounded-xl disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingNote ? "Menyimpan..." : "Simpan Catatan"}
                  </button>
                </form>

                <div className="mt-4 grid gap-2">
                  {notes.loading ? <DrawerLoading label="Memuat catatan..." /> : null}
                  {notes.error ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-semibold text-rose-700">
                      {notes.error}
                    </div>
                  ) : null}
                  {!notes.loading && !notes.notes.length ? (
                    <DrawerEmptyState
                      icon={StickyNote}
                      title="Belum ada catatan"
                      helper="Catatan owner akan muncul di sini, maksimal 20 catatan terbaru."
                    />
                  ) : null}
                  {notes.notes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <NoteTypeBadge type={note.note_type} />
                        <span className="text-xs font-semibold text-slate-500">
                          {formatDateTime(note.created_at, { timeStyle: "short" })}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-700">{note.note}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function EmployeeManagementPage() {
  const { user } = useAuth();
  const {
    coreError,
    coreLoading,
    staffUsers = [],
    activeShifts = [],
    shifts = [],
    accessoryTransactions = [],
    digitalTransactions = [],
    logisticsTransactions = [],
    customerReturns = [],
    employeePayrolls = [],
    pinRequiredEnabled = true,
    securityControls = {},
    createEmployee,
    updateEmployeeProfile,
    setEmployeeStatus,
    resetEmployeePin,
    saveEmployeePayroll,
    saveEmployeePermissions,
    saveEmployeeNote,
    revokeEmployeeSession,
    refreshShift,
    setSecurityControls,
  } = useEmployees();
  const { employeeRoster = [] } = useEmployeePresence();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [drawerEmployeeId, setDrawerEmployeeId] = useState("");
  const [menuEmployeeId, setMenuEmployeeId] = useState("");
  const [menuPosition, setMenuPosition] = useState(null);
  const [pinRequest, setPinRequest] = useState(null);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [securitySettingLoading, setSecuritySettingLoading] = useState("");
  const [expandedSecurityAction, setExpandedSecurityAction] = useState("");
  const [pendingSecurityDisable, setPendingSecurityDisable] = useState(null);
  const [clockTick, setClockTick] = useState(Date.now());
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!menuEmployeeId) return undefined;

    const closeMenu = () => {
      setMenuEmployeeId("");
      setMenuPosition(null);
    };

    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [menuEmployeeId]);

  const todayKey = normalizeDay(new Date());
  const seededEmployees = useMemo(
    () => buildEmployees(staffUsers, user, activeShifts, employeePayrolls, employeeRoster, clockTick),
    [activeShifts, clockTick, employeePayrolls, employeeRoster, staffUsers, user]
  );
  const employees = seededEmployees;

  const allTransactions = useMemo(
    () => [
      ...accessoryTransactions.map((row) => ({ ...row, source: "Aksesoris" })),
      ...digitalTransactions.map((row) => ({ ...row, source: "Digital" })),
      ...logisticsTransactions.map((row) => ({ ...row, source: "Logistik" })),
    ],
    [accessoryTransactions, digitalTransactions, logisticsTransactions]
  );

  const metricsByEmployee = useMemo(() => {
    const map = new Map(
      employees.map((employee) => [
        employee.id,
        {
          transactions: employee.todayTransactions || 0,
          revenue: employee.todayRevenue || 0,
          items: employee.todayItems || 0,
          digital: 0,
          refund: employee.todayRefund || 0,
        },
      ])
    );

    if (employees.some((employee) => employee.hasRosterMetrics)) {
      return map;
    }

    allTransactions
      .filter((transaction) => normalizeDay(transaction.created_at) === todayKey)
      .forEach((transaction) => {
        const metric = map.get(getCashierId(transaction));
        if (!metric) return;
        metric.transactions += 1;
        metric.revenue += getTransactionAmount(transaction);
        metric.items += getTransactionItems(transaction);
        metric.digital += transaction.source === "Digital" ? 1 : 0;
      });

    customerReturns
      .filter((row) => normalizeDay(row.created_at) === todayKey)
      .forEach((row) => {
        const metric = map.get(getCashierId(row));
        if (metric) metric.refund += Number(row.total_refund_amount || 0);
      });

    return map;
  }, [allTransactions, customerReturns, employees, todayKey]);

  const todaySales = useMemo(
    () => {
      if (employees.some((employee) => employee.hasRosterMetrics)) {
        return employees.reduce((sum, employee) => sum + Number(employee.todayRevenue || 0), 0);
      }

      return allTransactions
        .filter((transaction) => normalizeDay(transaction.created_at) === todayKey)
        .reduce((sum, transaction) => sum + getTransactionAmount(transaction), 0);
    },
    [allTransactions, employees, todayKey]
  );

  const onlineCount = useMemo(
    () => employees.filter((employee) => employee.sessionStatus === "online").length,
    [employees]
  );
  const idleCount = useMemo(
    () => employees.filter((employee) => employee.sessionStatus === "idle").length,
    [employees]
  );
  const pendingShiftCount = useMemo(
    () => shifts.filter((shift) => ["pending", "flagged"].includes(shift.status)).length,
    [shifts]
  );

  const filteredEmployees = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return employees.filter((employee) => {
      const matchesQuery =
        !normalizedQuery ||
        employee.name.toLowerCase().includes(normalizedQuery) ||
        employee.username.toLowerCase().includes(normalizedQuery);
      const matchesRole = roleFilter === "all" || employee.role === roleFilter;
      const matchesStatus = statusFilter === "all" || employee.status === statusFilter;
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [deferredQuery, employees, roleFilter, statusFilter]);
  const hasEmployeeFilters = Boolean(query.trim()) || roleFilter !== "all" || statusFilter !== "all";
  const filtersHideExistingEmployees = employees.length > 0 && hasEmployeeFilters;

  const drawerEmployee = employees.find((employee) => employee.id === drawerEmployeeId) || null;
  const editingEmployee = employees.find((employee) => employee.id === editingEmployeeId) || null;
  const drawerMetrics = drawerEmployee
    ? metricsByEmployee.get(drawerEmployee.id) || {
        transactions: 0,
        revenue: 0,
        items: 0,
        digital: 0,
        refund: 0,
      }
    : null;
  const drawerActiveShift = drawerEmployee
    ? activeShifts.find((shift) => shift.cashier_id === drawerEmployee.id)
    : null;
  const drawerPerformanceRows = drawerEmployee
    ? buildEmployeeDailyPerformance(drawerEmployee.id, allTransactions, customerReturns, shifts)
    : [];
  const menuEmployee = employees.find((employee) => employee.id === menuEmployeeId) || null;

  const closeEmployeeMenu = () => {
    setMenuEmployeeId("");
    setMenuPosition(null);
  };

  const openEmployeeMenu = (event, employeeId) => {
    event.stopPropagation();
    if (menuEmployeeId === employeeId) {
      closeEmployeeMenu();
      return;
    }

    setMenuEmployeeId(employeeId);
    setMenuPosition(getActionMenuPosition(event.currentTarget));
  };

  const openPinRequest = (kind, employee, label, options = {}) => {
    setPinRequest({
      kind,
      employeeId: employee?.id,
      employeeName: employee?.name,
      label,
      requireCurrentPin: options.requireCurrentPin,
      targetLabel: options.targetLabel,
      amount: options.amount,
      permissionLabel: options.permissionLabel,
      collectReason: options.collectReason,
      message:
        options.message ||
        (employee
          ? `${label} untuk ${employee.name} membutuhkan PIN operasional.`
          : `${label} membutuhkan PIN operasional.`),
    });
  };

  const handlePinConfirm = async (request) => {
    setActionLoading(true);
    try {
      const employee = employees.find((item) => item.id === request.employeeId);

      if (request.kind === "payroll") {
        await saveEmployeePayroll(request.employeeId, {
          periodMonth: new Date(),
          baseSalary: employee?.baseSalary || 0,
          bonus: employee?.bonus || 0,
          deduction: employee?.deduction || 0,
          status: "paid",
          notes: request.reason || "Ditandai lunas dari manajemen karyawan.",
        });
      showNotification("success", `Payroll ${request.employeeName} ditandai sudah dibayar.`);
      } else if (request.kind === "deactivate") {
        await setEmployeeStatus(
          request.employeeId,
          "inactive",
          request.reason || "Dinonaktifkan dari manajemen karyawan."
        );
      showNotification("success", `${request.employeeName} dinonaktifkan.`);
      } else if (request.kind === "activate") {
        await setEmployeeStatus(
          request.employeeId,
          "active",
          request.reason || "Diaktifkan dari manajemen karyawan."
        );
        showNotification("success", `${request.employeeName} diaktifkan.`);
      } else if (request.kind === "archive") {
        await setEmployeeStatus(
          request.employeeId,
          "archived",
          request.reason || "Diarsipkan dari manajemen karyawan."
        );
        showNotification("success", `${request.employeeName} diarsipkan.`);
      } else if (request.kind === "reset-pin") {
        await resetEmployeePin(request.employeeId, request.newPin);
        showNotification("success", `PIN ${request.employeeName} berhasil direset.`);
      } else if (request.kind === "revoke-session") {
        await revokeEmployeeSession(request.sessionId, request.reason || "Diputus dari manajemen karyawan.");
        showNotification("success", `Sesi ${request.employeeName} diputus.`);
      } else {
        showNotification("success", `${request.label} berhasil diverifikasi.`);
      }

      setPinRequest(null);
      setMenuEmployeeId("");
    } catch (error) {
      showNotification("error", error.message || "Aksi karyawan gagal.");
      throw error;
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEmployee = async (employee) => {
    setActionLoading(true);
    try {
      const savedEmployee = employee.id
        ? await updateEmployeeProfile(employee.id, employee)
        : await createEmployee(employee);
      setShowEmployeeForm(false);
      setEditingEmployeeId("");
      setDrawerEmployeeId(savedEmployee.id);
      showNotification("success", `${savedEmployee.nama || employee.name} disimpan.`);
    } catch (error) {
      showNotification("error", error.message || "Gagal menyimpan karyawan.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSavePermissions = async (employee, permissions) => {
    try {
      await saveEmployeePermissions(
        employee.id,
        permissions,
        `Akses ${employee.name} diperbarui dari drawer karyawan.`
      );
      showNotification("success", `Akses ${employee.name} diperbarui.`);
    } catch (error) {
      showNotification("error", error.message || "Gagal menyimpan akses karyawan.");
      throw error;
    }
  };

  const handleSaveNote = async (employee, noteType, note) => {
    try {
      await saveEmployeeNote(employee.id, noteType, note);
      showNotification("success", `Catatan ${employee.name} disimpan.`);
    } catch (error) {
      showNotification("error", error.message || "Gagal menyimpan catatan.");
      throw error;
    }
  };

  const requestRevokeSession = (employee) => {
    if (!employee?.sessionId) {
      showNotification("warning", "Tidak ada sesi aktif untuk diputus.");
      return;
    }

    setPinRequest({
      kind: "revoke-session",
      employeeId: employee.id,
      employeeName: employee.name,
      sessionId: employee.sessionId,
      label: "Revoke Session",
      targetLabel: employee.device || "Session aktif",
      collectReason: true,
      message: `Putuskan sesi aktif ${employee.name}. Kasir akan logout pada heartbeat berikutnya.`,
    });
  };

  const getSecurityControl = (actionId) =>
    securityControls[actionId] || { enabled: pinRequiredEnabled, requiredBy: "kasir_owner" };

  const updateSecurityControl = async (actionId, patch) => {
    const current = getSecurityControl(actionId);
    const nextControls = {
      ...securityControls,
      [actionId]: {
        ...current,
        ...patch,
      },
    };

    setSecuritySettingLoading(actionId);
    try {
      await setSecurityControls(nextControls);
      showNotification(
        "success",
        patch.enabled === false
          ? "Validasi PIN dinonaktifkan."
          : patch.enabled === true
            ? "Validasi PIN diaktifkan."
            : "Pengaturan akses diperbarui."
      );
    } catch (error) {
      showNotification("error", error.message || "Gagal mengubah kontrol keamanan.");
    } finally {
      setSecuritySettingLoading("");
    }
  };

  const requestSecurityToggle = (action) => {
    const control = getSecurityControl(action.id);
    if (control.enabled) {
      setPendingSecurityDisable(action);
      return;
    }
    updateSecurityControl(action.id, { enabled: true });
  };

  const confirmDisableSecurity = async () => {
    if (!pendingSecurityDisable) return;
    await updateSecurityControl(pendingSecurityDisable.id, { enabled: false });
    setPendingSecurityDisable(null);
  };

  const protectedActionCount = sensitiveActions.filter(
    (action) => getSecurityControl(action.id).enabled
  ).length;

  const summary = [
    {
      icon: Users,
      label: "Staff Online",
      value: `${formatPlainNumber(onlineCount)} Aktif`,
      helper: idleCount ? `${formatPlainNumber(idleCount)} idle perlu dipantau` : "Staff online sekarang",
      tone: onlineCount ? "success" : "warning",
    },
    {
      icon: UserRound,
      label: "Sedang Shift",
      value: `${formatPlainNumber(activeShifts.length)} Kasir`,
      helper: activeShifts.length ? "Kasir sedang shift" : "Tidak ada shift aktif",
      tone: "success",
    },
    {
      icon: Banknote,
      label: "Transaksi Staff Hari Ini",
      value: formatRupiah(todaySales),
      helper: `${formatPlainNumber(
        Array.from(metricsByEmployee.values()).reduce((sum, metric) => sum + metric.transactions, 0)
      )} transaksi staff`,
      tone: "info",
    },
    {
      icon: ShieldCheck,
      label: "Security Active",
      value: `${formatPlainNumber(protectedActionCount)}/${formatPlainNumber(sensitiveActions.length)} Aktif`,
      helper: pendingShiftCount ? `${formatPlainNumber(pendingShiftCount)} closing review` : "Kontrol keamanan aktif",
      tone: pendingShiftCount ? "warning" : "success",
    },
  ];

  const sensitiveActionsPanel = (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-[var(--brand-gold)]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-950">Keamanan Operasional</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Kontrol validasi PIN untuk aksi sensitif POS.
              </p>
            </div>
          </div>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-600">
          {protectedActionCount}/{sensitiveActions.length} aktif
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {sensitiveActions.map((action) => {
          const control = getSecurityControl(action.id);
          const Icon = action.icon;
          const expanded = expandedSecurityAction === action.id;
          const roleLabel =
            securityRoleOptions.find((option) => option.value === control.requiredBy)?.label ||
            "Kasir + Owner";

          return (
            <div
              key={action.id}
              className={`rounded-lg border bg-white transition hover:bg-slate-50 ${
                expanded ? "border-[var(--brand-gold)]/40 shadow-sm" : "border-slate-200"
              }`}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpandedSecurityAction(expanded ? "" : action.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setExpandedSecurityAction(expanded ? "" : action.id);
                  }
                }}
                className="flex min-h-[56px] w-full items-center gap-3 px-3 py-2 text-left"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    control.enabled
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-600"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-slate-950">
                    {action.label}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {action.helper}
                  </span>
                </span>
                <SecurityToggle
                  checked={control.enabled}
                  loading={securitySettingLoading === action.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    requestSecurityToggle(action);
                  }}
                />
              </div>

              {expanded ? (
                <div className="border-t border-slate-100 px-3 pb-3">
                  {!control.enabled ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                      Aksi ini dapat dilakukan tanpa validasi PIN.
                    </div>
                  ) : null}

                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <label className="block">
                      <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                        PIN Required By
                      </span>
                      <select
                        value={control.requiredBy}
                        onChange={(event) =>
                          updateSecurityControl(action.id, { requiredBy: event.target.value })
                        }
                        disabled={securitySettingLoading === action.id}
                        className="brand-select mt-1 h-10 rounded-xl text-sm"
                      >
                        {securityRoleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        openPinRequest("sensitive", null, action.label, {
                          requireCurrentPin: control.enabled,
                        })
                      }
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-700 transition hover:bg-white"
                    >
                      <KeyRound className="h-4 w-4" />
                      Test PIN
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2 py-1">{roleLabel}</span>
                    <span>Semua aksi tercatat di audit log.</span>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Panel>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            Manajemen Karyawan
          </h1>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Kelola staff operasional, akses kasir, shift, dan keamanan POS toko.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingEmployeeId("");
            setShowEmployeeForm(true);
          }}
          className="brand-button-primary rounded-xl shadow-[0_10px_22px_rgba(212,175,55,0.2)]"
        >
          <Plus className="h-4 w-4" />
          Tambah Karyawan
        </button>
      </div>

      <FeatureLoadPanel
        error={coreError}
        loading={coreLoading}
        loadingText="Sinkronisasi data karyawan..."
        onRetry={refreshShift}
      />

      <div className="brand-scrollbar flex gap-4 overflow-x-auto pb-1 lg:grid lg:grid-cols-4 lg:overflow-visible">
        {summary.map((item) => (
          <SummaryCard key={item.label} {...item} />
        ))}
      </div>

      <Panel className="overflow-visible">
          <div className="border-b border-slate-200 p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_170px_170px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="brand-input rounded-xl pl-10"
                  placeholder="Cari staff atau username"
                />
              </label>
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className="brand-select rounded-xl"
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="brand-select rounded-xl"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredEmployees.length ? (
            <>
              <div className="hidden md:block">
                <div className="brand-scrollbar overflow-x-auto">
                  <table className="brand-table min-w-[1180px] table-fixed">
                    <colgroup>
                      <col className="w-[24%]" />
                      <col className="w-[16%]" />
                      <col className="w-[12%]" />
                      <col className="w-[11%]" />
                      <col className="w-[14%]" />
                      <col className="w-[11%]" />
                      <col className="w-[12%]" />
                      <col className="w-[5%]" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="px-4 py-2.5">Staff</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Shift</th>
                        <th className="px-4 py-2.5">Station</th>
                        <th className="px-4 py-2.5">Sales Today</th>
                        <th className="px-4 py-2.5">Device</th>
                        <th className="px-4 py-2.5">Last Seen</th>
                        <th className="brand-table-action-cell px-4 py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredEmployees.map((employee) => {
                        const metrics = metricsByEmployee.get(employee.id) || {
                          transactions: 0,
                          revenue: 0,
                          items: 0,
                          digital: 0,
                          refund: 0,
                        };
                        const isMenuOpen = menuEmployeeId === employee.id;
                        const deviceLabel = splitDeviceLabel(employee.device);
                        const lastSeenValue = employee.lastSeenAt || employee.lastLogin;

                        return (
                          <tr
                            key={employee.id}
                            className="group h-[64px] transition hover:bg-[var(--brand-gold)]/5"
                          >
                            <td className="px-4 py-2.5">
                              <LiveStaffCell
                                employee={employee}
                                onClick={() => setDrawerEmployeeId(employee.id)}
                              />
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center">
                                <StatusBadge
                                  status={employee.status}
                                  lastSeenAt={lastSeenValue}
                                  now={clockTick}
                                  activityStatus={employee.activityStatus}
                                />
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              <p className="font-black text-slate-900">{getRoleLabel(employee.role)}</p>
                              <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                                {employee.shift}
                              </p>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-700">
                                {employee.cashierStation || "Belum ditentukan"}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <p className="font-black text-slate-950">{formatRupiah(metrics.revenue)}</p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {formatPlainNumber(metrics.transactions)} transaksi
                              </p>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="truncate" title={employee.deviceFull}>
                                <p className="truncate font-bold text-slate-800">{deviceLabel.browser}</p>
                                <span className="text-xs font-semibold text-slate-500">
                                  {deviceLabel.os || "Device"}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              <p className="font-bold text-slate-800">{formatClock(lastSeenValue)}</p>
                              <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                                {formatRelativeTime(lastSeenValue, clockTick)}
                              </p>
                            </td>
                            <td className="brand-table-action-cell px-4 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={(event) => openEmployeeMenu(event, employee.id)}
                                className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border bg-white text-slate-500 shadow-sm hover:text-slate-950 ${
                                  isMenuOpen
                                    ? "border-[var(--brand-gold)]/40 bg-[var(--brand-gold)]/10 text-slate-950"
                                    : "border-slate-200"
                                }`}
                                aria-label={`Menu aksi ${employee.name}`}
                                aria-expanded={isMenuOpen}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col gap-3 p-3 md:hidden">
                {filteredEmployees.map((employee) => {
                  const metrics = metricsByEmployee.get(employee.id) || {
                    transactions: 0,
                    revenue: 0,
                    items: 0,
                    digital: 0,
                    refund: 0,
                  };
                  const deviceLabel = splitDeviceLabel(employee.device);
                  const lastSeenValue = employee.lastSeenAt || employee.lastLogin;

                  return (
                    <button
                      key={employee.id}
                      type="button"
                      onClick={() => setDrawerEmployeeId(employee.id)}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-[var(--brand-gold)]/40"
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative shrink-0">
                          <Avatar employee={employee} />
                          <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5">
                            <LiveDot status={employee.sessionStatus} />
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-black text-slate-950">{employee.name}</p>
                              <p className="mt-1 truncate text-xs font-medium text-slate-500">
                                @{employee.username}
                              </p>
                            </div>
                            <StatusBadge
                              status={employee.status}
                              lastSeenAt={lastSeenValue}
                              now={clockTick}
                              activityStatus={employee.activityStatus}
                            />
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <MiniStat label="Role" value={getRoleLabel(employee.role)} />
                            <MiniStat label="Station" value={employee.cashierStation || "Belum"} />
                            <MiniStat label="Penjualan" value={formatRupiah(metrics.revenue)} />
                          </div>
                          <p className="mt-2 truncate text-xs font-semibold text-slate-500">
                            {deviceLabel.browser}
                            {deviceLabel.os ? ` \u00b7 ${deviceLabel.os}` : ""}{" \u00b7 "}
                            {formatRelativeTime(lastSeenValue, clockTick)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex min-h-[180px] flex-col items-center justify-center p-5 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--brand-gold)]/15 text-[var(--brand-gold-strong)]">
                <Users className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <h3 className="mt-3 text-base font-black text-slate-950">
                {filtersHideExistingEmployees ? "Tidak ada hasil filter" : "Belum ada karyawan"}
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                {filtersHideExistingEmployees
                  ? "Coba ubah pencarian atau reset filter untuk menampilkan karyawan yang sudah terdaftar."
                  : "Tambahkan kasir pertama untuk mulai memantau shift, payroll, dan aktivitas toko."}
              </p>
              {filtersHideExistingEmployees ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setRoleFilter("all");
                    setStatusFilter("all");
                  }}
                  className="brand-button-secondary mt-4 rounded-xl"
                >
                  Reset filter
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingEmployeeId("");
                    setShowEmployeeForm(true);
                  }}
                  className="brand-button-primary mt-4 rounded-xl"
                >
                  <Plus className="h-4 w-4" />
                  Tambah Karyawan
                </button>
              )}
            </div>
          )}
      </Panel>

      {sensitiveActionsPanel}

      {menuEmployee && menuPosition ? (
        <>
          <div className="fixed inset-0 z-40" onClick={closeEmployeeMenu} />
          <div
            className="fixed z-50 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-[0_18px_42px_rgba(15,23,42,0.16)]"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
              width: `${menuPosition.width}px`,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setDrawerEmployeeId(menuEmployee.id);
                closeEmployeeMenu();
              }}
              className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Lihat detail
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingEmployeeId(menuEmployee.id);
                setShowEmployeeForm(true);
                closeEmployeeMenu();
              }}
              className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                openPinRequest("reset-pin", menuEmployee, "Reset PIN");
                closeEmployeeMenu();
              }}
              className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset PIN
            </button>
            <button
              type="button"
              onClick={() => {
                openPinRequest(
                  menuEmployee.accountStatus === "active" ? "deactivate" : "activate",
                  menuEmployee,
                  menuEmployee.accountStatus === "active" ? "Nonaktifkan" : "Aktifkan"
                );
                closeEmployeeMenu();
              }}
              className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              {menuEmployee.accountStatus === "active" ? "Nonaktifkan" : "Aktifkan"}
            </button>
            <button
              type="button"
              onClick={() => {
                openPinRequest("archive", menuEmployee, "Arsipkan");
                closeEmployeeMenu();
              }}
              className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Arsipkan
            </button>
          </div>
        </>
      ) : null}

      <EmployeeDrawer
        employee={drawerEmployee}
        metrics={
          drawerMetrics || { transactions: 0, revenue: 0, items: 0, digital: 0, refund: 0 }
        }
        activeShift={drawerActiveShift}
        performanceRows={drawerPerformanceRows}
        onClose={() => setDrawerEmployeeId("")}
        onResetPin={(employee) => openPinRequest("reset-pin", employee, "Reset PIN")}
        onPay={(employee) => openPinRequest("payroll", employee, "Pembayaran payroll")}
        onSavePermissions={handleSavePermissions}
        onSaveNote={handleSaveNote}
        onRevokeSession={requestRevokeSession}
      />

      <SecurityActionModal
        request={pinRequest}
        onClose={() => setPinRequest(null)}
        onConfirm={handlePinConfirm}
        requireCurrentPin={pinRequest?.requireCurrentPin ?? pinRequiredEnabled}
        loading={actionLoading}
      />

      <DisableSecurityModal
        action={pendingSecurityDisable}
        onCancel={() => setPendingSecurityDisable(null)}
        onConfirm={confirmDisableSecurity}
        loading={
          pendingSecurityDisable ? securitySettingLoading === pendingSecurityDisable.id : false
        }
      />

      {showEmployeeForm ? (
        <EmployeeFormModal
          employee={editingEmployee}
          submitting={actionLoading}
          onClose={() => {
            setShowEmployeeForm(false);
            setEditingEmployeeId("");
          }}
          onSave={handleSaveEmployee}
        />
      ) : null}
    </div>
  );
}

