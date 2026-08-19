import { cn } from "@/lib/utils";
import { TicketPrioritaet, TicketStatus } from "@/lib/types";

export const STATUS_STYLE: Record<TicketStatus, string> = {
  Eingang: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  "Zur Freigabe": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Freigegeben: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  Zugewiesen: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  "In Bearbeitung": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  Erledigt: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  Abgelehnt: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  Storniert: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

export const PRIO_STYLE: Record<TicketPrioritaet, string> = {
  niedrig: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  mittel: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  hoch: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  notfall: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-semibold",
};

export const PRIO_LABEL: Record<TicketPrioritaet, string> = {
  niedrig: "Niedrig",
  mittel: "Mittel",
  hoch: "Hoch",
  notfall: "🔴 Notfall",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[status])}>
      {status}
    </span>
  );
}

export function PrioBadge({ prioritaet }: { prioritaet: TicketPrioritaet }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", PRIO_STYLE[prioritaet])}>
      {PRIO_LABEL[prioritaet]}
    </span>
  );
}
