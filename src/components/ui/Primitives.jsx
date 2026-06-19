import AppIcon from "../app/AppIcon";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function Surface({ children, className = "", variant = "default", as: Component = "section", ...props }) {
  const variants = {
    default: "brand-panel",
    secondary: "brand-panel brand-panel-muted",
    strong: "brand-panel brand-panel-strong",
    ghost: "bg-transparent border-transparent shadow-none",
  };

  return (
    <Component
      className={cx(variants[variant] || variants.default, className)}
      {...props}
    >
      {children}
    </Component>
  );
}

export function Section({ children, className = "", title, description, actions }) {
  return (
    <section className={cx("space-y-4", className)}>
      {(title || description || actions) ? (
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            {title ? <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  helper,
  icon = "trend",
  trend,
  tone = "neutral",
  className = "",
}) {
  const toneClass = {
    neutral: "text-slate-950 bg-slate-100",
    success: "text-emerald-700 bg-emerald-50",
    danger: "text-rose-700 bg-rose-50",
    warning: "text-amber-800 bg-amber-50",
    info: "text-blue-700 bg-blue-50",
  }[tone] || "text-slate-950 bg-slate-100";

  return (
    <Surface className={cx("p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
            {label}
          </p>
          <p className="mt-3 text-2xl font-extrabold tracking-tight text-[var(--text)]">{value}</p>
        </div>
        <span className={cx("flex h-10 w-10 items-center justify-center rounded-lg", toneClass)}>
          <AppIcon name={icon} className="h-4.5 w-4.5" />
        </span>
      </div>
      {(helper || trend) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
          {trend ? <span className={`brand-trend-chip brand-trend-${trend.tone || "neutral"}`}>{trend.label}</span> : null}
          {helper ? <span className="text-[var(--text-secondary)]">{helper}</span> : null}
        </div>
      ) : null}
    </Surface>
  );
}

export function EmptyState({ title = "Belum ada data", description, icon = "search", action }) {
  return (
    <div className="brand-empty-state brand-empty-state-with-motion">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--brand-gold)]/20 bg-white text-[var(--brand-gold-strong)] shadow-sm">
        <AppIcon name={icon} className="h-5 w-5" />
      </span>
      <p className="text-base font-semibold text-[var(--text)]">{title}</p>
      {description ? <p className="mt-2 max-w-md text-sm leading-7 text-[var(--text-secondary)]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }) {
  return <div className={`brand-skeleton ${className}`} aria-hidden="true" />;
}

export function FilterBar({ children, className = "" }) {
  return (
    <div className={cx("brand-table-toolbar", className)}>
      {children}
    </div>
  );
}

export function DashboardCard({ children, title, description, action, className = "" }) {
  return (
    <Surface className={cx("p-4", className)}>
      {(title || description || action) ? (
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-[var(--border-muted)] pb-3">
          <div>
            {title ? <h3 className="text-sm font-bold text-[var(--text)]">{title}</h3> : null}
            {description ? <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </Surface>
  );
}

export function StatusBadge({ children, tone = "neutral", icon, className = "" }) {
  const variants = {
    neutral: "brand-badge-neutral",
    success: "brand-badge-success",
    danger: "brand-badge-danger",
    warning: "brand-badge-warning",
    info: "brand-badge-info",
  };

  return (
    <span className={cx(variants[tone] || variants.neutral, className)}>
      {icon ? <AppIcon name={icon} className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

export function SearchInput({ value, onChange, placeholder = "Cari...", className = "", ...props }) {
  return (
    <label className={cx("relative block", className)}>
      <span className="sr-only">{placeholder}</span>
      <AppIcon
        name="search"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="brand-input pl-10"
        {...props}
      />
    </label>
  );
}

export function Drawer({ open, title, children, onClose, side = "right", className = "" }) {
  if (!open) return null;

  const sideClass = side === "left" ? "left-0" : "right-0";

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button
        type="button"
        aria-label="Tutup panel"
        className="brand-modal-backdrop absolute inset-0"
        onClick={onClose}
      />
      <aside
        className={cx(
          "brand-scrollbar absolute top-0 h-full w-[min(420px,calc(100vw-32px))] overflow-y-auto border-l border-[var(--border-muted)] bg-white shadow-2xl",
          sideClass,
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Panel"}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[var(--border-muted)] bg-white px-5 py-4">
          <h2 className="text-base font-bold text-[var(--text)]">{title}</h2>
          <button type="button" onClick={onClose} className="brand-icon-button brand-icon-button-sm brand-icon-button-muted">
            <AppIcon name="x" className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </aside>
    </div>
  );
}

export function ModalLayout({ open, title, description, children, footer, onClose, className = "" }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6" role="presentation">
      <button
        type="button"
        aria-label="Tutup modal"
        className="brand-modal-backdrop absolute inset-0"
        onClick={onClose}
      />
      <div
        className={cx("brand-modal-surface relative max-h-[90vh] w-full max-w-lg", className)}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Modal"}
      >
        <div className="brand-modal-header px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-[var(--text)]">{title}</h2>
              {description ? <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="brand-icon-button brand-icon-button-sm brand-icon-button-muted">
              <AppIcon name="x" className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="brand-scrollbar max-h-[64vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="brand-modal-footer px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
