import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatRupiah } from "../../../utils/format";

export default function SalesTrendChart({ data }) {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#64748b", fontSize: 12, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            width={72}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={(value) => `${Math.round(Number(value || 0) / 1000)}rb`}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(212, 175, 55, 0.08)" }}
            formatter={(value, name) => [formatRupiah(value), name === "omzet" ? "Omzet" : "Laba"]}
            contentStyle={{
              borderRadius: 8,
              borderColor: "#e2e8f0",
              boxShadow: "0 18px 38px rgba(15,23,42,0.12)",
            }}
          />
          <Area
            type="monotone"
            dataKey="laba_bersih"
            fill="rgba(21,128,61,0.10)"
            stroke="#15803d"
            strokeWidth={2}
          />
          <Bar dataKey="omzet" fill="#d4af37" radius={[6, 6, 0, 0]} maxBarSize={42} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
