import { NextRequest, NextResponse } from "next/server";
import { analyzeDocument } from "@/lib/ai";
import { extractTextFromFile } from "@/lib/document-ocr";
import {
  createAbrechnung,
  liegenschaftenDb,
  listAbrechnungen,
  nextNummer,
  updateAbrechnung,
} from "@/lib/db";
import { storeFile } from "@/lib/storage";
import { jahresZeitraum, matchLiegenschaft, parseAddress, parseYear, zeitraumEnthaeltJahr } from "@/lib/matching";
import { Abrechnung, Dokument, pruefeRechnungsmerkmale } from "@/lib/types";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

const SUPPORTED = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "text/plain"];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Keine Datei übermittelt" }, { status: 400 });
    }

    const mimeType = file.type || "application/octet-stream";
    const isDocx =
      mimeType.includes("wordprocessingml") || file.name.toLowerCase().endsWith(".docx");

    if (!SUPPORTED.includes(mimeType) && !isDocx) {
      return NextResponse.json(
        {
          error: `Dateityp "${mimeType || file.name}" wird aktuell nicht unterstützt. Bitte PDF, JPG, PNG oder TXT hochladen.`,
        },
        { status: 415 }
      );
    }
    if (isDocx) {
      return NextResponse.json(
        {
          error:
            "DOCX wird derzeit nicht automatisch ausgelesen. Bitte als PDF exportieren und erneut hochladen.",
        },
        { status: 415 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Schritt 1: OCR / Texterfassung (Tesseract + Vision-LLM für Bilder, lokale
    // Extraktion für PDF, direkte Übernahme für TXT).
    const ocr = await extractTextFromFile(buffer, mimeType, file.name);
    if (ocr.error) {
      return NextResponse.json({ error: ocr.error }, { status: 415 });
    }

    // Schritt 2: separates LLM analysiert den erkannten Text und extrahiert die
    // strukturierten Abrechnungs-/Rechnungsdaten.
    const extracted = await analyzeDocument({ text: ocr.text, fileName: file.name });

    // Schritt 3: Merkmalsprüfung – ab MERKMALS_SCHWELLE (Standard 83%) erkannter
    // Pflichtmerkmale gilt die Rechnung als vollständig erkannt/akzeptiert.
    const pruefung = pruefeRechnungsmerkmale(extracted);

    const now = new Date().toISOString();
    const dokId = uid();
    const storedFileName = await storeFile(dokId, file.name, buffer);
    const dokNummer = await nextNummer("DOK");

    const dokument: Dokument = {
      id: dokId,
      nummer: dokNummer,
      name: file.name,
      mimeType,
      size: buffer.byteLength,
      uploadedAt: now,
      extraktText: extracted.rawText || ocr.text.slice(0, 4000),
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

    // Zuordnung zur Liegenschaftshierarchie: entweder explizit übergeben (Upload
    // aus einer Registerkarte heraus) oder per Adressabgleich automatisch erkannt.
    let liegenschaftId = (formData.get("liegenschaftId") as string) || undefined;
    const gebaeudeId = (formData.get("gebaeudeId") as string) || undefined;
    const wohnungId = (formData.get("wohnungId") as string) || undefined;

    let liegenschaftVorschlag: ReturnType<typeof parseAddress> & { grund: string } | undefined;

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

    // Zeitraum-Zuordnung: Rechnungsdatum bestimmt das Kalenderjahr. Existiert im
    // selben Objekt-Scope (Wohnung > Gebäude > Liegenschaft) bereits eine
    // Abrechnung für dieses Jahr, wird das Dokument dort ergänzt statt eine neue
    // "lose" Abrechnung anzulegen.
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
                  name: extracted.leistungsart || file.name,
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
        return NextResponse.json({ abrechnung: updated, pruefung, liegenschaftVorschlag, ergaenzt: true });
      }
    }

    const abrNummer = await nextNummer("BK");
    const abrechnung: Abrechnung = {
      id: uid(),
      nummer: abrNummer,
      name: extracted.name || file.name.replace(/\.[^.]+$/, ""),
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
    return NextResponse.json({ abrechnung, pruefung, liegenschaftVorschlag, ergaenzt: false });
  } catch (e: any) {
    console.error("Analyze error:", e);
    return NextResponse.json({ error: e.message || "Analyse fehlgeschlagen" }, { status: 500 });
  }
}
