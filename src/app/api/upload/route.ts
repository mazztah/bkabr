import { NextRequest, NextResponse } from "next/server";
import { extractTextFromFile } from "@/lib/document-ocr";
import { storeFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Generischer Speicher-Endpunkt für Zusatzdokumente/Anhänge (z.B. Grundbuchauszug,
 * Kaufvertrag, Liegenschaftskarte, Nachtrag, Übergabeprotokoll). Speichert die Datei
 * dauerhaft und liest – soweit möglich – den Text aus, ohne eine fachliche Extraktion
 * durchzuführen. Die Zuordnung/Ablage an das jeweilige Stammobjekt erfolgt im Anschluss
 * über ein PATCH auf die entsprechende Entität (z.B. /api/eigentuemer/[id]).
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Keine Datei übermittelt" }, { status: 400 });
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
