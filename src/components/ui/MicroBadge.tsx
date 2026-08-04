import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function MicroBadge({
  children,
  color = "primary",
}: {
  children: ReactNode;
  color?: "primary" | "accent" | "success";
}) {
  const colors: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-[var(--brand-accent)]/10 text-[var(--brand-accent)]",
    success: "bg-[var(--success-bg)] text-[var(--success)]",
  };

  return (
    <span className={cn("interactive inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", colors[color])}>
      {children}
    </span>
  );
}
