import { ResponsiveContainer, LineChart, Line, Tooltip } from "recharts";

interface SparklineChartProps {
  data: number[];
  positive?: boolean;
  height?: number;
  showTooltip?: boolean;
}

export default function SparklineChart({
  data,
  positive = true,
  height = 40,
  showTooltip = false,
}: SparklineChartProps) {
  if (!data || data.length === 0) {
    return <div style={{ height }} className="shimmer rounded" />;
  }

  const chartData = data.map((v, i) => ({ i, v }));
  const color = positive
    ? "oklch(0.72 0.17 145)"
    : "oklch(0.60 0.20 25)";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        {showTooltip && (
          <Tooltip
            contentStyle={{
              background: "oklch(0.11 0 0)",
              border: "1px solid oklch(0.20 0 0)",
              borderRadius: "6px",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "oklch(0.93 0 0)",
            }}
            formatter={(v: number) => [`$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, ""]}
            labelFormatter={() => ""}
          />
        )}
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          activeDot={showTooltip ? { r: 3, fill: color } : false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
