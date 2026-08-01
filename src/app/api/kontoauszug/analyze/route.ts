import { NextRequest, NextResponse } from "next/server";
import { extractKontoauszug } from "@/lib/ai";
import { extractTextFromFile } from "@/lib/document-ocr";
import { mieterDb, wohnungenDb, gebaeudeDb, liegenschaftenDb } from "@/lib/db";

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

    const transaktionen = await extractKontoauszug({ text: ocr.text, fileName: file.name });

    const [mieter, wohnungen, gebaeude, liegenschaften] = await Promise.all([
      mieterDb.list(),
      wohnungenDb.list(),
      gebaeudeDb.list(),
      liegenschaftenDb.list(),
    ]);

    const vorschlaege = transaktionen.map((t) => {
      const ziel = normalize(`${t.absender || ""} ${t.verwendungszweck || ""}`);
      const treffer = mieter.find((m) => {
        const n = normalize(m.name);
        return n.length > 2 && ziel.includes(n);
      });
      const wohnung = treffer ? wohnungen.find((w) => w.id === treffer.wohnungId) : undefined;
      const geb = wohnung ? gebaeude.find((g) => g.id === wohnung.gebaeudeId) : undefined;
      const lg = geb ? liegenschaften.find((l) => l.id === geb.liegenschaftId) : undefined;

      return {
        transaktion: t,
        vorschlagMieterId: treffer?.id,
        vorschlagMieterName: treffer?.name,
        wohnungBezeichnung: wohnung?.bezeichnung,
        liegenschaftName: lg?.name,
      };
    });

    return NextResponse.json({ vorschlaege, mieter });
  } catch (e: any) {
    console.error("Kontoauszug-Analyse-Fehler:", e);
    return NextResponse.json({ error: e.message || "Analyse fehlgeschlagen" }, { status: 500 });
  }
}
