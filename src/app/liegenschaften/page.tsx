"use client";

import { useCallback, useEffect, useState } from "react";
import { Abrechnung, Gebaeude, Liegenschaft, Mieter, Wohnung } from "@/lib/types";
import LiegenschaftenTree, { NodeSelection } from "@/components/LiegenschaftenTree";
import LiegenschaftDetail from "@/components/LiegenschaftDetail";

export interface HierarchyData {
  liegenschaften: Liegenschaft[];
  gebaeude: Gebaeude[];
  wohnungen: Wohnung[];
  mieter: Mieter[];
  abrechnungen: Abrechnung[];
}

const EMPTY: HierarchyData = {
  liegenschaften: [],
  gebaeude: [],
  wohnungen: [],
  mieter: [],
  abrechnungen: [],
};

export default function LiegenschaftenPage() {
  const [data, setData] = useState<HierarchyData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<NodeSelection>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [l, g, w, m, a] = await Promise.all([
        fetch("/api/liegenschaften").then((r) => r.json()),
        fetch("/api/gebaeude").then((r) => r.json()),
        fetch("/api/wohnungen").then((r) => r.json()),
        fetch("/api/mieter").then((r) => r.json()),
        fetch("/api/abrechnungen").then((r) => r.json()),
      ]);
      setData({
        liegenschaften: l.liegenschaften || [],
        gebaeude: g.gebaeude || [],
        wohnungen: w.wohnungen || [],
        mieter: m.mieter || [],
        abrechnungen: a.abrechnungen || [],
      });
      setError(null);
    } catch {
      setError("Daten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
