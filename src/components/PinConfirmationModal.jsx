import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/useAuth";
import Button from "./ui/Button";

export default function PinConfirmationModal({ isOpen, onClose, onConfirm, title, message }) {
  const { verifyPin } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pinInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      pinInputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await verifyPin(pin);
      await onConfirm();
      setPin("");
    } catch (err) {
      setError(err.message || "Verifikasi PIN gagal");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="brand-modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="brand-modal-surface w-full max-w-md p-6">
        <h3 className="font-display text-xl font-bold tracking-tight text-slate-950">
          {title || "Konfirmasi PIN"}
        </h3>
        {message ? <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p> : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              Masukkan PIN
            </label>
            <input
              ref={pinInputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength="8"
              value={pin}
              onChange={(event) => {
                setPin(event.target.value);
                setError("");
              }}
              disabled={loading}
              placeholder="******"
              className="brand-input brand-input-lg font-mono text-center text-lg tracking-[0.24em] placeholder-slate-400"
              autoFocus
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>
          ) : null}

          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setPin("");
                setError("");
                onClose();
              }}
              disabled={loading}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              fullWidth
              type="submit"
              disabled={loading || !pin.trim()}
            >
              {loading ? "Verifikasi..." : "Konfirmasi"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

