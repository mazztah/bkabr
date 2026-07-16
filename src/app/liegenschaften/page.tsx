"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useHierarchyData } from "@/lib/use-hierarchy-data";
import LiegenschaftenTree, { NodeSelection } from "@/components/LiegenschaftenTree";
import LiegenschaftDetail from "@/components/LiegenschaftDetail";

function LiegenschaftenPageInner() {
  const { data, loading, error, refresh } = useHierarchyData();
  const [selection, setSelection] = useState<NodeSelection>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const select = searchParams.get("select");
    if (!select || loading) return;
    const [type, id] = select.split(":");
    if (type && id && ["liegenschaft", "gebaeude", "wohnung", "mieter"].includes(type)) {
      setSelection({ type, id } as NodeSelection);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return (
    <div className="flex h-full flex-col overflow-hidden lg:flex-row">
      <aside className="w-full shrink-0 border-r border-border bg-card lg:h-full lg:w-80 lg:overflow-y-auto">
        <div className="border-b border-border p-4">
          <h1 className="text-lg font-bold leading-tight">Liegenschaften</h1>
          <p className="text-xs text-muted-foreground">
            Grundstücke, Gebäude, Wohnungen &amp; Mieter
          </p>
        </div>
        {error && (
          <div className="bg-[var(--danger-bg)] px-4 py-2 text-xs text-[var(--destructive)]">
            ⚠️ {error}
          </div>
        )}
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Lade…</div>
        ) : (
          <LiegenschaftenTree
            data={data}
            selection={selection}
            onSelect={setSelection}
            onChanged={refresh}
          />
        )}
      </aside>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <LiegenschaftDetail
          data={data}
          selection={selection}
          onSelect={setSelection}
          onChanged={refresh}
        />
      </main>
    </div>
  );
}

export default function LiegenschaftenPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Lade…</div>}>
      <LiegenschaftenPageInner />
    </Suspense>
  );
}
