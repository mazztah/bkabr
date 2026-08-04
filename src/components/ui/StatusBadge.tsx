import { CheckCircle, AlertCircle, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusBadgeStatus = "ok" | "warning" | "error" | "pending";

export default function StatusBadge({ status, text }: { status: StatusBadgeStatus; text: string }) {
  const variants: Record<StatusBadgeStatus, { color: string; Icon: typeof CheckCircle }> = {
    ok: { color: "text-[var(--success)]", Icon: CheckCircle },
    warning: { color: "text-amber-500", Icon: AlertCircle },
    error: { color: "text-[var(--destructive)]", Icon: XCircle },
    pending: { color: "text-muted-foreground", Icon: Clock },
  };
  const { color, Icon } = variants[status];

  return (
    <div className={cn("inline-flex items-center gap-1.5 text-xs font-medium", color)}>
      <Icon className="h-3.5 w-3.5" /> {text}
    </div>
  );
}
