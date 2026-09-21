import { NextRequest, NextResponse } from "next/server";
import { extractTextFromFile } from "@/lib/document-ocr";
import { storeFile } from "@/lib/storage";
import { requireAnyPermission } from "@/lib/auth";
import { erlaubteEndungen, istErlaubterUpload, maxUploadBytes } from "@/lib/upload-policy";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Generischer Speicher-Endpunkt für Zusatzdokumente/Anhänge (z.B. Grundbuchauszug,
 * Kaufvertrag, Liegenschaftskarte, Nachtrag, Übergabeprotokoll). Speichert die Datei
 * dauerhaft und liest – soweit möglich – den Text aus, ohne eine fachliche Extraktion
 * durchzuführen. Die Zuordnung/Ablage an das jeweilige Stammobjekt erfolgt im Anschluss
 * über ein PATCH auf die entsprechende Entität (z.B. /api/eigentuemer/[id]).
 *
 * Sicherheit: Login + Schreibrecht in mindestens einem Fachmodul (Anhänge kommen aus vielen
 * Modulen, z. B. Tickets), Größenlimit (MAX_UPLOAD_MB, Standard 25) und Endungs-Whitelist.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAnyPermission([
    ["dokumente", "write"],
    ["immobilien", "write"],
    ["liegenschaften", "write"],
    ["pacht_nutzung", "write"],
    ["veranstaltungen", "write"],
    ["vertraege", "write"],
    ["kalender", "write"],
    ["anlagen", "write"],
    ["ticketsystem", "write"],
    ["zaehler", "write"],
    ["finanzen", "write"],
  ]);
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Keine Datei übermittelt" }, { status: 400 });
    }
    if (file.size > maxUploadBytes()) {
      return NextResponse.json(
        { error: `Datei zu groß (${Math.round(file.size / 1024 / 1024)} MB, erlaubt: ${Math.round(maxUploadBytes() / 1024 / 1024)} MB).` },
        { status: 413 }
      );
    }
    if (!istErlaubterUpload(file.name)) {
      return NextResponse.json(
        { error: `Dateityp nicht erlaubt. Erlaubt: ${erlaubteEndungen().join(", ")}` },
        { status: 415 }
      );
    }
    const mimeType = file.type || "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());
    const storedFileName = await storeFile(crypto.randomUUID(), file.name, buffer);

    let extraktText = "";
    try {
      const ocr = await extractTextFromFile(buffer, mimeType, file.name);
      if (!ocr.error) extraktText = ocr.text.slice(0, 4000);
    } catch {
      // Text-Extraktion ist bei Anhängen optional – Ablage funktioniert auch ohne.
    }

    return NextResponse.json({
      dateiName: file.name,
      storedFileName,
      mimeType,
      size: buffer.byteLength,
      extraktText,
    });
  } catch (e: any) {
    console.error("Upload-Fehler:", e);
    return NextResponse.json({ error: e.message || "Upload fehlgeschlagen" }, { status: 500 });
  }
}
