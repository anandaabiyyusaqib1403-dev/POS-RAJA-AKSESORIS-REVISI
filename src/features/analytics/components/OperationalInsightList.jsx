import Panel from "../../../components/app/Panel";

const toneClass = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
};

export default function OperationalInsightList({ insights = [] }) {
  if (!insights.length) return null;

  return (
    <Panel className="p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-display text-xl font-bold tracking-tight text-slate-950">
            Operational insights
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Rekomendasi singkat dari profit, stok, dan supplier.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {insights.map((insight) => (
          <article
            key={`${insight.title}-${insight.tone}`}
            className={`rounded-lg border px-4 py-3 ${toneClass[insight.tone] || toneClass.info}`}
          >
            <p className="text-sm font-black text-slate-950">{insight.title}</p>
            <p className="mt-1 text-sm leading-6 opacity-90">{insight.detail}</p>
          </article>
        ))}
      </div>
    </Panel>
  );
}
