import { ReactNode } from "react";

type Tone = "default" | "danger" | "warning" | "success";

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
}

/** Kennzahlenkachel; mit onClick als Filter-Toggle nutzbar (Tastatur + Screenreader-fähig). */
export default function StatCard({ label, value, hint, tone = "default", active, onClick }: StatCardProps) {
  const inner = (
    <>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </>
  );
  if (!onClick) {
    return (
      <div className="stat-card" data-tone={tone}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className="stat-card w-full text-left"
      data-tone={tone}
      data-active={!!active}
    >
      {inner}
    </button>
  );
}
