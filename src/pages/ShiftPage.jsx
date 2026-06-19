import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import FeatureLoadPanel from "../components/FeatureLoadPanel";
import PageHeader from "../components/app/PageHeader";
import Panel from "../components/app/Panel";
import { useAuth } from "../contexts/useAuth";
import { showNotification } from "../contexts/NotificationContext";
import { useShift } from "../hooks/useShift";
import { useWallet } from "../hooks/useWallet";
import {
  canCloseShift,
  canOpenShift,
  CASHIER_STATIONS,
  SHIFT_TYPES,
  getShiftStatusLabel,
} from "../utils/shift";
import { formatDateTime, formatRupiah } from "../utils/format";
import CurrencyInput from "../components/CurrencyInput";
import { getMoneySaveFailureMessage } from "../core/money/moneyRetry";
import {
  getDifferenceClass,
  getDigitalBreakdownRows,
  getStatusBadgeClass,
  getWalletBalanceMap,
  formatDigitalMethodLabel,
  orderedDigitalMethods,
} from "../features/shift/utils/shiftPresentation";

function getWalletBalanceRows(walletBalances = []) {
  const walletMap = new Map(walletBalances.map((wallet) => [wallet.id, wallet]));
  const walletIds = [
    ...orderedDigitalMethods,
    ...walletBalances
      .map((wallet) => wallet.id)
      .filter((id) => id !== "cash" && !orderedDigitalMethods.includes(id)),
  ];

  return [...new Set(walletIds)]
    .map((id) => {
      const wallet = walletMap.get(id);
      return {
        id,
        label: wallet?.name || formatDigitalMethodLabel(id),
        balance: Number(wallet?.balance || 0),
      };
    })
    .filter((row) => row.id !== "cash");
}

function SummaryItem({ label, value, emphasize = false, className = "" }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-2 ${emphasize ? "text-2xl font-black" : "text-lg font-bold"} text-slate-950`}>
        {value}
      </p>
    </div>
  );
}

function getShiftDurationLabel(shift) {
  const startTime = new Date(shift?.start_time || shift?.created_at || 0).getTime();
  const endTime = shift?.end_time ? new Date(shift.end_time).getTime() : Date.now();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return "-";
  }
  const totalMinutes = Math.max(1, Math.round((endTime - startTime) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} menit`;
  return minutes ? `${hours}j ${minutes}m` : `${hours}j`;
}

function WalletBalanceSnapshotCard({ walletBalances = [], className = "" }) {
  const rows = getWalletBalanceRows(walletBalances);
  const total = rows.reduce((sum, row) => sum + row.balance, 0);

  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50 px-5 py-5 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-700">Saldo Aplikasi</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{formatRupiah(total)}</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
          Tetap
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-600">{row.label}</span>
            <span
              className={`font-semibold ${row.balance < 0 ? "text-rose-600" : "text-slate-950"}`}
            >
              {formatRupiah(row.balance)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Link to="/saldo" className="brand-button-secondary inline-flex px-3 py-2 text-xs">
          Buka Saldo Aplikasi
        </Link>
      </div>
    </div>
  );
}

function DigitalPaymentBreakdownCard({ shift, walletBalances = [], className = "" }) {
  const walletBalanceMap = getWalletBalanceMap(walletBalances);
  const rows = getDigitalBreakdownRows(shift, { includeKnownMethods: true }).map((row) => ({
    ...row,
    walletBalance: walletBalanceMap[row.method] || 0,
  }));
  const totalWalletBalance = rows.reduce((sum, row) => sum + row.walletBalance, 0);

  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Saldo aplikasi digital
          </p>
          <p className="mt-2 text-lg font-bold text-slate-950">
            {formatRupiah(totalWalletBalance)}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="grid grid-cols-[1fr_auto] gap-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
          <span>Platform</span>
          <span className="text-right">Saldo aplikasi</span>
        </div>
        {rows.map((row) => (
          <div key={row.method} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
            <span className="text-slate-600">{row.label}</span>
            <span
              className={`text-right font-semibold ${
                row.walletBalance < 0 ? "text-rose-600" : "text-slate-700"
              }`}
            >
              {formatRupiah(row.walletBalance)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Link to="/saldo" className="brand-button-secondary inline-flex px-3 py-2 text-xs">
          Buka Saldo Aplikasi
        </Link>
      </div>
    </div>
  );
}

function DigitalPaymentBreakdownInline({ shift }) {
  const rows = getDigitalBreakdownRows(shift);
  const total = Number(shift?.total_digital || 0);

  return (
    <div className="min-w-44">
      <p className="font-semibold text-slate-950">{formatRupiah(total)}</p>
      {rows.length ? (
        <div className="mt-1 space-y-1 text-xs text-slate-500">
          {rows.map((row) => (
            <p key={row.method} className="flex items-center justify-between gap-3">
              <span>{row.label}</span>
              <span>{formatRupiah(row.amount)}</span>
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-slate-500">Tidak ada pembayaran digital</p>
      )}
    </div>
  );
}

export default function ShiftPage() {
  const location = useLocation();
  const { user } = useAuth();
  const {
    coreError,
    coreLoading,
    shifts,
    activeShifts = [],
    currentShift,
    selectedCashier,
    selectedCashierId,
    setSelectedCashierId,
    cashierUsers,
    pinRequiredEnabled = true,
    startShift,
    closeShift,
    refreshShift,
    reviewShift,
  } = useShift();
  const { walletBalances } = useWallet();
  const [actualCash, setActualCash] = useState("");
  const [notes, setNotes] = useState("");
  const [pin, setPin] = useState("");
  const [selectedCashierStation, setSelectedCashierStation] = useState("");
  const [selectedShiftType, setSelectedShiftType] = useState("Pagi");
  const [submitting, setSubmitting] = useState(false);
  const submissionRef = useRef(false);
  const [reviewNotes, setReviewNotes] = useState({});
  const [correctionTargetId, setCorrectionTargetId] = useState(null);
  const [approvalRequest, setApprovalRequest] = useState(null);

  const isOwner = user?.role === "pemilik";
  const canOpenNow = canOpenShift(user?.role);
  const canCloseNow = canCloseShift(user?.role);
  const expectedCash = Number(currentShift?.expected_cash || 0);
  const difference = actualCash === "" ? null : Number(actualCash || 0) - expectedCash;

  const pendingShifts = useMemo(
    () => shifts.filter((shift) => shift.status === "pending" || shift.status === "flagged"),
    [shifts]
  );
  const activeStationCount = useMemo(
    () => new Set(activeShifts.map((shift) => shift.cashier_station).filter(Boolean)).size,
    [activeShifts]
  );
  const overtimeShiftCount = useMemo(
    () => activeShifts.filter((shift) => shift.shift_type === "Lembur").length,
    [activeShifts]
  );
  const drilldownRisk = new URLSearchParams(location.search).get("risk");
  const shiftHistory = useMemo(
    () => shifts.filter((shift) => shift.status !== "active").slice(0, 10),
    [shifts]
  );
  const correctionTarget = useMemo(
    () => shifts.find((shift) => shift.id === correctionTargetId) || null,
    [correctionTargetId, shifts]
  );

  useEffect(() => {
    if (currentShift) return;
    const defaultStation = selectedCashier?.cashier_station || selectedCashier?.station_name || "";
    setSelectedCashierStation((current) => current || defaultStation);
  }, [currentShift, selectedCashier]);

  const showWhatsappStatus = (shift, label) => {
    if (shift?.whatsapp_notification?.held) {
      showNotification("info", `Notifikasi WhatsApp ${label} sedang di-hold sementara.`);
      return;
    }

    if (shift?.whatsapp_notification?.ok === false) {
      showNotification(
        "warning",
        `Shift sudah dicatat, tapi WhatsApp ${label} belum terkirim: ${shift.whatsapp_notification.error}`
      );
    }
  };

  const handleOpenShift = async () => {
    if (submissionRef.current) return;
    submissionRef.current = true;
    setSubmitting(true);
    try {
      const shift = await startShift({
        cashierId: selectedCashierId,
        cashierStation: selectedCashierStation,
        shiftType: selectedShiftType,
      });
      setActualCash("");
      setNotes("");
      setPin("");
      showNotification(
        "success",
        `Shift ${shift.cashier_name || selectedCashier?.nama || "kasir"} di ${shift.cashier_station || selectedCashierStation} sudah dimulai.`
      );
      showWhatsappStatus(shift, "opening");
    } catch (error) {
      showNotification("error", error.message || "Gagal memulai shift.");
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  };

  const handleCloseShift = async () => {
    if (submissionRef.current) return;
    submissionRef.current = true;
    setSubmitting(true);
    try {
      const shift = await closeShift({
        shiftId: currentShift?.id,
        cashierId: selectedCashierId,
        actual_cash: Number(actualCash || 0),
        notes,
        pin,
      });
      setActualCash("");
      setNotes("");
      setPin("");
      showNotification(
        "success",
        `Closing shift sudah dicatat. Statusnya ${getShiftStatusLabel(shift.status).toLowerCase()}.`
      );
      showWhatsappStatus(shift, "closing");
    } catch (error) {
      showNotification(
        "error",
        getMoneySaveFailureMessage(error, "Gagal menutup shift.")
      );
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  };

  const handleReviewShift = async (shiftId, decision) => {
    setSubmitting(true);
    try {
      const shift = await reviewShift({
        shiftId,
        decision,
        notes: reviewNotes[shiftId] || "",
      });
      setReviewNotes((prev) => ({ ...prev, [shiftId]: "" }));
      showNotification(
        "success",
        `Shift ${shift.cashier_name || "kasir"} sekarang ${getShiftStatusLabel(shift.status).toLowerCase()}.`
      );
      return shift;
    } catch (error) {
      showNotification("error", error.message || "Gagal memproses shift.");
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  const requestReviewShift = (shift, decision) => {
    if (decision === "approved_with_correction" && !String(reviewNotes[shift.id] || "").trim()) {
      showNotification("warning", "Catatan pemilik toko wajib diisi untuk koreksi selisih.");
      return;
    }

    if (decision === "flagged" && !String(reviewNotes[shift.id] || "").trim()) {
      showNotification("warning", "Catatan pemilik toko wajib diisi saat shift ditandai perlu dicek.");
      return;
    }

    setApprovalRequest({
      shiftId: shift.id,
      cashierName: shift.cashier_name,
      cashierStation: shift.cashier_station,
      shiftType: shift.shift_type,
      duration: getShiftDurationLabel(shift),
      cash: shift.total_cash,
      digital: shift.total_digital,
      decision,
      difference: Number(shift.difference || 0),
    });
  };

  const confirmOwnerApproval = async () => {
    if (!approvalRequest) return;

    setSubmitting(true);
    try {
      const reviewedShift = await handleReviewShift(approvalRequest.shiftId, approvalRequest.decision);
      if (!reviewedShift) return;
      setApprovalRequest(null);
      setCorrectionTargetId(null);
    } catch (error) {
      showNotification("error", error.message || "Approval shift belum berhasil.");
    } finally {
      setSubmitting(false);
    }
  };

  const openCorrectionModal = (shift) => {
    if (Number(shift.difference || 0) === 0) {
      showNotification("warning", "Selisih harus tidak nol untuk setujui dengan koreksi.");
      return;
    }

    if (!String(reviewNotes[shift.id] || "").trim()) {
      showNotification("warning", "Catatan pemilik toko wajib diisi untuk setujui dengan koreksi.");
      return;
    }

    setCorrectionTargetId(shift.id);
  };

  const confirmCorrectionApproval = async () => {
    if (!correctionTarget) return;
    requestReviewShift(correctionTarget, "approved_with_correction");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Shift"
        title="Buka dan tutup shift"
        description="Buka shift saat mulai kerja, tutup setelah kas dihitung, lalu pemilik toko tinggal cek hasilnya."
        icon="receipt"
      />

      <FeatureLoadPanel
        error={coreError}
        loading={coreLoading}
        loadingText="Sinkronisasi data shift..."
        onRetry={refreshShift}
      />

      <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <Panel className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Kasir yang bertugas
          </p>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-slate-950">
            {selectedCashier?.nama || "Belum ada kasir"}
          </h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            {isOwner
              ? "Owner bisa pilih kasir dan membuka shift kapan saja bila operasional toko perlu dibantu."
              : "Kasir hanya bisa membuka shift setelah jam 07:00 dan menutup shift setelah jam 20:00."}
          </p>

          {isOwner ? (
            <div className="mt-5">
              <label className="mb-2 block text-sm font-semibold text-slate-700">Kasir</label>
              <select
                value={selectedCashierId}
                onChange={(event) => {
                  setSelectedCashierId(event.target.value);
                  const nextCashier = cashierUsers.find((cashier) => cashier.id === event.target.value);
                  setSelectedCashierStation(nextCashier?.cashier_station || nextCashier?.station_name || "");
                }}
                className="brand-select h-14 text-base"
              >
                {cashierUsers.map((cashier) => (
                  <option key={cashier.id} value={cashier.id} className="bg-white text-slate-950">
                    {cashier.nama}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Pos Kasir</label>
              <select
                value={selectedCashierStation}
                onChange={(event) => setSelectedCashierStation(event.target.value)}
                className="brand-select h-14 text-base"
                disabled={Boolean(currentShift)}
              >
                <option value="">Belum ditentukan</option>
                {CASHIER_STATIONS.map((station) => (
                  <option key={station} value={station} className="bg-white text-slate-950">
                    {station}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Jenis Shift</label>
              <select
                value={selectedShiftType}
                onChange={(event) => setSelectedShiftType(event.target.value)}
                className="brand-select h-14 text-base"
                disabled={Boolean(currentShift)}
              >
                {SHIFT_TYPES.map((shiftType) => (
                  <option key={shiftType} value={shiftType} className="bg-white text-slate-950">
                    {shiftType}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <SummaryItem label="Opening cash laci" value="Rp 0" emphasize />
            <SummaryItem
              label="Status sekarang"
              value={currentShift ? getShiftStatusLabel(currentShift.status) : "Belum mulai"}
            />
            <SummaryItem label="Kasir Aktif" value={String(activeShifts.length)} />
            <SummaryItem label="Station Aktif" value={String(activeStationCount)} />
            <SummaryItem label="Pending Closing" value={String(pendingShifts.length)} />
            <SummaryItem label="Lembur" value={String(overtimeShiftCount)} />
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-950">Aturan waktu</p>
            <div className="mt-3 space-y-2">
              <p>
                Mulai shift: {isOwner ? "owner bisa kapan saja, kasir setelah jam 07:00" : "setelah jam 07:00"}
              </p>
              <p>
                Closing shift: {isOwner ? "owner bisa kapan saja, kasir setelah jam 20:00" : "setelah jam 20:00"}
              </p>
              <p>Lewat jam 05:00 WIB, shift perlu dibuka ulang</p>
            </div>
          </div>
        </Panel>

        <Panel variant="strong" className="p-6">
          {!currentShift ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand-gold)]">
                Opening Shift
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-950">
                Siap mulai kerja
              </h2>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-[var(--brand-gold)]/20 bg-white px-5 py-5">
                  <p className="text-sm font-semibold text-slate-700">Cash laci shift</p>
                  <p className="mt-2 text-4xl font-black text-slate-950">Rp 0</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Yang mulai dari nol hanya cash saat opening.
                  </p>
                </div>
                <WalletBalanceSnapshotCard walletBalances={walletBalances} />
              </div>

              {!canOpenNow ? (
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                  Shift kasir hanya bisa dimulai setelah jam 07:00
                </p>
              ) : null}
              {!selectedCashierStation ? (
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                  Pos kasir wajib dipilih sebelum shift dibuka.
                </p>
              ) : null}

              <button
                type="button"
                onClick={handleOpenShift}
                disabled={submitting || !selectedCashier || !selectedCashierStation || !canOpenNow}
                className="brand-button-success mt-6 h-16 w-full text-lg disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Membuka shift..." : "Mulai Shift"}
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand-gold)]">
                    Shift Aktif
                  </p>
                  <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-950">
                    Tutup shift saat kas sudah dihitung
                  </h2>
                </div>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getStatusBadgeClass(
                    currentShift.status
                  )}`}
                >
                  {getShiftStatusLabel(currentShift.status)}
                </span>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <SummaryItem label="Kasir" value={currentShift.cashier_name} />
                <SummaryItem label="Station" value={currentShift.cashier_station || "-"} />
                <SummaryItem label="Shift" value={currentShift.shift_type || "-"} />
                <SummaryItem
                  label="Mulai"
                  value={formatDateTime(currentShift.start_time, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                />
                <SummaryItem label="Durasi" value={getShiftDurationLabel(currentShift)} />
                <SummaryItem label="Transaksi" value={String(currentShift.total_transactions || 0)} />
                <SummaryItem label="Item" value={String(currentShift.total_items || 0)} />
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.35fr_1fr]">
                <SummaryItem label="Cash tercatat" value={formatRupiah(currentShift.total_cash || 0)} />
                <DigitalPaymentBreakdownCard shift={currentShift} walletBalances={walletBalances} />
                <SummaryItem
                  label="Expected cash"
                  value={formatRupiah(currentShift.expected_cash || 0)}
                />
              </div>

              {!canCloseNow && !isOwner ? (
                <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                  Kasir hanya bisa closing setelah jam 20:00
                </p>
              ) : null}

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Actual cash
                  </label>
                  <CurrencyInput
                    value={actualCash}
                    onChange={(value) => setActualCash(value)}
                    className="brand-input h-14 text-lg"
                    placeholder="Masukkan uang cash fisik"
                  />
                </div>
                <div className={`rounded-lg border px-4 py-4 ${getDifferenceClass(difference)}`}>
                  <p className="text-sm font-semibold">Selisih</p>
                  <p className="mt-2 text-2xl font-black">
                    {difference === null ? formatRupiah(0) : formatRupiah(difference)}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Catatan
                  </label>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="brand-textarea"
                    rows={4}
                    placeholder="Contoh: ada selisih kecil, pemilik toko bantu closing, atau shift sepi."
                  />
                </div>
                {!isOwner && pinRequiredEnabled ? (
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      PIN konfirmasi
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength="8"
                      value={pin}
                      onChange={(event) => setPin(event.target.value)}
                      className="brand-input h-14 text-lg"
                      placeholder="Masukkan PIN"
                    />
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handleCloseShift}
                disabled={
                  submitting ||
                  actualCash === "" ||
                  (!isOwner && pinRequiredEnabled && !pin.trim()) ||
                  (!canCloseNow && !isOwner)
                }
                className="brand-button-primary mt-6 h-16 w-full text-lg disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Menyimpan closing..." : "Tutup Shift"}
              </button>
            </>
          )}
        </Panel>
      </div>

      <Panel className="p-6">
        <div className="mb-5 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Kasir Aktif Saat Ini
            </p>
            <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-slate-950">
              {activeShifts.length ? `${activeShifts.length} Kasir Aktif` : "Belum ada kasir aktif"}
            </h2>
          </div>
          <span className="brand-badge-success">{activeStationCount} station aktif</span>
        </div>
        {activeShifts.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeShifts.map((shift) => (
              <div key={shift.id} className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{shift.cashier_name || "Kasir"}</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-700">
                      {shift.cashier_station || "Station belum dipilih"}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700">
                    Aktif
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  {formatDateTime(shift.start_time, { timeStyle: "short" })} - sekarang
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Shift {shift.shift_type || "-"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Buka shift untuk menampilkan kasir aktif.
          </div>
        )}
      </Panel>

      {isOwner ? (
        <Panel className="p-6">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Approval Owner
            </p>
            <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-slate-950">
              Shift yang menunggu dicek
            </h2>
            {drilldownRisk === "mismatch" ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                Drilldown alert aktif: prioritaskan shift dengan selisih besar sebelum approval.
              </p>
            ) : null}
          </div>

          {pendingShifts.length ? (
            <div className="space-y-4">
              {pendingShifts.map((shift) => (
                <div key={shift.id} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-lg font-bold text-slate-950">{shift.cashier_name}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">
                        {shift.cashier_station || "-"} - Shift {shift.shift_type || "-"} - {getShiftDurationLabel(shift)}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {formatDateTime(shift.start_time, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        {" - "}
                        {shift.end_time
                          ? formatDateTime(shift.end_time, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "belum tutup"}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getStatusBadgeClass(
                        shift.status
                      )}`}
                    >
                      {getShiftStatusLabel(shift.status)}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryItem label="Station" value={shift.cashier_station || "-"} />
                    <SummaryItem label="Shift" value={shift.shift_type || "-"} />
                    <SummaryItem label="Transaksi" value={String(shift.total_transactions || 0)} />
                    <SummaryItem label="Cash" value={formatRupiah(shift.total_cash || 0)} />
                    <SummaryItem label="Digital" value={formatRupiah(shift.total_digital || 0)} />
                    <SummaryItem label="Actual" value={formatRupiah(shift.actual_cash || 0)} />
                    <SummaryItem
                      label="Selisih"
                      value={formatRupiah(shift.difference || 0)}
                    />
                  </div>
                  <DigitalPaymentBreakdownCard
                    shift={shift}
                    walletBalances={walletBalances}
                    className="mt-3"
                  />

                  <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-semibold text-slate-950">WhatsApp delivery</span>
                      {shift?.whatsapp_notification?.held ? (
                        <span className="brand-badge-warning">Di-hold</span>
                      ) : (
                        <span
                          className={
                            shift?.whatsapp_notification?.ok === false
                              ? "brand-badge-danger"
                              : "brand-badge-success"
                          }
                        >
                          {shift?.whatsapp_notification?.ok === false
                            ? "Gagal terkirim"
                            : "Tercatat"}
                        </span>
                      )}
                    </div>
                    {shift?.whatsapp_notification?.held ? (
                      <p className="mt-2 text-xs font-semibold text-amber-700">
                        {shift.whatsapp_notification.message ||
                          "Notifikasi WhatsApp sedang di-hold sementara."}
                      </p>
                    ) : shift?.whatsapp_notification?.error ? (
                      <p className="mt-2 text-xs font-semibold text-rose-600">
                        {shift.whatsapp_notification.error}
                      </p>
                    ) : null}
                  </div>

                  {shift.notes ? (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
                      <p className="font-semibold text-slate-950">Catatan closing</p>
                      <p className="mt-2 whitespace-pre-line">{shift.notes}</p>
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Catatan pemilik toko
                    </label>
                    <textarea
                      value={reviewNotes[shift.id] || ""}
                      onChange={(event) =>
                        setReviewNotes((prev) => ({ ...prev, [shift.id]: event.target.value }))
                      }
                      className="brand-textarea"
                      rows={3}
                      placeholder="Tulis hasil pengecekan pemilik toko."
                    />
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => requestReviewShift(shift, "approved")}
                      disabled={submitting || Number(shift.difference || 0) !== 0}
                      className="brand-button-success disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Setujui Shift
                    </button>
                    <button
                      type="button"
                      onClick={() => openCorrectionModal(shift)}
                      disabled={submitting || Number(shift.difference || 0) === 0}
                      className="brand-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Setujui dengan Koreksi
                    </button>
                    <button
                      type="button"
                      onClick={() => requestReviewShift(shift, "flagged")}
                      disabled={submitting}
                      className="brand-button-secondary"
                    >
                      Tandai Perlu Dicek
                    </button>
                  </div>

                  {Number(shift.difference || 0) !== 0 ? (
                    <p className="mt-3 text-sm font-semibold text-rose-600">
                      Shift dengan selisih tidak bisa langsung disetujui.
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
              Tidak ada shift yang menunggu approval.
            </div>
          )}
        </Panel>
      ) : null}

      {correctionTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="brand-panel w-full max-w-lg p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
              Koreksi Selisih Kas
            </p>
            <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
              Setujui dengan Koreksi
            </h3>
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-sm font-semibold text-amber-800">Jumlah selisih</p>
              <p className="mt-2 text-3xl font-black text-amber-800">
                {formatRupiah(correctionTarget.difference || 0)}
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-800">
                Shift akan tetap disetujui, tetapi selisih ini dicatat sebagai audit keuangan.
              </p>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm font-semibold text-slate-950">Catatan pemilik toko</p>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                {reviewNotes[correctionTarget.id]}
              </p>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCorrectionTargetId(null)}
                disabled={submitting}
                className="brand-button-secondary"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmCorrectionApproval}
                disabled={submitting}
                className="brand-button-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Menyetujui..." : "Setujui dengan Koreksi"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {approvalRequest ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="brand-panel w-full max-w-lg p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
              Approval Owner
            </p>
            <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
              Konfirmasi Approval Owner
            </h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <SummaryItem label="Kasir" value={approvalRequest.cashierName || "-"} />
              <SummaryItem label="Station" value={approvalRequest.cashierStation || "-"} />
              <SummaryItem label="Jenis Shift" value={approvalRequest.shiftType || "-"} />
              <SummaryItem label="Durasi" value={approvalRequest.duration || "-"} />
              <SummaryItem label="Cash" value={formatRupiah(approvalRequest.cash || 0)} />
              <SummaryItem label="Digital" value={formatRupiah(approvalRequest.digital || 0)} />
              <SummaryItem
                label="Selisih"
                value={formatRupiah(approvalRequest.difference || 0)}
                className={
                  Math.abs(Number(approvalRequest.difference || 0)) >= 50000
                    ? "border-rose-200 bg-rose-50"
                    : ""
                }
              />
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm font-semibold text-slate-950">Aksi</p>
              <p className="mt-1 text-sm text-slate-600">
                {getShiftStatusLabel(approvalRequest.decision)}
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Catatan pemilik toko
              </p>
              <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">
                {reviewNotes[approvalRequest.shiftId] || "-"}
              </p>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setApprovalRequest(null)}
                disabled={submitting}
                className="brand-button-secondary"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmOwnerApproval}
                disabled={submitting}
                className="brand-button-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Memproses..." : "Konfirmasi Approval"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Panel className="p-6">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Riwayat Shift
          </p>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-slate-950">
            Shift terakhir
          </h2>
        </div>

        <div className="brand-scrollbar overflow-x-auto">
          <table className="brand-table">
            <thead>
              <tr>
                <th>Kasir</th>
                <th>Station</th>
                <th>Shift</th>
                <th>Mulai</th>
                <th>Tutup</th>
                <th>Status</th>
                <th>Transaksi</th>
                <th>Cash</th>
                <th>Digital</th>
                <th>Selisih</th>
              </tr>
            </thead>
            <tbody>
              {shiftHistory.length ? (
                shiftHistory.map((shift) => (
                  <tr key={shift.id}>
                    <td className="font-semibold text-slate-950">{shift.cashier_name}</td>
                    <td>{shift.cashier_station || "-"}</td>
                    <td>{shift.shift_type || "-"}</td>
                    <td>
                      {formatDateTime(shift.start_time, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td>
                      {shift.end_time
                        ? formatDateTime(shift.end_time, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "-"}
                    </td>
                    <td>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${getStatusBadgeClass(
                          shift.status
                        )}`}
                      >
                        {getShiftStatusLabel(shift.status)}
                      </span>
                      {shift.status === "approved_with_correction" ? (
                        <div className="mt-2 max-w-xs text-xs leading-5 text-slate-600">
                          <p className="font-semibold text-amber-700">
                            {shift.correction_type || "Koreksi"}{" "}
                            {formatRupiah(shift.correction_difference || shift.difference || 0)}
                          </p>
                          {shift.approval_notes ? (
                            <p className="mt-1 whitespace-pre-line">{shift.approval_notes}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td>{shift.total_transactions}</td>
                    <td>{formatRupiah(shift.total_cash || 0)}</td>
                    <td>
                      <DigitalPaymentBreakdownInline shift={shift} />
                    </td>
                    <td className={Number(shift.difference || 0) === 0 ? "text-slate-600" : "text-rose-600"}>
                      {formatRupiah(shift.difference || 0)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    Belum ada riwayat shift.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

