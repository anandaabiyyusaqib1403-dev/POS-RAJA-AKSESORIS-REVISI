export default function ConfirmModal({
  isOpen,
  title = "Konfirmasi",
  message,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  isLoading = false,
  onClose,
  onConfirm,
  children,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
            Konfirmasi retur
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
            {title}
          </h2>
          {message ? <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p> : null}
        </div>

        {children ? <div className="mt-5">{children}</div> : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="brand-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="brand-button-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Memproses..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
