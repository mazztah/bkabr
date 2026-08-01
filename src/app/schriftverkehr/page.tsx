"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useHierarchyData } from "@/lib/use-hierarchy-data";
import SchriftverkehrPanel from "@/components/SchriftverkehrPanel";

export default function SchriftverkehrPage() {
  const { data, loading } = useHierarchyData();
  const [mieterId, setMieterId] = useState<string | null>(null);

  const mieter = data.mieter.find((m) => m.id === mieterId);
  const wohnung = mieter ? data.wohnungen.find((w) => w.id === mieter.wohnungId) : undefined;
  const gebaeude = wohnung ? data.gebaeude.find((g) => g.id === wohnung.gebaeudeId) : undefined;
  const liegenschaft = gebaeude
    ? data.liegenschaften.find((l) => l.id === gebaeude.liegenschaftId)
    : undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden lg:flex-row">
      <aside className="w-full shrink-0 border-r border-border bg-card lg:h-full lg:w-80 lg:overflow-y-auto">
        <div className="border-b border-border p-4">
          <h1 className="text-lg font-bold leading-tight">✉️ Schriftverkehr</h1>
          <p className="text-xs text-muted-foreground">
            Mieter wählen, um ein Anschreiben zu erstellen
          </p>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Lade…</div>
        ) : data.mieter.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Noch keine Mieter angelegt.</p>
        ) : (
          <div className="space-y-0.5 p-2">
            {data.mieter.map((m) => {
              const w = data.wohnungen.find((w) => w.id === m.wohnungId);
              const active = mieterId === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMieterId(m.id)}
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
                    {w?.bezeichnung || "ohne Wohnung"}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      <main className="min-h-0 flex-1 overflow-y-auto p-5">
        {mieter ? (
          <SchriftverkehrPanel
            mieter={mieter}
            wohnung={wohnung}
            gebaeude={gebaeude}
            liegenschaft={liegenschaft}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Wähle links einen Mieter aus, um ein Anschreiben zu erstellen.
          </p>
        )}
      </main>
    </div>
  );
}
