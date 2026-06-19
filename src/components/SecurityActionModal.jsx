import { useState } from "react";
import { KeyRound, LockKeyhole, ShieldCheck, X } from "lucide-react";

import { useAuth } from "../contexts/useAuth";
import { formatRupiah } from "../utils/format";

function getInitials(name) {
  return (
    String(name || "RA")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "RA"
  );
}

export default function SecurityActionModal({
  request,
  onClose,
  onConfirm,
  requireCurrentPin = true,
  loading = false,
}) {
  const { verifyPin } = useAuth();
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!request) return null;

  const collectReason = request.collectReason !== false;
  const detailRows = [
    request.employeeName ? ["Staff", request.employeeName] : null,
    request.targetLabel ? ["Target", request.targetLabel] : null,
    request.amount ? ["Nominal", formatRupiah(request.amount)] : null,
    request.permissionLabel ? ["Permission", request.permissionLabel] : null,
  ].filter(Boolean);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      if (request.kind === "reset-pin" && !/^[0-9]{4,8}$/.test(newPin)) {
        throw new Error("PIN baru harus berisi 4 sampai 8 digit angka.");
      }

      if (requireCurrentPin) {
        const verified = await verifyPin(pin);
        if (!verified) throw new Error("PIN tidak sesuai.");
      }

      await onConfirm({
        ...request,
        pin,
        newPin,
        reason: reason.trim(),
      });

      setPin("");
      setNewPin("");
      setReason("");
    } catch (err) {
      setError(err.message || "Aksi keamanan gagal diverifikasi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="brand-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="brand-modal-surface brand-success-popover w-full max-w-md">
        <div className="brand-modal-header flex items-start justify-between gap-4 p-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-[var(--brand-gold)] shadow-lg">
              {request.employeeName ? (
                <span className="text-sm font-black">{getInitials(request.employeeName)}</span>
              ) : (
                <LockKeyhole className="h-5 w-5" strokeWidth={1.8} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand-gold-strong)]">
                Security Check
              </p>
              <h3 className="mt-1 truncate text-xl font-black tracking-tight text-slate-950">
                {request.label || "Verifikasi Aksi"}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {request.message || "Masukkan PIN owner untuk melanjutkan aksi sensitif."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="brand-icon-button brand-icon-button-sm brand-icon-button-muted"
            aria-label="Tutup security modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
          {detailRows.length ? (
            <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {detailRows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-slate-500">{label}</span>
                  <span className="truncate font-black text-slate-950">{value}</span>
                </div>
              ))}
            </div>
          ) : null}

          {requireCurrentPin ? (
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                PIN Owner
              </span>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength="8"
                value={pin}
                onChange={(event) => {
                  setPin(event.target.value.replace(/\D/g, ""));
                  setError("");
                }}
                className="brand-input mt-2 h-14 text-center font-mono text-2xl tracking-[0.44em]"
                placeholder="PIN"
                autoFocus
              />
            </label>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700">
              Proteksi PIN sedang nonaktif untuk aksi ini.
            </div>
          )}

          {requireCurrentPin ? (
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => setPin((current) => `${current}${digit}`.slice(0, 8))}
                  className={`rounded-lg border border-slate-200 bg-slate-50 py-3 text-base font-black text-slate-800 transition hover:bg-[var(--brand-gold)]/10 ${
                    digit === "0" ? "col-start-2" : ""
                  }`}
                >
                  {digit}
                </button>
              ))}
            </div>
          ) : null}

          {request.kind === "reset-pin" ? (
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                PIN baru karyawan
              </span>
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
                className="brand-input mt-2 text-center font-mono text-lg tracking-[0.22em]"
                placeholder="4-8 digit"
              />
            </label>
          ) : null}

          {collectReason ? (
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                Alasan / catatan
              </span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="brand-textarea mt-2 min-h-[84px] resize-none text-sm"
                placeholder="Opsional, tapi berguna untuk audit."
              />
            </label>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={onClose} className="brand-button-secondary">
              Batal
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                submitting ||
                (requireCurrentPin && pin.length < 4) ||
                (request.kind === "reset-pin" && newPin.length < 4)
              }
              className="brand-button-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading || submitting ? (
                "Memproses..."
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  Konfirmasi
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-500">
            <KeyRound className="h-3.5 w-3.5" />
            Aksi sensitif dicatat ke audit operasional.
          </div>
        </form>
      </div>
    </div>
  );
}
