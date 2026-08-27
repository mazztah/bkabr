import { NextRequest, NextResponse } from "next/server";
import { extractMietvertragNachtrag } from "@/lib/ai";
import { extractTextFromFile } from "@/lib/document-ocr";
import { mietvertraegeDb } from "@/lib/db";
import { storeFile } from "@/lib/storage";
import { requirePermission } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Analysiert einen zu einem bestehenden Mietvertrag hochgeladenen Nachtrag oder
 * ein Übergabeprotokoll. Legt NICHTS an – liefert nur die erkannten Daten zurück,
 * damit der User im Anschluss entscheiden kann: manuell prüfen (nur ablegen) oder
 * automatisch übernehmen (Stammdaten aktualisieren).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("vertraege", "write");
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const mietvertrag = await mietvertraegeDb.get(id);
    if (!mietvertrag) {
      return NextResponse.json({ error: "Mietvertrag nicht gefunden" }, { status: 404 });
    }

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

    const extraktion = await extractMietvertragNachtrag({ text: ocr.text, fileName: file.name });
    const storedFileName = await storeFile(crypto.randomUUID(), file.name, buffer);

    return NextResponse.json({
      extraktion,
      dateiName: file.name,
      storedFileName,
      mimeType,
      extraktText: ocr.text.slice(0, 4000),
    });
  } catch (e: any) {
    console.error("Nachtrag-Analyse-Fehler:", e);
    return NextResponse.json({ error: e.message || "Analyse fehlgeschlagen" }, { status: 500 });
  }
}
