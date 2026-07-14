"use client";

import { Abrechnung } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function PreviewModal({
  abrechnung,
  onClose,
}: {
  abrechnung: Abrechnung;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 no-print">
      <div className="bg-card rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">Vorschau – Druckbar</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-8 bg-white text-black" id="print-area">
          <h1 className="text-3xl font-bold text-center mb-6">Betriebskostenabrechnung</h1>
          <p>
            <strong>Objekt:</strong> {abrechnung.name}
          </p>
          <p>
            <strong>Adresse:</strong> {abrechnung.adresse || "-"}
          </p>
          <p>
            <strong>Objekttyp:</strong> {abrechnung.objektTyp}
          </p>
          <p>
            <strong>Zeitraum:</strong> {abrechnung.zeitraum || "-"}
          </p>
          <p>
            <strong>Status:</strong> {abrechnung.status}
          </p>

          <h2 className="text-xl font-bold mt-8 mb-3">Kostenaufstellung</h2>
          {abrechnung.workspace.positionen.length === 0 ? (
            <p className="text-gray-500">Keine Positionen erfasst.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {abrechnung.workspace.positionen.map((pos) => (
                <div
                  key={pos.id}
                  className={`p-3 rounded ${pos.betrag > 0 ? "bg-green-50" : "bg-red-50"}`}
                >
                  <div className="font-medium">{pos.name}</div>
                  {pos.beschreibung && <div className="text-xs text-gray-500">{pos.beschreibung}</div>}
                  <div className="font-mono font-bold">{formatCurrency(pos.betrag)}</div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4">Mieteinnahmen: {formatCurrency(abrechnung.workspace.mieteinnahmen)}</p>
          <p>Nebenkosten (Summe): {formatCurrency(abrechnung.workspace.nebenkosten)}</p>
          <p className="text-3xl font-bold mt-6">
            Gesamtsumme: {formatCurrency(abrechnung.gesamtSumme)}
          </p>

          {abrechnung.workspace.abrechnungstext && (
            <>
              <h2 className="text-xl font-bold mt-8 mb-2">Abrechnungstext</h2>
              <p className="whitespace-pre-wrap text-sm">{abrechnung.workspace.abrechnungstext}</p>
            </>
          )}
          {abrechnung.workspace.anschreiben && (
            <>
              <h2 className="text-xl font-bold mt-8 mb-2">Anschreiben</h2>
              <p className="whitespace-pre-wrap text-sm">{abrechnung.workspace.anschreiben}</p>
            </>
          )}

          <p className="text-xs text-gray-400 mt-8">
            Erstellt am {formatDate(abrechnung.createdAt)} • Version {abrechnung.version}
          </p>
        </div>

        <div className="flex gap-3 p-4 border-t border-border">
          <a
            href={`/api/export/pdf/${abrechnung.id}`}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
          >
            ⬇️ PDF herunterladen
          </a>
          <button
            onClick={() => window.print()}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            🖨️ Drucken
          </button>
        </div>
      </div>
    </div>
  );
}
