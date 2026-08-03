"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useHierarchyData } from "@/lib/use-hierarchy-data";
import { NodeSelection } from "@/components/LiegenschaftenTree";
import LiegenschaftDetail from "@/components/LiegenschaftDetail";

export default function MieterPage() {
  const { data, loading, refresh } = useHierarchyData();
  const [selection, setSelection] = useState<NodeSelection>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [wohnungId, setWohnungId] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim() || !wohnungId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/mieter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wohnungId, name }),
      });
      const { mieter } = await res.json();
      await refresh();
      if (mieter) setSelection({ type: "mieter", id: mieter.id });
      setName("");
      setWohnungId("");
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
            <h1 className="text-lg font-bold leading-tight">🧑 Mieter</h1>
            <p className="text-xs text-muted-foreground">Alle Mieter, objektübergreifend</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground"
            title="Neuer Mieter"
          >
            {showForm ? "✕" : "＋"}
          </button>
        </div>

        {showForm && (
          <div className="space-y-2 border-b border-border p-4">
            <select
              value={wohnungId}
              onChange={(e) => setWohnungId(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">— Wohnung/Einheit wählen —</option>
              {data.wohnungen.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.bezeichnung}
                </option>
              ))}
            </select>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name des Mieters"
              onKeyDown={(e) => e.key === "Enter" && create()}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
            <button
              onClick={create}
              disabled={busy || !name.trim() || !wohnungId}
              className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Anlegen
            </button>
          </div>
        )}

        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Lade…</div>
        ) : data.mieter.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Noch keine Mieter angelegt.</p>
        ) : (
          <div className="space-y-0.5 p-2">
            {data.mieter.map((m) => {
              const wohnung = data.wohnungen.find((w) => w.id === m.wohnungId);
              const active = selection?.type === "mieter" && selection.id === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelection({ type: "mieter", id: m.id })}
                  style={{ borderLeft: "3px solid #d97706" }}
                  className={cn(
                    "block w-full rounded px-2 py-2 text-left text-sm",
                    active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  <div className="truncate font-medium">🧑 {m.name}</div>
                  <div
                    className={cn(
                      "truncate text-xs",
                      active ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}
                  >
                    {m.nummer} · {wohnung?.bezeichnung || "ohne Wohnung"}
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
