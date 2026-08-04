"use client";

export default function Sparkline({
  values,
  width = 160,
  height = 40,
  color,
  fill = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}) {
  if (values.length === 0) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-[10px] text-muted-foreground"
      >
        keine Verlaufsdaten
      </div>
    );
  }

  if (values.length === 1) {
    values = [values[0], values[0]];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 3;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${path} L${points[points.length - 1][0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`;

  const trendUp = values[values.length - 1] >= values[0];
  const strokeColor = color || (trendUp ? "var(--success)" : "var(--destructive)");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {fill && <path d={areaPath} fill={strokeColor} opacity={0.12} />}
      <path d={path} fill="none" stroke={strokeColor} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      {points.length > 0 && (
        <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r={2.5} fill={strokeColor} />
      )}
    </svg>
  );
}
