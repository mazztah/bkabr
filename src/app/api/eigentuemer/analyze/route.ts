import { NextRequest, NextResponse } from "next/server";
import { extractEigentuemerDokument } from "@/lib/ai";
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

    const extraktion = await extractEigentuemerDokument({ text: ocr.text, fileName: file.name });

    // Datei bereits jetzt sichern (wird beim Bestätigen referenziert, egal ob die
    // Zuordnung zu einer bestehenden oder einer neu angelegten Liegenschaft erfolgt)
    const tempId = crypto.randomUUID();
    const storedFileName = await storeFile(tempId, file.name, buffer);

    // Gegen bestehende Liegenschaften matchen (Adressabgleich)
    const alleLiegenschaften = await liegenschaftenDb.list();
    const adresseFuerMatch = extraktion.objektAdresse || extraktion.liegenschaftName || "";
    const treffer = matchLiegenschaft(adresseFuerMatch, alleLiegenschaften);

    // Falls kein Treffer: Vorschlag für die Neuanlage einer Liegenschaft aus der
    // erkannten Adresse ableiten, damit die Maske direkt vorausgefüllt werden kann.
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
    console.error("Eigentümer-Dokument-Analyse-Fehler:", e);
    return NextResponse.json({ error: e.message || "Analyse fehlgeschlagen" }, { status: 500 });
  }
}
