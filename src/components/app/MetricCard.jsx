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
      value: "text-slate-950",
      helper: "text-slate-500",
      icon: "bg-slate-100 text-slate-600",
    },
    success: {
      value: "text-[var(--brand-success)]",
      helper: "text-emerald-700",
      icon: "bg-[var(--brand-success-soft)] text-[var(--brand-success)]",
    },
    danger: {
      value: "text-[var(--brand-danger)]",
      helper: "text-rose-700",
      icon: "bg-[var(--brand-danger-soft)] text-[var(--brand-danger)]",
    },
    info: {
      value: "text-[var(--brand-info)]",
      helper: "text-blue-700",
      icon: "bg-slate-100 text-slate-600",
    },
  };

  const styles = accentStyles[accent] || accentStyles.gold;

  return (
    <Panel className={`overflow-hidden p-4 ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-black uppercase leading-5 tracking-[0.12em] text-slate-500">{label}</span>
        {icon ? (
          <span className={`flex h-9 w-9 items-center justify-center rounded-md border border-slate-200/70 ${styles.icon}`}>
            <AppIcon name={icon} className="h-4 w-4" />
          </span>
        ) : trend ? (
          <span className={`brand-trend-chip brand-trend-${trend.tone || "neutral"}`}>
            {trend.label}
          </span>
        ) : null}
      </div>
      <p className={`mt-4 text-2xl font-black tracking-tight ${styles.value}`}>{value}</p>
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
