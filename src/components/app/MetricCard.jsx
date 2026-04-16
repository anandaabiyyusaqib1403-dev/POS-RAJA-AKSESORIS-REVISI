import Panel from "./Panel";

export default function MetricCard({
  label,
  value,
  helper,
  accent = "gold",
  className = "",
}) {
  return (
    <Panel className={`p-5 ${className}`.trim()}>
      <div
        className={`mb-4 h-1.5 w-14 rounded-full ${
          accent === "success" || accent === "danger"
            ? "bg-[var(--brand-gold)]/80"
            : "bg-[var(--brand-gold)]/80"
        }`}
      />
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{value}</p>
      {helper ? <p className="mt-2 text-sm text-slate-500">{helper}</p> : null}
    </Panel>
  );
}
