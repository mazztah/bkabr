import { NextRequest, NextResponse } from "next/server";
import { extractPmVertrag, extractWohnungsuebersicht } from "@/lib/ai";
import { extractTextFromFile } from "@/lib/document-ocr";
import { liegenschaftenDb } from "@/lib/db";
import { storeFile } from "@/lib/storage";
import { matchLiegenschaft, parseAddress } from "@/lib/matching";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Keine Datei übermittelt" }, { status: 400 });
    }
    const mimeType = file.type || "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());

    const ocr = await extractTextFromFile(buffer, mimeType, file.name);
    if (ocr.error) {
      return NextResponse.json({ error: ocr.error }, { status: 415 });
    }

    const extraktion = await extractPmVertrag({ text: ocr.text, fileName: file.name });

    // Best-effort: Soll-Struktur (Anzahl Gebäude, Einheiten mit Bezeichnung + m²)
    // aus demselben Dokument miterkennen – Grundlage für den späteren
    // Plausibilitätsabgleich gegen die tatsächlichen Stammdaten (lib/pruefung.ts).
    try {
      const uebersicht = await extractWohnungsuebersicht({ text: ocr.text, fileName: file.name });
      if (uebersicht.einheiten.length > 0) {
        const gebaeudeNamen = new Set(
          uebersicht.einheiten.map((e) => (e.gebaeudeName || "").trim().toLowerCase()).filter(Boolean)
        );
        extraktion.anzahlGebaeudeLtVertrag = gebaeudeNamen.size > 0 ? gebaeudeNamen.size : 1;
        extraktion.einheitenLtVertrag = uebersicht.einheiten.map((e) => ({
          gebaeudeName: e.gebaeudeName || undefined,
          wohnungsbezeichnung: e.wohnungsbezeichnung,
          flaeche: e.flaeche || undefined,
        }));
      }
    } catch (uebersichtErr: any) {
      console.warn(`Soll-Übersicht aus PM-Vertrag konnte nicht ermittelt werden (${file.name}):`, uebersichtErr?.message || uebersichtErr);
    }

    const tempId = crypto.randomUUID();
    const storedFileName = await storeFile(tempId, file.name, buffer);

    const alleLiegenschaften = await liegenschaftenDb.list();
    const adresseFuerMatch = extraktion.objektAdresse || extraktion.liegenschaftName || "";
    const treffer = matchLiegenschaft(adresseFuerMatch, alleLiegenschaften);

    const geparst = extraktion.objektAdresse ? parseAddress(extraktion.objektAdresse) : null;
    const neuanlageVorschlag = !treffer
      ? {
          name: extraktion.liegenschaftName || geparst?.strasse || "Neue Liegenschaft",
          strasse: geparst?.strasse || "",
          hausnummer: geparst?.hausnummer || "",
          plz: geparst?.plz || "",
          ort: geparst?.ort || "",
        }
      : undefined;

    return NextResponse.json({
      extraktion,
      dateiName: file.name,
      storedFileName,
      mimeType,
      vorschlag: {
        liegenschaftId: treffer?.id,
        liegenschaftName: treffer?.name,
        neuanlage: neuanlageVorschlag,
      },
    });
  } catch (e: any) {
    console.error("PM-Vertrag-Analyse-Fehler:", e);
    return NextResponse.json({ error: e.message || "Analyse fehlgeschlagen" }, { status: 500 });
  }
}
