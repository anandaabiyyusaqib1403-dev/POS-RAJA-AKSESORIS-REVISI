import AppIcon from "./AppIcon";

export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon = "spark",
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? (
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--brand-gold)]/15 bg-[var(--brand-gold)]/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--brand-gold)]">
            <AppIcon name={icon} className="h-3.5 w-3.5" />
            {eyebrow}
          </div>
        ) : null}
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-[15px]">
            {description}
          </p>
        ) : null}
      </div>

      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}
