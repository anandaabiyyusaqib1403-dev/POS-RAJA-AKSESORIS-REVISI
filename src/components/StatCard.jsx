import { formatRupiah } from "../utils/format";

export default function StatCard({ title, value, money = false }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-3 text-2xl font-black tracking-tight text-[#1e3a5f]">
        {money ? formatRupiah(value) : value}
      </p>
    </div>
  );
}
