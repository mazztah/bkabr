"use client";

import { formatCurrency } from "@/lib/utils";

export default function CategoryBars({
  data,
  color = "var(--primary)",
}: {
  data: Record<string, number>;
  color?: string;
}) {
  const eintraege = Object.entries(data)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (eintraege.length === 0) {
    return <p className="text-xs text-muted-foreground">Keine Buchungen in diesem Zeitraum.</p>;
  }

  const max = eintraege[0][1];

  return (
    <div className="space-y-2">
      {eintraege.map(([kategorie, betrag]) => (
        <div key={kategorie}>
          <div className="mb-0.5 flex items-center justify-between text-xs">
            <span className="truncate text-muted-foreground">{kategorie}</span>
            <span className="shrink-0 font-medium tabular-nums">{formatCurrency(betrag)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, (betrag / max) * 100)}%`, backgroundColor: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
