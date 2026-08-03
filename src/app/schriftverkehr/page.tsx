"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useHierarchyData } from "@/lib/use-hierarchy-data";
import SchriftverkehrPanel from "@/components/SchriftverkehrPanel";
import { SchriftverkehrDokument } from "@/lib/types";

type Tab = "erstellen" | "archiv";

export default function SchriftverkehrPage() {
  const { data, loading } = useHierarchyData();
  const [mieterId, setMieterId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("erstellen");
  const [archiv, setArchiv] = useState<SchriftverkehrDokument[]>([]);
  const [archivLoading, setArchivLoading] = useState(false);

  const mieter = data.mieter.find((m) => m.id === mieterId);
  const wohnung = mieter ? data.wohnungen.find((w) => w.id === mieter.wohnungId) : undefined;
  const gebaeude = wohnung ? data.gebaeude.find((g) => g.id === wohnung.gebaeudeId) : undefined;
  const liegenschaft = gebaeude
    ? data.liegenschaften.find((l) => l.id === gebaeude.liegenschaftId)
    : undefined;

  const loadArchiv = useCallback(async () => {
    setArchivLoading(true);
    try {
      const res = await fetch("/api/schriftverkehr");
      if (!res.ok) return;
      const json = await res.json();
      setArchiv(json.dokumente || []);
    } catch {
      /* ignore */
    } finally {
      setArchivLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "archiv") loadArchiv();
  }, [tab, loadArchiv]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2">
        <button
          onClick={() => setTab("erstellen")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm",
            tab === "erstellen" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          Manuell erstellen
        </button>
        <button
          onClick={() => setTab("archiv")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm",
            tab === "archiv" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          Archiv / Agent-Briefe
          {archiv.length > 0 && tab !== "archiv" ? ` (${archiv.length})` : ""}
        </button>
        <p className="ml-auto hidden text-xs text-muted-foreground sm:block">
          Tipp: Im Chat z.B. „Erstelle alle Mahnungen für die Spannhagengartenstraße“ – der Agent legt
          die Briefe hier ab.
        </p>
      </div>

      {tab === "archiv" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-lg font-bold">Gespeicherter Schriftverkehr</h1>
            <button
              onClick={loadArchiv}
              className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
            >
              ↻ Aktualisieren
            </button>
          </div>
          {archivLoading ? (
            <p className="text-sm text-muted-foreground">Lade…</p>
          ) : archiv.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Briefe gespeichert. Erstelle welche manuell oder lass den Agenten im Chat
              Mahnungen/Anschreiben erzeugen.
            </p>
          ) : (
            <ul className="space-y-3">
              {archiv.map((d) => (
                <li key={d.id} className="rounded-lg border border-border bg-card p-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">
                        {d.nummer ? `${d.nummer} · ` : ""}
                        {d.templateLabel}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {d.mieterName}
                        {d.liegenschaftName ? ` · ${d.liegenschaftName}` : ""} · {d.status} · Quelle:{" "}
                        {d.quelle}
                      </div>
                      <div className="mt-1 text-xs">{d.betreff}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(d.createdAt).toLocaleString("de-DE")}
                    </div>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-primary">Volltext</summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 font-mono text-[11px] leading-relaxed">
                      {d.text}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <aside className="w-full shrink-0 overflow-y-auto border-r border-border bg-card max-h-[46vh] lg:h-full lg:max-h-none lg:w-80">
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
                Wähle links einen Mieter aus, um ein Anschreiben zu erstellen – oder nutze den Chat
                für automatische Mahnläufe.
              </p>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
