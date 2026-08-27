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
import { requirePermission } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requirePermission("vertraege", "write");
  if (auth instanceof NextResponse) return auth;

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

    // Konsistenz-Check: Kaltmiete + NK-VZ sollte in etwa der Warmmiete entsprechen.
    // Weichen die Werte deutlich ab, weist das auf eine Verwechslung bei der
    // Extraktion hin (z.B. Warmmiete statt Kaltmiete erfasst) – der Nutzer soll
    // das im Bestätigungs-Dialog gegenprüfen, bevor die Werte übernommen werden.
    const pruefHinweise: string[] = [];
    const summe =
      (extraktion.sollMiete || 0) + (extraktion.bkVorauszahlung || 0) + (extraktion.hkVorauszahlung || 0);
    if (extraktion.warmmiete && summe > 0 && Math.abs(summe - extraktion.warmmiete) > 5) {
      pruefHinweise.push(
        `Kaltmiete + NK-VZ ergibt ${summe.toFixed(2)} €, im Vertrag steht aber ${extraktion.warmmiete.toFixed(
          2
        )} € Warmmiete – bitte Werte gegenprüfen.`
      );
    }
    if (extraktion.unsicherheiten?.length) {
      pruefHinweise.push(`KI ist sich unsicher bei: ${extraktion.unsicherheiten.join(", ")}.`);
    }

    return NextResponse.json({
      extraktion,
      dateiName: file.name,
      storedFileName,
      mimeType,
      pruefHinweis: pruefHinweise.length ? pruefHinweise.join(" ") : undefined,
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
