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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="brand-panel w-full max-w-md rounded-lg p-6">
        <h3 className="mb-2 text-lg font-semibold text-slate-900">
          {title || "Konfirmasi PIN"}
        </h3>
        {message ? <p className="mb-4 text-sm text-slate-600">{message}</p> : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
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
              className="w-full rounded-lg border border-slate-300 px-4 py-2 font-mono text-center text-lg placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              autoFocus
            />
          </div>

          {error ? (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
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

