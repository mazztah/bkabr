"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LogPanel from "@/components/LogPanel";
import { AblageDokument, AblageStatus, DOKUMENT_TYP_LABEL } from "@/lib/types";

const STATUS_LABEL: Record<AblageStatus, string> = {
  neu: "🆕 Neu",
  in_pruefung: "🔍 Wird geprüft",
  zugeordnet: "✅ Zugeordnet",
  verworfen: "🗑️ Verworfen",
};

const STATUS_FARBE: Record<AblageStatus, string> = {
  neu: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  in_pruefung: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  zugeordnet: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  verworfen: "bg-muted text-muted-foreground",
};

function formatGroesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatZeit(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AblagePage() {
  const [dokumente, setDokumente] = useState<AblageDokument[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"offen" | "alle">("offen");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bestaetigungOffen, setBestaetigungOffen] = useState(false);

  const laden = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ablage");
      const json = await res.json();
      setDokumente(json.ablage || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    laden();
  }, []);

  const sichtbar = dokumente.filter((d) => (filter === "alle" ? true : d.status !== "zugeordnet"));
  const nichtZugeordnetAnzahl = dokumente.filter((d) => d.status !== "zugeordnet").length;

  const einzelnLoeschen = async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/ablage/${id}`, { method: "DELETE" });
      setDokumente((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  const alleNichtZugeordnetenLoeschen = async () => {
    setBulkBusy(true);
    try {
      const res = await fetch("/api/ablage/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestaetigt: true }),
      });
      if (res.ok) {
        setBestaetigungOffen(false);
        await laden();
      }
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-bold">📥 Ablage</h1>
          <p className="text-sm text-muted-foreground">
            Alle hochgeladenen Dokumente landen hier zuerst. Sobald die KI sie im{" "}
            <Link href="/smart-upload" className="underline">
              🧠 Intelligenten Upload
            </Link>{" "}
            korrekt zugeordnet hat, verschwinden sie aus dieser Ansicht. Nicht zugeordnete oder
            verworfene Dokumente kannst du hier löschen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "offen" | "alle")}
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="offen">Nur offene/verworfene</option>
            <option value="alle">Alle (inkl. zugeordnet)</option>
          </select>
          <button
            onClick={() => setBestaetigungOffen(true)}
            disabled={nichtZugeordnetAnzahl === 0}
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive disabled:opacity-40"
          >
            🗑️ Alle nicht zugeordneten löschen ({nichtZugeordnetAnzahl})
          </button>
        </div>
      </div>

      {bestaetigungOffen && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="mb-1 text-sm font-semibold">⚠️ Bist du sicher?</p>
          <p className="mb-3 text-sm text-muted-foreground">
            Es werden <strong>{nichtZugeordnetAnzahl}</strong> nicht zugeordnete bzw. verworfene
            Dokument(e) unwiderruflich gelöscht (inkl. der Dateien). Bereits zugeordnete Dokumente
            sind davon nicht betroffen.
          </p>
          <div className="flex gap-2">
            <button
              onClick={alleNichtZugeordnetenLoeschen}
              disabled={bulkBusy}
              className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground disabled:opacity-50"
            >
              {bulkBusy ? "Lösche…" : "Ja, endgültig löschen"}
            </button>
            <button
              onClick={() => setBestaetigungOffen(false)}
              className="rounded-md border border-border px-3 py-1.5 text-sm"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 grid gap-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Lade …</p>
        ) : sichtbar.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {filter === "offen" ? "Keine offenen Dokumente in der Ablage. 🎉" : "Die Ablage ist leer."}
          </p>
        ) : (
          sichtbar.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
            >
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_FARBE[d.status]}`}>
                {STATUS_LABEL[d.status]}
              </span>
              <div className="min-w-[180px] flex-1">
                <p className="truncate text-sm font-medium">{d.dateiName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatZeit(d.hochgeladenAm)} · {formatGroesse(d.groesse)}
                  {d.erkannterTyp && ` · erkannt als: ${DOKUMENT_TYP_LABEL[d.erkannterTyp]}`}
                  {typeof d.konfidenz === "number" && ` (${Math.round(d.konfidenz * 100)}% Konfidenz)`}
                </p>
                {d.zugeordnetAn && (
                  <p className="text-xs text-green-700 dark:text-green-400">→ {d.zugeordnetAn.label}</p>
                )}
              </div>
              <button
                onClick={() => einzelnLoeschen(d.id)}
                disabled={busyId === d.id}
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-destructive hover:text-destructive disabled:opacity-50"
              >
                {busyId === d.id ? "…" : "🗑️ Löschen"}
              </button>
            </div>
          ))
        )}
      </div>

      <LogPanel />
    </div>
  );
}
