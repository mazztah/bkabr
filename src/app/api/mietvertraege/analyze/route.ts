import { NextRequest, NextResponse } from "next/server";
import { extractMietvertrag } from "@/lib/ai";
import { extractTextFromFile } from "@/lib/document-ocr";
import { gebaeudeDb, liegenschaftenDb, mieterDb, wohnungenDb } from "@/lib/db";
import {
  heuristicMietvertragFromText,
  matchMietvertragVorschlag,
  mergeMietvertragExtraktion,
} from "@/lib/matching";
import { storeFile } from "@/lib/storage";

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

    let extraktion;
    try {
      extraktion = await extractMietvertrag({ text: ocr.text, fileName: file.name });
    } catch {
      extraktion = heuristicMietvertragFromText(ocr.text, file.name);
    }
    extraktion = mergeMietvertragExtraktion(
      extraktion,
      heuristicMietvertragFromText(ocr.text, file.name)
    );

    const tempId = crypto.randomUUID();
    const storedFileName = await storeFile(tempId, file.name, buffer);

    const [alleMieter, alleWohnungen, alleGebaeude, alleLg] = await Promise.all([
      mieterDb.list(),
      wohnungenDb.list(),
      gebaeudeDb.list(),
      liegenschaftenDb.list(),
    ]);
    const vorschlag = matchMietvertragVorschlag({
      fileName: file.name,
      extraktion,
      ocrText: ocr.text,
      liegenschaften: alleLg,
      gebaeude: alleGebaeude,
      wohnungen: alleWohnungen,
      mieter: alleMieter,
    });

    return NextResponse.json({
      extraktion,
      dateiName: file.name,
      storedFileName,
      mimeType,
      vorschlag: {
        mieterId: vorschlag.mieterId,
        mieterName: vorschlag.mieterName || extraktion.mieterName,
        wohnungId: vorschlag.wohnungId,
        liegenschaftId: vorschlag.liegenschaftId,
        hinweis: vorschlag.hinweis,
      },
    });
  } catch (e: any) {
    console.error("Mietvertrag-Analyse-Fehler:", e);
    return NextResponse.json({ error: e.message || "Analyse fehlgeschlagen" }, { status: 500 });
  }
}
