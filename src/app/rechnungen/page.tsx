"use client";

import { useEffect, useState } from "react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { Abrechnung, Dokument } from "@/lib/types";
import ProgressRing from "@/components/ProgressRing";

async function patchAbrechnung(id: string, patch: Record<string, unknown>) {
  await fetch(`/api/abrechnungen/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export default function RechnungenPage() {
  const [abrechnungen, setAbrechnungen] = useState<Abrechnung[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    fetch("/api/abrechnungen")
      .then((r) => r.json())
      .then((d) => {
        setAbrechnungen(d.abrechnungen || []);
        setLoading(false);
      });
  };

  useEffect(refresh, []);

  const rechnungen = abrechnungen.flatMap((a) =>
    a.dokumente.map((d) => ({ dok: d, abrechnung: a }))
  );

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

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="mb-1 text-xl font-bold">📥 Rechnungen</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Alle erkannten Eingangsrechnungen aus sämtlichen Abrechnungen, mit Merkmalsprüfung und
        Zahlungsfreigabe.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : rechnungen.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Rechnungen hochgeladen.</p>
      ) : (
        <div className="space-y-2">
          {rechnungen.map(({ dok, abrechnung }) => {
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
