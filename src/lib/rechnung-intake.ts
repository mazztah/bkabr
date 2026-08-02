import { analyzeDocument } from "./ai";
import {
  createAbrechnung,
  liegenschaftenDb,
  listAbrechnungen,
  nextNummer,
  updateAbrechnung,
} from "./db";
import { storeFile } from "./storage";
import {
  jahresZeitraum,
  matchLiegenschaft,
  parseAddress,
  parseYear,
  zeitraumEnthaeltJahr,
} from "./matching";
import { Abrechnung, Dokument, ExtractedData, RechnungsPruefung, pruefeRechnungsmerkmale } from "./types";
import { uid } from "./utils";

export interface RechnungIntakeErgebnis {
  abrechnung: Abrechnung;
  extracted: ExtractedData;
  pruefung: RechnungsPruefung;
  liegenschaftVorschlag?: ReturnType<typeof parseAddress> & { grund: string };
  ergaenzt: boolean;
}

/**
 * Nimmt eine bereits als Text vorliegende Rechnung/Abrechnung entgegen, extrahiert die
 * Rechnungsmerkmale, ordnet sie – falls möglich – automatisch einer bestehenden
 * Liegenschaft/Abrechnung zu und legt sie andernfalls als neue Abrechnung an.
 * Wird sowohl von /api/analyze (Einzel-Upload) als auch von /api/smart-upload
 * (Sammel-Upload vieler unterschiedlicher Dokumente) verwendet.
 */
export async function ingestRechnungDokument(params: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  ocrText: string;
  liegenschaftId?: string;
  gebaeudeId?: string;
  wohnungId?: string;
}): Promise<RechnungIntakeErgebnis> {
  const { buffer, mimeType, fileName, ocrText } = params;

  const extracted = await analyzeDocument({ text: ocrText, fileName });
  const pruefung = pruefeRechnungsmerkmale(extracted);

  const now = new Date().toISOString();
  const dokId = uid();
  const storedFileName = await storeFile(dokId, fileName, buffer);
  const dokNummer = await nextNummer("DOK");

  const dokument: Dokument = {
    id: dokId,
    nummer: dokNummer,
    name: fileName,
    mimeType,
    size: buffer.byteLength,
    uploadedAt: now,
    extraktText: extracted.rawText || ocrText.slice(0, 4000),
    storedFileName,
    rechnungsnummer: extracted.rechnungsnummer,
    rechnungsdatum: extracted.rechnungsdatum,
    betrag: extracted.betrag,
    leistungsart: extracted.leistungsart,
    leistungsort: extracted.leistungsort,
    auftraggeber: extracted.auftraggeber,
    auftragnehmer: extracted.auftragnehmer,
    firma: extracted.firma,
    rechnungsadresse: extracted.rechnungsadresse,
    pruefung,
  };

  let liegenschaftId = params.liegenschaftId;
  const gebaeudeId = params.gebaeudeId;
  const wohnungId = params.wohnungId;

  let liegenschaftVorschlag: (ReturnType<typeof parseAddress> & { grund: string }) | undefined;

  if (!liegenschaftId && !gebaeudeId && !wohnungId) {
    const adresse = extracted.adresse || extracted.rechnungsadresse || "";
    if (adresse) {
      const alle = await liegenschaftenDb.list();
      const match = matchLiegenschaft(adresse, alle);
      if (match) {
        liegenschaftId = match.id;
      } else {
        liegenschaftVorschlag = { ...parseAddress(adresse), grund: adresse };
      }
    }
  }

  const jahr = parseYear(extracted.rechnungsdatum) || new Date().getFullYear();
  const scope = wohnungId
    ? { wohnungId }
    : gebaeudeId
    ? { gebaeudeId }
    : liegenschaftId
    ? { liegenschaftId }
    : null;

  if (scope) {
    const alle = await listAbrechnungen();
    const bestehende = alle.find((a) => {
      const scopeMatch =
        ("wohnungId" in scope && a.wohnungId === scope.wohnungId) ||
        ("gebaeudeId" in scope && a.gebaeudeId === scope.gebaeudeId) ||
        ("liegenschaftId" in scope && a.liegenschaftId === scope.liegenschaftId);
      return scopeMatch && zeitraumEnthaeltJahr(a.zeitraum, jahr);
    });

    if (bestehende) {
      const neuePositionen =
        extracted.positionen && extracted.positionen.length > 0
          ? extracted.positionen.map((p) => ({ id: uid(), ...p }))
          : extracted.betrag
          ? [
              {
                id: uid(),
                name: extracted.leistungsart || fileName,
                betrag: extracted.betrag,
                beschreibung: extracted.firma,
              },
            ]
          : [];
      const zuwachs = neuePositionen.reduce((sum, p) => sum + (p.betrag || 0), 0);
      const positionenGesamt = [...bestehende.workspace.positionen, ...neuePositionen];

      const updated = await updateAbrechnung(bestehende.id, {
        dokumente: [...bestehende.dokumente, dokument],
        gesamtSumme: bestehende.gesamtSumme + zuwachs,
        workspace: {
          ...bestehende.workspace,
          positionen: positionenGesamt,
          nebenkosten: positionenGesamt.reduce((sum, p) => sum + (p.betrag || 0), 0),
        },
      });
      return { abrechnung: updated!, extracted, pruefung, liegenschaftVorschlag, ergaenzt: true };
    }
  }

  const abrNummer = await nextNummer("BK");
  const abrechnung: Abrechnung = {
    id: uid(),
    nummer: abrNummer,
    name: extracted.name || fileName.replace(/\.[^.]+$/, ""),
    adresse: extracted.adresse || "",
    objektTyp: extracted.objektTyp || "Wohnung",
    zeitraum: extracted.zeitraum || jahresZeitraum(jahr),
    gesamtSumme: extracted.gesamtSumme || 0,
    status: "Validierung",
    dokumente: [dokument],
    workspace: {
      positionen: (extracted.positionen || []).map((p) => ({ id: uid(), ...p })),
      mieteinnahmen: 0,
      nebenkosten: (extracted.positionen || []).reduce((sum, p) => sum + (p.betrag || 0), 0),
    },
    chat: [],
    version: 1,
    history: [],
    createdAt: now,
    updatedAt: now,
    liegenschaftId,
    gebaeudeId,
    wohnungId,
  };

  await createAbrechnung(abrechnung);
  return { abrechnung, extracted, pruefung, liegenschaftVorschlag, ergaenzt: false };
}
