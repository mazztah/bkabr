"use client";

import { useEffect, useMemo, useState } from "react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { Abrechnung, Dokument, Liegenschaft } from "@/lib/types";
import ProgressRing from "@/components/ProgressRing";

async function patchAbrechnung(id: string, patch: Record<string, unknown>) {
  await fetch(`/api/abrechnungen/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

type SortKey = "liegenschaft" | "name" | "firma" | "betrag" | "datum";

export default function RechnungenPage() {
  const [abrechnungen, setAbrechnungen] = useState<Abrechnung[]>([]);
  const [liegenschaften, setLiegenschaften] = useState<Liegenschaft[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("datum");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const refresh = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/abrechnungen").then((r) => r.json()),
      fetch("/api/liegenschaften").then((r) => r.json()),
    ]).then(([a, l]) => {
      setAbrechnungen(a.abrechnungen || []);
      setLiegenschaften(l.liegenschaften || []);
      setLoading(false);
    });
  };

  useEffect(refresh, []);

  const lgMap = useMemo(() => new Map(liegenschaften.map((l) => [l.id, l.name])), [liegenschaften]);

  const rechnungen = useMemo(() => {
    const alle = abrechnungen.flatMap((a) =>
      a.dokumente.map((d) => ({
        dok: d,
        abrechnung: a,
        liegenschaftName: a.liegenschaftId ? lgMap.get(a.liegenschaftId) || "" : "",
      }))
    );
    const richtung = sortDir === "asc" ? 1 : -1;
    return [...alle].sort((x, y) => {
      switch (sortKey) {
        case "liegenschaft":
          return x.liegenschaftName.localeCompare(y.liegenschaftName) * richtung;
        case "name":
          return x.dok.name.localeCompare(y.dok.name) * richtung;
        case "firma":
          return (x.dok.firma || "").localeCompare(y.dok.firma || "") * richtung;
        case "betrag":
          return ((x.dok.betrag || 0) - (y.dok.betrag || 0)) * richtung;
        case "datum":
        default:
          return (
            (new Date(x.dok.uploadedAt).getTime() - new Date(y.dok.uploadedAt).getTime()) * richtung
          );
      }
    });
  }, [abrechnungen, lgMap, sortKey, sortDir]);

  const freigeben = async (abrechnung: Abrechnung, dok: Dokument) => {
    const status = dok.pruefung?.zahlungsfreigabe?.status === "freigegeben" ? "offen" : "freigegeben";
    const updatedDokumente = abrechnung.dokumente.map((d) =>
      d.id === dok.id
        ? {
            ...d,
            pruefung: {
              ...(d.pruefung || { erkannteMerkmale: [], score: 0, akzeptiert: false }),
              zahlungsfreigabe: { status, timestamp: new Date().toISOString() },
            },
          }
        : d
    );
    await patchAbrechnung(abrechnung.id, { dokumente: updatedDokumente });
    refresh();
  };

  const sortOptionen: { key: SortKey; label: string }[] = [
    { key: "datum", label: "Hochgeladen" },
    { key: "liegenschaft", label: "Liegenschaft" },
    { key: "name", label: "Name" },
    { key: "firma", label: "Firma" },
    { key: "betrag", label: "Betrag" },
  ];

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-bold">📥 Rechnungen</h1>
          <p className="text-sm text-muted-foreground">
            Alle erkannten Eingangsrechnungen aus sämtlichen Abrechnungen, mit Merkmalsprüfung und
            Zahlungsfreigabe – sortierbar wie in Excel, exportierbar als Tabelle.
          </p>
        </div>
        <a
          href="/api/export/xlsx"
          className="shrink-0 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          📊 Als Excel exportieren
        </a>
      </div>

      {rechnungen.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Sortieren nach:</span>
          {sortOptionen.map((o) => (
            <button
              key={o.key}
              onClick={() => {
                if (sortKey === o.key) {
                  setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                } else {
                  setSortKey(o.key);
                  setSortDir("asc");
                }
              }}
              className={cn(
                "rounded-md border px-2.5 py-1.5",
                sortKey === o.key ? "border-primary bg-secondary font-medium" : "border-border hover:bg-muted"
              )}
            >
              {o.label} {sortKey === o.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : rechnungen.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Rechnungen hochgeladen.</p>
      ) : (
        <div className="space-y-2">
          {rechnungen.map(({ dok, abrechnung, liegenschaftName }) => {
            const freigegeben = dok.pruefung?.zahlungsfreigabe?.status === "freigegeben";
            return (
              <div key={dok.id} className="rounded-lg border border-border bg-card p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {dok.nummer || "—"}
                    </span>{" "}
                    <span className="font-semibold">{dok.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {dok.pruefung && <ProgressRing percent={dok.pruefung.score * 100} />}
                    {dok.storedFileName && (
                      <a
                        href={`/api/files/${dok.storedFileName}?mime=${encodeURIComponent(
                          dok.mimeType
                        )}&name=${encodeURIComponent(dok.name)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                      >
                        👁 Ansehen
                      </a>
                    )}
                    <button
                      onClick={() => freigeben(abrechnung, dok)}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-medium",
                        freigegeben
                          ? "bg-[var(--success-bg)] text-[var(--success)]"
                          : "bg-primary text-primary-foreground"
                      )}
                    >
                      {freigegeben ? "✓ Freigegeben" : "Freigeben"}
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-4">
                  {liegenschaftName && <span>Liegenschaft: {liegenschaftName}</span>}
                  {dok.rechnungsnummer && <span>Nr.: {dok.rechnungsnummer}</span>}
                  {dok.rechnungsdatum && <span>Datum: {dok.rechnungsdatum}</span>}
                  {dok.firma && <span>Firma: {dok.firma}</span>}
                  {typeof dok.betrag === "number" && dok.betrag > 0 && (
                    <span>Betrag: {formatCurrency(dok.betrag)}</span>
                  )}
                  {dok.leistungsart && <span>Leistung: {dok.leistungsart}</span>}
                  {dok.leistungsort && <span>Ort: {dok.leistungsort}</span>}
                  <a
                    href={
                      abrechnung.wohnungId
                        ? `/liegenschaften?select=wohnung:${abrechnung.wohnungId}`
                        : abrechnung.gebaeudeId
                        ? `/liegenschaften?select=gebaeude:${abrechnung.gebaeudeId}`
                        : abrechnung.liegenschaftId
                        ? `/liegenschaften?select=liegenschaft:${abrechnung.liegenschaftId}`
                        : "/"
                    }
                    className="text-primary hover:underline"
                  >
                    Zugeordnet zu: {abrechnung.name} ↗
                  </a>
                  <span>Hochgeladen: {formatDate(dok.uploadedAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
