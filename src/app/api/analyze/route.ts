import { NextRequest, NextResponse } from "next/server";
import { classifyDocument } from "@/lib/ai";
import { extractTextFromFile } from "@/lib/document-ocr";
import { ingestRechnungDokument } from "@/lib/rechnung-intake";
import { DOKUMENT_TYP_LABEL } from "@/lib/types";

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

    // Schritt 2: Dokumenttyp erkennen. Dieses Upload-Feld ist explizit für
    // Rechnungen/Betriebskosten-Belege gedacht – Mietverträge, PM-Verträge,
    // Grundbuchauszüge o.ä. dürfen NICHT als Betriebskostenabrechnung angelegt
    // werden (führt sonst zu falsch zugeordneten/vermischten Positionen).
    // Für diese Dokumenttypen bitte den "🧠 Intelligenter Upload" verwenden,
    // der jeden Typ korrekt erkennt und einordnet.
    const klassifikation = await classifyDocument({ text: ocr.text, fileName: file.name });
    if (klassifikation.typ !== "rechnung" && klassifikation.konfidenz >= 0.6) {
      return NextResponse.json(
        {
          error: `Dieses Dokument wurde als „${DOKUMENT_TYP_LABEL[klassifikation.typ]}“ erkannt, nicht als Rechnung/Betriebskosten-Beleg. Bitte über den „🧠 Intelligenter Upload“ hochladen – dort wird der Dokumenttyp korrekt erkannt und eingeordnet.`,
          erkannterTyp: klassifikation.typ,
        },
        { status: 422 }
      );
    }

    // Zuordnung zur Liegenschaftshierarchie: entweder explizit übergeben (Upload
    // aus einer Registerkarte heraus) oder per Adressabgleich automatisch erkannt.
    const liegenschaftId = (formData.get("liegenschaftId") as string) || undefined;
    const gebaeudeId = (formData.get("gebaeudeId") as string) || undefined;
    const wohnungId = (formData.get("wohnungId") as string) || undefined;

    // Schritt 3+4: separates LLM extrahiert die Rechnungsdaten, Merkmalsprüfung,
    // automatische Zuordnung bzw. Anlage der Abrechnung – gemeinsame Logik mit
    // dem Sammel-Upload (/api/smart-upload).
    const { abrechnung, pruefung, liegenschaftVorschlag, ergaenzt } = await ingestRechnungDokument({
      buffer,
      mimeType,
      fileName: file.name,
      ocrText: ocr.text,
      liegenschaftId,
      gebaeudeId,
      wohnungId,
    });

    return NextResponse.json({ abrechnung, pruefung, liegenschaftVorschlag, ergaenzt });
  } catch (e: any) {
    console.error("Analyze error:", e);
    return NextResponse.json({ error: e.message || "Analyse fehlgeschlagen" }, { status: 500 });
  }
}

