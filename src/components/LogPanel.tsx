"use client";

import { useEffect, useState } from "react";
import { SYSTEM_LOG_TYP_ICON, SystemLogEintrag } from "@/lib/types";

/**
 * Kleines Log-Fenster, das die letzten System-Ereignisse anzeigt (Uploads,
 * Zuordnungen, Neuanlagen, Änderungen, Löschungen, Prüfläufe). Pollt alle paar
 * Sekunden nach, damit Aktionen aus anderen Tabs/Bereichen sichtbar werden, und
 * bietet eine einfache Volltextsuche – genau das, was auch ein Agent nutzen
 * würde, um gezielt nachzuvollziehen, was auf der Plattform passiert ist.
 */
export default function LogPanel({ compact = false }: { compact?: boolean }) {
  const [log, setLog] = useState<SystemLogEintrag[]>([]);
  const [suche, setSuche] = useState("");
  const [offen, setOffen] = useState(!compact);
  const [loading, setLoading] = useState(true);

  const laden = async (q?: string) => {
    try {
      const res = await fetch(`/api/log${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      const json = await res.json();
      setLog(json.log || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    laden();
    const interval = setInterval(() => laden(suche), 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => laden(suche), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suche]);

  const formatZeit = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setOffen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="text-sm font-semibold">🪵 System-Log</span>
        <span className="text-xs text-muted-foreground">{offen ? "▲ einklappen" : "▼ aufklappen"}</span>
      </button>
      {offen && (
        <div className="border-t border-border p-3">
          <input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Log durchsuchen (z.B. Liegenschaft, Rechnung, Dateiname) …"
            className="mb-2 w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
          />
          <div className="max-h-72 space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
            {loading ? (
              <p className="text-muted-foreground">Lade …</p>
            ) : log.length === 0 ? (
              <p className="text-muted-foreground">Keine Log-Einträge gefunden.</p>
            ) : (
              log.map((e) => (
                <div key={e.id} className="flex gap-2 border-b border-border/40 py-1">
                  <span className="shrink-0 text-muted-foreground">{formatZeit(e.zeitpunkt)}</span>
                  <span className="shrink-0">{SYSTEM_LOG_TYP_ICON[e.typ]}</span>
                  <span className="break-words">{e.text}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
