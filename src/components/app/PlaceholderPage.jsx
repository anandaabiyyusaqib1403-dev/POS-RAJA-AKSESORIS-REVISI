import PageHeader from "./PageHeader";
import Panel from "./Panel";

export default function PlaceholderPage({
  eyebrow,
  title,
  description,
  bullets = [],
  note,
  icon = "spark",
}) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={eyebrow} title={title} description={description} icon={icon} />

      <Panel className="grid gap-5 p-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand-gold-strong)]">
            Retail Operations Platform
          </p>
          <p className="mt-4 text-base leading-8 text-slate-600">
            Halaman ini sudah disiapkan sebagai bagian dari struktur aplikasi premium Raja
            Aksesoris. Saya buat placeholder yang rapi dulu supaya arsitekturnya lengkap dan mudah
            diterusin ke fitur detail berikutnya.
          </p>
          {note ? <p className="mt-4 text-sm leading-7 text-slate-500">{note}</p> : null}
        </div>

        <div className="grid gap-3">
          {bullets.map((item) => (
            <div
              key={item}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600"
            >
              {item}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
