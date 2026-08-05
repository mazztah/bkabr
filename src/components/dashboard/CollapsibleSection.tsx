"use client";

import { ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CollapsibleSection({
  title,
  icon,
  subtitle,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: string;
  subtitle?: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex min-w-0 items-center gap-2">
          {icon && <span className="text-base">{icon}</span>}
          <span className="truncate text-sm font-semibold">{title}</span>
          {badge !== undefined && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {badge}
            </span>
          )}
          {subtitle && !open && (
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">— {subtitle}</span>
          )}
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
