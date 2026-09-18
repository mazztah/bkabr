import { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Pflichtenheft-Referenz, z. B. "IMM-003 – IMM-006" */
  reqRef?: string;
  actions?: ReactNode;
}

export default function PageHeader({ icon: Icon, title, description, reqRef, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="flex items-start gap-3">
        <span className="page-header__icon" aria-hidden>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">{title}</h1>
          {description && <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
          {reqRef && (
            <span className="chip mt-2" data-tone="info">
              Pflichtenheft {reqRef}
            </span>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
