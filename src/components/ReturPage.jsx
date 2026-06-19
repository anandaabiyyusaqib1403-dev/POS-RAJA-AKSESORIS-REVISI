import { Package, UserRound } from "lucide-react";
import PageHeader from "./app/PageHeader";

export default function ReturPage({ tab, onTabChange, counts = {}, children }) {
  const tabs = [
    {
      value: "supplier",
      label: "Retur Supplier",
      description: "Barang keluar ke pemasok",
      Icon: Package,
    },
    {
      value: "konsumen",
      label: "Garansi Konsumen",
      description: "Klaim dari nota transaksi",
      Icon: UserRound,
    },
  ];

  return (
    <div className="space-y-7">
      <div>
        <PageHeader
          eyebrow="Operasional"
          title="Retur Supplier & Garansi"
          description="Catat barang ke pemasok dan klaim garansi konsumen dengan dampak stok yang jelas."
          icon="return"
        />

        <div
          role="tablist"
          aria-label="Jenis retur dan garansi"
          className="grid gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:inline-grid sm:grid-cols-2"
        >
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              onClick={() => onTabChange(item.value)}
              className={`relative flex min-w-[230px] items-center gap-3 rounded-lg px-4 py-3 text-left transition ${
                tab === item.value
                  ? "bg-[var(--brand-gold)]/12 text-slate-950 shadow-[inset_0_0_0_1px_rgba(212,175,55,0.24)]"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  tab === item.value
                    ? "bg-[var(--brand-gold)] text-slate-950"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                <item.Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{item.label}</span>
                <span className="block text-xs text-slate-500">{item.description}</span>
              </span>
              {Number.isFinite(counts[item.value]) ? (
                <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600 shadow-sm">
                  {counts[item.value]}
                </span>
              ) : null}
              {tab === item.value ? (
                <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-[var(--brand-gold)]" />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {children}
    </div>
  );
}
