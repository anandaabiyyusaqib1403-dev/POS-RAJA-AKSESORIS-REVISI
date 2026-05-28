import Panel from "./Panel";
import AppIcon from "./AppIcon";

export default function MetricCard({
  label,
  value,
  helper,
  trend = null,
  accent = "gold",
  icon = null,
  className = "",
}) {
  const accentStyles = {
    gold: {
      badge: "brand-badge",
      value: "text-slate-950",
      helper: "text-slate-500",
      rail: "bg-[var(--brand-gold)]",
      icon: "bg-[var(--brand-gold)]/14 text-[var(--brand-gold-strong)]",
    },
    success: {
      badge: "brand-badge-success",
      value: "text-[var(--brand-success)]",
      helper: "text-emerald-700",
      rail: "bg-[var(--brand-success)]",
      icon: "bg-[var(--brand-success-soft)] text-[var(--brand-success)]",
    },
    danger: {
      badge: "brand-badge-danger",
      value: "text-[var(--brand-danger)]",
      helper: "text-rose-700",
      rail: "bg-[var(--brand-danger)]",
      icon: "bg-[var(--brand-danger-soft)] text-[var(--brand-danger)]",
    },
    info: {
      badge: "brand-badge-info",
      value: "text-[var(--brand-info)]",
      helper: "text-blue-700",
      rail: "bg-[var(--brand-info)]",
      icon: "bg-[var(--brand-info-soft)] text-[var(--brand-info)]",
    },
  };

  const styles = accentStyles[accent] || accentStyles.gold;

  return (
    <Panel className={`overflow-hidden p-5 ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3">
        <span className={styles.badge}>{label}</span>
        {icon ? (
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${styles.icon}`}>
            <AppIcon name={icon} className="h-[18px] w-[18px]" />
          </span>
        ) : trend ? (
          <span className={`brand-trend-chip brand-trend-${trend.tone || "neutral"}`}>
            {trend.label}
          </span>
        ) : (
          <span className={`mt-1 h-1.5 w-12 rounded-full ${styles.rail}`} />
        )}
      </div>
      <p className={`mt-6 text-3xl font-extrabold tracking-tight ${styles.value}`}>{value}</p>
      {helper || (icon && trend) ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {icon && trend ? (
            <span className={`brand-trend-chip brand-trend-${trend.tone || "neutral"}`}>
              {trend.label}
            </span>
          ) : null}
          {helper ? <span className={`text-sm ${styles.helper}`}>{helper}</span> : null}
        </div>
      ) : null}
    </Panel>
  );
}
