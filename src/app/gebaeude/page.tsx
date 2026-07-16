"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useHierarchyData } from "@/lib/use-hierarchy-data";
import { NodeSelection } from "@/components/LiegenschaftenTree";
import LiegenschaftDetail from "@/components/LiegenschaftDetail";

export default function GebaeudePage() {
  const { data, loading, refresh } = useHierarchyData();
  const [selection, setSelection] = useState<NodeSelection>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [liegenschaftId, setLiegenschaftId] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim() || !liegenschaftId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/gebaeude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liegenschaftId, name }),
      });
      const { gebaeude } = await res.json();
      await refresh();
      if (gebaeude) setSelection({ type: "gebaeude", id: gebaeude.id });
      setName("");
      setLiegenschaftId("");
      setShowForm(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden lg:flex-row">
      <aside className="w-full shrink-0 border-r border-border bg-card lg:h-full lg:w-80 lg:overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h1 className="text-lg font-bold leading-tight">🏢 Gebäude</h1>
            <p className="text-xs text-muted-foreground">Alle Gebäude, liegenschaftsübergreifend</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground"
            title="Neues Gebäude"
          >
            {showForm ? "✕" : "＋"}
          </button>
        </div>

        {showForm && (
          <div className="space-y-2 border-b border-border p-4">
            <select
              value={liegenschaftId}
              onChange={(e) => setLiegenschaftId(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">— Liegenschaft wählen —</option>
              {data.liegenschaften.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name des Gebäudes"
              onKeyDown={(e) => e.key === "Enter" && create()}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
            <button
              onClick={create}
              disabled={busy || !name.trim() || !liegenschaftId}
              className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Anlegen
            </button>
          </div>
        )}

        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Lade…</div>
        ) : data.gebaeude.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Noch keine Gebäude angelegt.</p>
        ) : (
          <div className="space-y-0.5 p-2">
            {data.gebaeude.map((g) => {
              const lieg = data.liegenschaften.find((l) => l.id === g.liegenschaftId);
              const active = selection?.type === "gebaeude" && selection.id === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => setSelection({ type: "gebaeude", id: g.id })}
                  style={{ borderLeft: "3px solid #9333ea" }}
                  className={cn(
                    "block w-full rounded px-2 py-2 text-left text-sm",
                    active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  <div className="truncate font-medium">🏢 {g.name}</div>
                  <div
                    className={cn(
                      "truncate text-xs",
                      active ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}
                  >
                    {g.nummer} · {lieg?.name || "ohne Liegenschaft"}
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
