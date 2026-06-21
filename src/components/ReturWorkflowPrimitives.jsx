import { CheckCircle2 } from "lucide-react";

const returnConditionOptions = [
  "Layak jual",
  "Rusak ringan",
  "Rusak berat",
  "Kemasan rusak",
];

export function ReturWorkflowSection({
  step,
  title,
  description,
  complete = false,
  children,
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
            complete
              ? "bg-emerald-100 text-emerald-700"
              : "bg-[var(--brand-gold)]/14 text-[var(--brand-gold-strong)]"
          }`}
        >
          {complete ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : step}
        </span>
        <div>
          <h3 className="text-sm font-bold text-slate-950">{title}</h3>
          {description ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function ReturConditionChips({ value, onChange }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2" aria-label="Pilihan cepat kondisi barang">
      {returnConditionOptions.map((option) => {
        const active = value.trim().toLowerCase() === option.toLowerCase();

        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
              active
                ? "border-[var(--brand-gold)]/35 bg-[var(--brand-gold)]/14 text-slate-950"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:border-[var(--brand-gold)]/28 hover:bg-white"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
