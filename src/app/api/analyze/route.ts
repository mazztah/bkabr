import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { analyzeDocument, visionTranscribe } from "@/lib/ai";
import { tesseractOcr } from "@/lib/ocr";
import { createAbrechnung } from "@/lib/db";
import { Abrechnung, Dokument, pruefeRechnungsmerkmale } from "@/lib/types";
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
    const isImage = mimeType.startsWith("image/");

    // Schritt 1: OCR / Texterfassung.
    // - PDF: Text wird lokal aus der Datei extrahiert (Groq kann PDFs nicht direkt lesen).
    // - Bild (JPG/PNG): zwei unabhängige OCR-Quellen werden kombiniert – Tesseract.js
    //   (lokal, deterministisch) und das Groq Vision-LLM (robuster bei schlechter
    //   Bildqualität/handschriftlichen Notizen). So gleichen sich Schwächen der
    //   jeweils anderen Methode aus.
    // - TXT: der Inhalt wird direkt übernommen.
    let ocrText: string;

    if (isPdf) {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      ocrText = result.text?.trim() || "";

      if (!ocrText) {
        return NextResponse.json(
          {
            error:
              "In der PDF konnte kein Text gefunden werden (vermutlich ein eingescanntes Dokument ohne Textebene). Bitte lade stattdessen ein Foto/Scan als JPG oder PNG hoch.",
          },
          { status: 415 }
        );
      }
    } else if (isImage) {
      const base64 = buffer.toString("base64");
      const [tesseractText, visionText] = await Promise.all([
        tesseractOcr(buffer).catch((e) => {
          console.error("Tesseract-OCR-Fehler:", e);
          return "";
        }),
        visionTranscribe({ base64, mimeType, fileName: file.name }).catch((e) => {
          console.error("Vision-OCR-Fehler:", e);
          return "";
        }),
      ]);

      ocrText = [
        visionText && `--- Vision-LLM Texterkennung ---\n${visionText}`,
        tesseractText && `--- Tesseract OCR ---\n${tesseractText}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      if (!ocrText) {
        return NextResponse.json(
          { error: "Es konnte kein Text aus dem Bild erkannt werden. Bitte Qualität prüfen und erneut versuchen." },
          { status: 422 }
        );
      }
    } else {
      ocrText = buffer.toString("utf-8");
    }

    // Schritt 2: ein zweites, separates LLM analysiert den erkannten Text und
    // extrahiert die strukturierten Abrechnungsdaten.
    const extracted = await analyzeDocument({ text: ocrText, fileName: file.name });

    // Schritt 3: Merkmalsprüfung – ab 90% erkannter Pflichtmerkmale gilt die
    // Rechnung als vollständig erkannt/akzeptiert (Kernstück der Dokumentenverwaltung).
    const pruefung = pruefeRechnungsmerkmale(extracted);

    const now = new Date().toISOString();
    const dokument: Dokument = {
      id: uid(),
      name: file.name,
      mimeType,
      size: buffer.byteLength,
      uploadedAt: now,
      extraktText: extracted.rawText || ocrText.slice(0, 4000),
      rechnungsnummer: extracted.rechnungsnummer,
      rechnungsdatum: extracted.rechnungsdatum,
      betrag: extracted.betrag,
      leistungsart: extracted.leistungsart,
      leistungsort: extracted.leistungsort,
      auftraggeber: extracted.auftraggeber,
      auftragnehmer: extracted.auftragnehmer,
      firma: extracted.firma,
      rechnungsadresse: extracted.rechnungsadresse,
      pruefung,
    };

    // Optionale direkte Zuordnung zu einer Liegenschaft/einem Gebäude/einer
    // Wohnung (z.B. beim Upload aus der jeweiligen Registerkarte heraus).
    const liegenschaftId = (formData.get("liegenschaftId") as string) || undefined;
    const gebaeudeId = (formData.get("gebaeudeId") as string) || undefined;
    const wohnungId = (formData.get("wohnungId") as string) || undefined;

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
      liegenschaftId,
      gebaeudeId,
      wohnungId,
    };

    await createAbrechnung(abrechnung);
    return NextResponse.json({ abrechnung, pruefung });
  } catch (e: any) {
    console.error("Analyze error:", e);
    return NextResponse.json(
      { error: e.message || "Analyse fehlgeschlagen" },
      { status: 500 }
    );
  }
}
