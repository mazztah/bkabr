interface ProgressBarProps {
  /** Segmente in Prozent; Summe darf ≤ 100 sein. */
  segments: { value: number; color: string; label: string }[];
  height?: number;
}

export default function ProgressBar({ segments, height = 8 }: ProgressBarProps) {
  return (
    <div
      role="img"
      aria-label={segments.map((s) => `${s.label}: ${Math.round(s.value)} %`).join(", ")}
      className="flex w-full overflow-hidden rounded-full bg-muted"
      style={{ height }}
    >
      {segments.map((s) => (
        <div
          key={s.label}
          title={`${s.label}: ${Math.round(s.value)} %`}
          style={{ width: `${Math.max(0, s.value)}%`, background: s.color, transition: "width .5s ease" }}
        />
      ))}
    </div>
  );
}
