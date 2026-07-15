"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import Sidebar from "@/components/Sidebar";
import WorkspacePanel from "@/components/Workspace";
import ChatWindow from "@/components/ChatWindow";

export default function DashboardPage() {
  const { fetchAll, error, abrechnungen } = useStore();

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <div className="flex h-full flex-col overflow-hidden lg:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-end gap-3 border-b border-border px-5 py-2 text-xs no-print">
          <span className="text-muted-foreground">{abrechnungen.length} Abrechnung(en)</span>
          <a href="/api/export/csv" className="text-primary hover:underline">
            ⬇️ CSV exportieren
          </a>
        </div>
        {error && (
          <div className="bg-[var(--danger-bg)] text-[var(--destructive)] text-sm px-5 py-2 no-print">
            ⚠️ {error}
          </div>
        )}
        <WorkspacePanel />
      </div>
      <ChatWindow />
    </div>
  );
}
