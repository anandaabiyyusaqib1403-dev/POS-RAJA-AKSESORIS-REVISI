import Panel from "../../../components/app/Panel";

const toneClass = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
  danger: "bg-rose-500",
};

export default function OperationalInsightList({ insights = [] }) {
  if (!insights.length) return null;

  return (
    <Panel className="overflow-hidden p-0">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-950">
          Prioritas operasional
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Hal yang perlu dicek pemilik toko sebelum belanja stok atau promo.
        </p>
      </div>

      <div className="divide-y divide-slate-200">
        {insights.map((insight, index) => (
          <article
            key={`${insight.title}-${insight.tone}`}
            className="grid gap-3 px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)]"
          >
            <div className="flex items-center gap-3">
              <span
                className={`h-8 w-1 rounded-full ${toneClass[insight.tone] || toneClass.info}`}
              />
              <span className="text-xs font-black tabular-nums text-slate-400">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <div>
              <p className="text-sm font-black text-slate-950">{insight.title}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{insight.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}
