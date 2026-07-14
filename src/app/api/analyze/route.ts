import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { analyzeDocument } from "@/lib/ai";
import { createAbrechnung } from "@/lib/db";
import { Abrechnung, Dokument } from "@/lib/types";
import { uid } from "@/lib/utils";

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

    const isPdf = mimeType === "application/pdf";
    const isTextType = mimeType === "text/plain" || isPdf;

    let payload: string;
    if (isPdf) {
      // Groq kann PDFs nicht direkt verarbeiten (nur Bilder), daher wird der Text
      // vorab lokal aus der PDF extrahiert und als Text an das Modell übergeben.
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      payload = result.text?.trim() || "";

      if (!payload) {
        return NextResponse.json(
          {
            error:
              "In der PDF konnte kein Text gefunden werden (vermutlich ein eingescanntes Dokument ohne Textebene). Bitte lade stattdessen ein Foto/Scan als JPG oder PNG hoch.",
          },
          { status: 415 }
        );
      }
    } else {
      payload = isTextType ? buffer.toString("utf-8") : buffer.toString("base64");
    }

    const extracted = await analyzeDocument({
      base64: payload,
      mimeType: isPdf ? "text/plain" : mimeType,
      fileName: file.name,
    });

    const now = new Date().toISOString();
    const dokument: Dokument = {
      id: uid(),
      name: file.name,
      mimeType,
      size: buffer.byteLength,
      uploadedAt: now,
      extraktText: extracted.rawText,
    };

    const abrechnung: Abrechnung = {
      id: uid(),
      name: extracted.name || file.name.replace(/\.[^.]+$/, ""),
      adresse: extracted.adresse || "",
      objektTyp: extracted.objektTyp || "Wohnung",
      zeitraum: extracted.zeitraum || "",
      gesamtSumme: extracted.gesamtSumme || 0,
      status: "Validierung",
      dokumente: [dokument],
      workspace: {
        positionen: (extracted.positionen || []).map((p) => ({ id: uid(), ...p })),
        mieteinnahmen: 0,
        nebenkosten: (extracted.positionen || []).reduce((sum, p) => sum + (p.betrag || 0), 0),
      },
      chat: [],
      version: 1,
      history: [],
      createdAt: now,
      updatedAt: now,
    };

    await createAbrechnung(abrechnung);
    return NextResponse.json({ abrechnung });
  } catch (e: any) {
    console.error("Analyze error:", e);
    return NextResponse.json(
      { error: e.message || "Analyse fehlgeschlagen" },
      { status: 500 }
    );
  }
}
