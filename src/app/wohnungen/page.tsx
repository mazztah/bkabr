"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useHierarchyData } from "@/lib/use-hierarchy-data";
import { NodeSelection } from "@/components/LiegenschaftenTree";
import LiegenschaftDetail from "@/components/LiegenschaftDetail";

export default function WohnungenPage() {
  const { data, loading, refresh } = useHierarchyData();
  const [selection, setSelection] = useState<NodeSelection>(null);
  const [showForm, setShowForm] = useState(false);
  const [bezeichnung, setBezeichnung] = useState("");
  const [gebaeudeId, setGebaeudeId] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!bezeichnung.trim() || !gebaeudeId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/wohnungen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gebaeudeId, bezeichnung }),
      });
      const { wohnung } = await res.json();
      await refresh();
      if (wohnung) setSelection({ type: "wohnung", id: wohnung.id });
      setBezeichnung("");
      setGebaeudeId("");
      setShowForm(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden lg:flex-row">
      <aside className="w-full shrink-0 overflow-y-auto border-r border-border bg-card max-h-[46vh] lg:h-full lg:max-h-none lg:w-80">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h1 className="text-lg font-bold leading-tight">🏢 Wohnungen</h1>
            <p className="text-xs text-muted-foreground">Alle Wohnungen/Einheiten, objektübergreifend</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground"
            title="Neue Wohnung"
          >
            {showForm ? "✕" : "＋"}
          </button>
        </div>

        {showForm && (
          <div className="space-y-2 border-b border-border p-4">
            <select
              value={gebaeudeId}
              onChange={(e) => setGebaeudeId(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">— Gebäude wählen —</option>
              {data.gebaeude.map((g) => {
                const lg = data.liegenschaften.find((l) => l.id === g.liegenschaftId);
                return (
                  <option key={g.id} value={g.id}>
                    {lg ? `${lg.name} – ` : ""}
                    {g.name}
                  </option>
                );
              })}
            </select>
            <input
              value={bezeichnung}
              onChange={(e) => setBezeichnung(e.target.value)}
              placeholder="Bezeichnung, z.B. 1. OG links"
              onKeyDown={(e) => e.key === "Enter" && create()}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
            <button
              onClick={create}
              disabled={busy || !bezeichnung.trim() || !gebaeudeId}
              className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Anlegen
            </button>
          </div>
        )}

        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Lade…</div>
        ) : data.wohnungen.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Noch keine Wohnungen angelegt.</p>
        ) : (
          <div className="space-y-0.5 p-2">
            {data.wohnungen.map((w) => {
              const geb = data.gebaeude.find((g) => g.id === w.gebaeudeId);
              const mieterAnzahl = data.mieter.filter((m) => m.wohnungId === w.id).length;
              const active = selection?.type === "wohnung" && selection.id === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => setSelection({ type: "wohnung", id: w.id })}
                  style={{ borderLeft: "3px solid #0ea5e9" }}
                  className={cn(
                    "block w-full rounded px-2 py-2 text-left text-sm",
                    active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  <div className="truncate font-medium">🏢 {w.bezeichnung}</div>
                  <div
                    className={cn(
                      "truncate text-xs",
                      active ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}
                  >
                    {geb?.name || "ohne Gebäude"} · {mieterAnzahl > 0 ? `${mieterAnzahl} Mieter` : "leer"}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <LiegenschaftDetail data={data} selection={selection} onSelect={setSelection} onChanged={refresh} />
      </main>
    </div>
  );
}
