import { NextRequest, NextResponse } from "next/server";
import { extractMietvertrag } from "@/lib/ai";
import { extractTextFromFile } from "@/lib/document-ocr";
import { mieterDb, wohnungenDb } from "@/lib/db";
import { storeFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-zäöüß]/g, "");
}

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

    const extraktion = await extractMietvertrag({ text: ocr.text, fileName: file.name });

    // Datei bereits jetzt sichern (wird beim Bestätigen referenziert, unabhängig
    // davon, ob automatisch oder manuell zugeordnet wird)
    const tempId = crypto.randomUUID();
    const storedFileName = await storeFile(tempId, file.name, buffer);

    // Fuzzy-Matching gegen bestehende Mieter (Namensabgleich)
    let vorgeschlagenerMieterId: string | undefined;
    let vorgeschlagenerMieterName: string | undefined;
    let vorgeschlageneWohnungId: string | undefined;

    if (extraktion.mieterName) {
      const alleMieter = await mieterDb.list();
      const zielName = normalize(extraktion.mieterName);
      const match = alleMieter.find((m) => {
        const n = normalize(m.name);
        return n.length > 2 && (n.includes(zielName) || zielName.includes(n));
      });
      if (match) {
        vorgeschlagenerMieterId = match.id;
        vorgeschlagenerMieterName = match.name;
        vorgeschlageneWohnungId = match.wohnungId;
      }
    }

    // Falls kein Mieter-Treffer, versuchsweise über die Wohnungsbezeichnung/Adresse matchen
    if (!vorgeschlageneWohnungId && (extraktion.wohnungsbezeichnung || extraktion.objektAdresse)) {
      const alleWohnungen = await wohnungenDb.list();
      const ziel = normalize(extraktion.wohnungsbezeichnung || extraktion.objektAdresse || "");
      const match = alleWohnungen.find((w) => {
        const n = normalize(w.bezeichnung);
        return n.length > 2 && ziel.includes(n);
      });
      if (match) vorgeschlageneWohnungId = match.id;
    }

    return NextResponse.json({
      extraktion,
      dateiName: file.name,
      storedFileName,
      mimeType,
      vorschlag: {
        mieterId: vorgeschlagenerMieterId,
        mieterName: vorgeschlagenerMieterName,
        wohnungId: vorgeschlageneWohnungId,
      },
    });
  } catch (e: any) {
    console.error("Mietvertrag-Analyse-Fehler:", e);
    return NextResponse.json({ error: e.message || "Analyse fehlgeschlagen" }, { status: 500 });
  }
}
