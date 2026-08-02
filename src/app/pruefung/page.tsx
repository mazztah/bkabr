"use client";

import { useEffect, useState } from "react";
import LogPanel from "@/components/LogPanel";
import {
  PRUEF_MODUL_LABEL,
  PRUEF_MODUL_REIHENFOLGE,
  PruefBefund,
  PruefLauf,
  PruefModul,
  PruefStatus,
} from "@/lib/types";

const STATUS_ICON: Record<PruefStatus, string> = {
  ok: "✅",
  hinweise: "🟡",
  fehler: "🔴",
  ausstehend: "⏳",
};

const STATUS_TEXT: Record<PruefStatus, string> = {
  ok: "geprüft, fehlerfrei",
  hinweise: "Hinweise",
  fehler: "Fehler gefunden",
  ausstehend: "noch nicht geprüft",
};

const STATUS_BOX: Record<PruefStatus, string> = {
  ok: "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/40",
  hinweise: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
  fehler: "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40",
  ausstehend: "border-border bg-muted/40",
};

const SCHWEREGRAD_ICON: Record<PruefBefund["schweregrad"], string> = {
  hinweis: "ℹ️",
  warnung: "🟡",
  fehler: "🔴",
};

export default function PruefungPage() {
  const [lauf, setLauf] = useState<PruefLauf | null>(null);
  const [loading, setLoading] = useState(true);
  const [pruefeLauf, setPruefeLauf] = useState(false);
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string>>(new Set());
  const [anwendenBusy, setAnwendenBusy] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  const laden = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pruefung/latest");
      const json = await res.json();
      setLauf(json.lauf);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    laden();
  }, []);

  const jetztPruefen = async () => {
    setPruefeLauf(true);
    setMeldung(null);
    try {
      const res = await fetch("/api/pruefung/run", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setLauf(json.lauf);
        setAusgewaehlt(new Set());
      } else {
        setMeldung(json.error || "Prüfung fehlgeschlagen");
      }
    } finally {
      setPruefeLauf(false);
    }
  };

  const offeneBefunde = (lauf?.befunde || []).filter((b) => b.status === "offen");
  const befundeProModul = new Map<PruefModul, PruefBefund[]>();
  for (const b of offeneBefunde) {
    const liste = befundeProModul.get(b.modul) || [];
    liste.push(b);
    befundeProModul.set(b.modul, liste);
  }

  const toggle = (id: string) => {
    setAusgewaehlt((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const alleAuswaehlen = () => setAusgewaehlt(new Set(offeneBefunde.map((b) => b.id)));
  const auswahlAufheben = () => setAusgewaehlt(new Set());

  const ausgewaehlteUebernehmen = async () => {
    if (!lauf || ausgewaehlt.size === 0) return;
    setAnwendenBusy(true);
    setMeldung(null);
    try {
      const res = await fetch("/api/pruefung/anwenden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ laufId: lauf.id, befundIds: Array.from(ausgewaehlt) }),
      });
      const json = await res.json();
      if (res.ok) {
        setLauf(json.lauf);
        const erfolge = (json.ergebnisse || []).filter((e: any) => e.ok).length;
        const fehlgeschlagen = (json.ergebnisse || []).length - erfolge;
        setMeldung(
          `${erfolge} Korrektur(en) übernommen${fehlgeschlagen > 0 ? `, ${fehlgeschlagen} fehlgeschlagen` : ""}.`
        );
        setAusgewaehlt(new Set());
      } else {
        setMeldung(json.error || "Übernahme fehlgeschlagen");
      }
    } finally {
      setAnwendenBusy(false);
    }
  };

  const alleUebernehmenDirekt = async () => {
    setAusgewaehlt(new Set(offeneBefunde.map((b) => b.id)));
    // kleiner Timeout, damit der State sicher gesetzt ist, bevor wir senden
    setTimeout(() => ausgewaehlteUebernehmen(), 0);
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-bold">🔍 Plausibilitätsprüfung</h1>
          <p className="text-sm text-muted-foreground">
            Automatisierte KI-Prüfung deiner Stammdaten und Dokumentenzuordnung. Findet Fehler
            erstellt daraus eine To-do-Liste, die du komplett oder einzeln freigeben kannst.
          </p>
        </div>
        <button
          onClick={jetztPruefen}
          disabled={pruefeLauf}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pruefeLauf ? "Prüfe …" : "🔍 Jetzt prüfen"}
        </button>
      </div>

      {lauf?.abgeschlossenAm && (
        <p className="mb-4 text-xs text-muted-foreground">
          Letzter Prüflauf: {new Date(lauf.abgeschlossenAm).toLocaleString("de-DE")}
        </p>
      )}

      {/* Modul-Dashboard */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {PRUEF_MODUL_REIHENFOLGE.map((modul) => {
          const status: PruefStatus = lauf?.modulStatus?.[modul] || "ausstehend";
          return (
            <div key={modul} className={`rounded-lg border p-3 ${STATUS_BOX[status]}`}>
              <p className="text-xs font-semibold">{PRUEF_MODUL_LABEL[modul]}</p>
              <p className="mt-1 text-sm">
                {STATUS_ICON[status]} {STATUS_TEXT[status]}
              </p>
            </div>
          );
        })}
      </div>

      {meldung && (
        <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm">{meldung}</p>
      )}

      {/* To-do-Liste der Befunde */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Lade …</p>
      ) : !lauf ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Noch kein Prüflauf durchgeführt. Klicke oben auf „Jetzt prüfen".
        </p>
      ) : offeneBefunde.length === 0 ? (
        <p className="rounded-lg border border-dashed border-green-300 bg-green-50 p-6 text-center text-sm dark:border-green-900 dark:bg-green-950/40">
          ✅ Keine offenen Befunde – alles geprüft und fehlerfrei.
        </p>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">
              {offeneBefunde.length} offene Befunde – To-do-Liste
            </p>
            <button onClick={alleAuswaehlen} className="rounded border border-border px-2 py-1 text-xs">
              Alle auswählen
            </button>
            <button onClick={auswahlAufheben} className="rounded border border-border px-2 py-1 text-xs">
              Auswahl aufheben
            </button>
            <button
              onClick={ausgewaehlteUebernehmen}
              disabled={ausgewaehlt.size === 0 || anwendenBusy}
              className="ml-auto rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
            >
              {anwendenBusy ? "Übernehme…" : `✓ Ausgewählte übernehmen (${ausgewaehlt.size})`}
            </button>
            <button
              onClick={alleUebernehmenDirekt}
              disabled={anwendenBusy}
              className="rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-40"
            >
              ✓✓ Alle freigeben
            </button>
          </div>

          <div className="space-y-4">
            {PRUEF_MODUL_REIHENFOLGE.filter((m) => befundeProModul.has(m)).map((modul) => (
              <div key={modul}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {PRUEF_MODUL_LABEL[modul]}
                </p>
                <div className="space-y-1.5">
                  {befundeProModul.get(modul)!.map((b) => (
                    <label
                      key={b.id}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-card px-3 py-2.5 hover:border-primary/50"
                    >
                      <input
                        type="checkbox"
                        checked={ausgewaehlt.has(b.id)}
                        onChange={() => toggle(b.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {SCHWEREGRAD_ICON[b.schweregrad]} {b.titel}
                        </p>
                        <p className="text-xs text-muted-foreground">{b.beschreibung}</p>
                        {b.vorschlag && (
                          <p className="mt-0.5 text-xs text-primary">→ Vorschlag: {b.vorschlag.beschreibung}</p>
                        )}
                        {!b.vorschlag && (
                          <p className="mt-0.5 text-xs italic text-muted-foreground">
                            Kein automatischer Korrekturvorschlag – bitte manuell prüfen.
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <LogPanel />
      </div>
    </div>
  );
}
