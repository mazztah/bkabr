"use client";

import { Abrechnung } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";

const FIRMENNAME = "BetriebsKostenBot";

export default function PreviewModal({
  abrechnung,
  onClose,
}: {
  abrechnung: Abrechnung;
  onClose: () => void;
}) {
  const ws = abrechnung.workspace;
  const positionen = ws.positionen;
  const zeigeGesamtkosten = positionen.some((p) => typeof p.gesamtkosten === "number");
  const zeigeUmlageschluessel = positionen.some((p) => !!p.umlageschluessel);
  const vorauszahlungen = ws.vorauszahlungen ?? 0;
  const summeMieteranteile = ws.nebenkosten;
  const saldo = summeMieteranteile - vorauszahlungen;
  const heute = formatDate(new Date().toISOString());

  const vermieterName = abrechnung.vermieterName || FIRMENNAME;
  const vermieterAnschrift = abrechnung.vermieterAnschrift;
  const mieterName = abrechnung.mieterName;
  const mieterAnschrift = abrechnung.mieterAnschrift;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border no-print">
          <h2 className="font-semibold">Vorschau – Druckbar</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto bg-white text-black" id="print-area">
          {/* ============ SEITE 1: ANSCHREIBEN ============ */}
          {ws.anschreiben && (
            <section className="print-page-break p-10">
              <header className="flex items-start justify-between mb-10">
                <img src="/brand/logo.png" alt={FIRMENNAME} className="h-12 w-auto object-contain" />
                <div className="text-right text-xs text-gray-500 leading-relaxed">
                  {vermieterName && <div className="font-semibold text-gray-700">{vermieterName}</div>}
                  {vermieterAnschrift && <div>{vermieterAnschrift}</div>}
                  {abrechnung.verwalterKontakt && <div>{abrechnung.verwalterKontakt}</div>}
                </div>
              </header>

              {(mieterName || mieterAnschrift) && (
                <div className="mb-8 text-sm leading-relaxed">
                  {mieterName && <div>{mieterName}</div>}
                  {mieterAnschrift && <div className="whitespace-pre-line">{mieterAnschrift}</div>}
                </div>
              )}

              <div className="mb-6 text-right text-sm text-gray-600">{heute}</div>

              <div className="mb-2 text-sm font-semibold">
                Betreff: Betriebskostenabrechnung {abrechnung.zeitraum ? `für den Zeitraum ${abrechnung.zeitraum}` : ""}
                {" – "}
                {abrechnung.adresse || abrechnung.name}
              </div>

              <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed">{ws.anschreiben}</div>
            </section>
          )}

          {/* ============ SEITE 2: ABRECHNUNG ============ */}
          <section className="p-10">
            <header className="flex items-start justify-between mb-6 border-b-2 border-gray-800 pb-4">
              <div>
                <h1 className="text-2xl font-bold">Betriebskostenabrechnung</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  gemäß § 556 BGB / BetrKV
                  {abrechnung.zeitraum ? ` · Zeitraum ${abrechnung.zeitraum}` : ""}
                </p>
              </div>
              <img src="/brand/logo.png" alt={FIRMENNAME} className="h-10 w-auto object-contain" />
            </header>

            {/* Kopfdaten */}
            <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
                  Vermieter / Verwaltung
                </p>
                <p className="font-medium">{vermieterName}</p>
                {vermieterAnschrift && <p className="text-gray-600">{vermieterAnschrift}</p>}
                {abrechnung.verwalterKontakt && <p className="text-gray-600">{abrechnung.verwalterKontakt}</p>}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Mieter</p>
                <p className="font-medium">{mieterName || abrechnung.name}</p>
                {mieterAnschrift && <p className="text-gray-600">{mieterAnschrift}</p>}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
                  Objekt / Adresse
                </p>
                <p className="text-gray-700">{abrechnung.adresse || "-"}</p>
                <p className="text-gray-500 text-xs mt-0.5">{abrechnung.objektTyp}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
                  Abrechnungszeitraum
                </p>
                <p className="text-gray-700">{abrechnung.zeitraum || "-"}</p>
                {abrechnung.nutzungszeitraum && (
                  <p className="text-gray-500 text-xs mt-0.5">Nutzungszeitraum: {abrechnung.nutzungszeitraum}</p>
                )}
              </div>
            </div>

            {/* Kostenaufstellung */}
            <h2 className="text-base font-bold mb-3">Einzelaufstellung der Betriebskosten</h2>
            {positionen.length === 0 ? (
              <p className="text-gray-500 text-sm">Keine Positionen erfasst.</p>
            ) : (
              <table className="w-full text-sm border-collapse mb-2">
                <thead>
                  <tr className="border-b-2 border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-2 w-8">Nr.</th>
                    <th className="py-2 pr-2">Kostenart</th>
                    {zeigeGesamtkosten && <th className="py-2 pr-2 text-right">Gesamtkosten</th>}
                    {zeigeUmlageschluessel && <th className="py-2 pr-2">Umlageschlüssel</th>}
                    <th className="py-2 pl-2 text-right">Mieteranteil</th>
                  </tr>
                </thead>
                <tbody>
                  {positionen.map((pos, i) => (
                    <tr key={pos.id} className="border-b border-gray-200 align-top">
                      <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                      <td className="py-2 pr-2">
                        <div className="font-medium">{pos.name}</div>
                        {pos.beschreibung && <div className="text-xs text-gray-500">{pos.beschreibung}</div>}
                      </td>
                      {zeigeGesamtkosten && (
                        <td className="py-2 pr-2 text-right font-mono text-gray-600">
                          {typeof pos.gesamtkosten === "number" ? formatCurrency(pos.gesamtkosten) : "–"}
                        </td>
                      )}
                      {zeigeUmlageschluessel && (
                        <td className="py-2 pr-2 text-gray-600">{pos.umlageschluessel || "–"}</td>
                      )}
                      <td className="py-2 pl-2 text-right font-mono font-medium">{formatCurrency(pos.betrag)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-800 font-semibold">
                    <td className="py-2" colSpan={1 + (zeigeGesamtkosten ? 1 : 0) + (zeigeUmlageschluessel ? 1 : 0)}>
                      Summe Mieteranteile
                    </td>
                    <td className="py-2 pl-2 text-right font-mono">{formatCurrency(summeMieteranteile)}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* Zusammenfassung / Saldo */}
            <div className="mt-6 mb-8 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm space-y-1.5 max-w-md ml-auto">
              <div className="flex justify-between">
                <span className="text-gray-600">Summe umlagefähige Mieteranteile</span>
                <span className="font-mono">{formatCurrency(summeMieteranteile)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Geleistete Vorauszahlungen</span>
                <span className="font-mono">– {formatCurrency(vorauszahlungen)}</span>
              </div>
              {ws.mieteinnahmen > 0 && (
                <div className="flex justify-between text-gray-500 text-xs">
                  <span>Mieteinnahmen (nachrichtlich)</span>
                  <span className="font-mono">{formatCurrency(ws.mieteinnahmen)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-300 pt-1.5 mt-1.5 text-base font-bold">
                <span>{saldo > 0 ? "Nachzahlung zu Ihren Lasten" : saldo < 0 ? "Guthaben zu Ihren Gunsten" : "Saldo"}</span>
                <span className={`font-mono ${saldo > 0 ? "text-red-700" : saldo < 0 ? "text-green-700" : ""}`}>
                  {formatCurrency(Math.abs(saldo))}
                </span>
              </div>
            </div>

            {abrechnung.workspace.abrechnungstext && (
              <div className="mb-8">
                <h2 className="text-base font-bold mb-2">Erläuterungen</h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                  {abrechnung.workspace.abrechnungstext}
                </p>
              </div>
            )}

            {/* Hinweise */}
            <div className="mb-8 rounded-lg border border-gray-200 p-4 text-xs text-gray-600 leading-relaxed space-y-1">
              <p className="font-semibold text-gray-700 mb-1">Hinweise</p>
              <p>
                Einwendungen gegen diese Abrechnung können Sie innerhalb von 12 Monaten nach Zugang
                schriftlich geltend machen (§ 556 Abs. 3 BGB).
              </p>
              <p>Die zugrunde liegenden Belege können während der üblichen Geschäftszeiten eingesehen werden.</p>
            </div>

            <footer className="border-t border-gray-200 pt-3 text-xs text-gray-400 flex justify-between">
              <span>
                Erstellt am {formatDate(abrechnung.createdAt)} · Version {abrechnung.version}
              </span>
              <span>{vermieterName}</span>
            </footer>
          </section>
        </div>

        <div className="flex gap-3 p-4 border-t border-border no-print">
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
