export default function ConfirmModal({
  isOpen,
  title = "Konfirmasi",
  message,
  target,
  consequence,
  requiresPin = false,
  destructive = false,
  size = "sm",
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  isLoading = false,
  onClose,
  onConfirm,
  children,
}) {
  if (!isOpen) return null;

  return (
    <div className="brand-modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div
        className={`brand-modal-surface brand-modal-${size} ${
          destructive ? "brand-modal-destructive" : ""
        } p-6`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
            Konfirmasi aksi
          </p>
          <h2 id="confirmation-modal-title" className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">
            {title}
          </h2>
          {message ? <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p> : null}
        </div>

        {target ? (
          <div className="mt-5 rounded-lg border border-[var(--border-muted)] bg-[var(--surface-secondary)] px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
              Target
            </p>
            <p className="mt-1 break-words text-sm font-bold text-[var(--text)]">{target}</p>
          </div>
        ) : null}

        {consequence ? (
          <div className="brand-modal-consequence mt-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]">Konsekuensi</p>
            <p className="mt-1">{consequence}</p>
          </div>
        ) : null}

        {requiresPin ? (
          <p className="mt-3 text-sm font-semibold text-[var(--warning)]">
            Verifikasi PIN diwajibkan untuk melanjutkan aksi sensitif ini.
          </p>
        ) : null}

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
            className={`${
              destructive ? "brand-button-danger" : "brand-button-primary"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {isLoading ? "Memproses..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
