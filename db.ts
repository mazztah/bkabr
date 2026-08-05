"use client";

import { useEffect, useState } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import { AiObservatoryUebersicht } from "@/lib/types";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} Mio.`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)} k`;
  return String(n);
}

export default function AiObservatory() {
  const [data, setData] = useState<AiObservatoryUebersicht | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/ai-observatory")
      .then((r) => r.json())
      .then((d) => setData(d.uebersicht || null));
  }, []);

  return (
    <div className="mb-6 rounded-xl border border-border bg-card">
      <div className="border-b border-border p-3">
        <h2 className="text-sm font-semibold">🔭 AI Cost &amp; Model Observatory</h2>
        <p className="text-xs text-muted-foreground">
          Jeder LLM-Aufruf der App läuft durch eine zentrale Funktion — hier gemessen, nicht
          geschätzt (sofern der Provider Token-Zahlen liefert). Alle aktuell verwendeten Modelle
          laufen auf Free-Tier-Kontingenten, daher 0 $ Kosten; die Preis-Logik ist vorbereitet für
          den Tag, an dem ein kostenpflichtiges Modell dazukommt.
        </p>
      </div>

      {!data ? (
        <p className="p-3 text-xs text-muted-foreground">Lade…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="border-b border-border p-3 lg:border-b-0 lg:border-r">
            <div className="mb-2 grid grid-cols-3 gap-2">
              <SummaryTile label="Aufrufe" value={String(data.gesamtAufrufe)} />
              <SummaryTile
                label="Tokens (in/out)"
                value={`${formatTokens(data.gesamtPromptTokens)} / ${formatTokens(data.gesamtCompletionTokens)}`}
              />
              <SummaryTile label="Kosten" value={formatCurrency(data.gesamtKostenUsd)} />
            </div>

            {data.proModell.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Noch keine protokollierten Aufrufe — sobald der Agent im Chat genutzt wird, füllt
                sich diese Tabelle live.
              </p>
            ) : (
              <div className="space-y-1.5">
                {data.proModell.map((m) => (
                  <div
                    key={`${m.provider}:${m.model}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{m.model}</div>
                      <div className="text-muted-foreground">
                        {m.provider} · {m.aufrufe} Aufrufe
                        {m.fehlgeschlageneFallbacks > 0 && ` · ${m.fehlgeschlageneFallbacks}x als Fallback`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <div>{formatTokens(m.promptTokens + m.completionTokens)} Tok.</div>
                      <div className="text-muted-foreground">{formatCurrency(m.geschaetzteKostenUsd)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-3">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">
              Free-Tier-Provider-Katalog
            </div>
            <div className="space-y-1.5">
              {data.providerKatalog.map((p) => (
                <div key={p.provider} className="rounded-lg border border-border p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{p.label}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                        p.konfiguriert
                          ? "bg-[var(--success-bg)] text-[var(--success)]"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {p.konfiguriert ? "aktiv" : "verfügbar"}
                    </span>
                  </div>
                  <div className="mt-1 text-muted-foreground">{p.hinweis}</div>
                  {!p.konfiguriert && (
                    <code className="mt-1 block truncate rounded bg-muted px-1.5 py-0.5 text-[10px]">
                      {p.benoetigteEnvVars.join("=... ")}=...
                    </code>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-2 text-center">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}
