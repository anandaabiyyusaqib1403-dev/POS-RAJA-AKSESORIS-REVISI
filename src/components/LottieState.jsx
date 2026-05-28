import AppIcon from "./app/AppIcon";

export default function LottieState({
  ariaLabel = "Status",
  className = "",
  icon = "search",
  size = 120,
}) {
  return (
    <div
      aria-label={ariaLabel}
      className={`brand-empty-state-motion flex shrink-0 items-center justify-center ${className}`.trim()}
      role="img"
      style={{ width: size, height: size }}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-slate-200 bg-white text-[var(--brand-gold-strong)] shadow-sm">
        <AppIcon name={icon} className="h-6 w-6" />
      </span>
    </div>
  );
}
