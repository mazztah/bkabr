import "./dommatrix-polyfill";
import { PDFParse } from "pdf-parse";
import { visionTranscribe } from "./ai";
import { tesseractOcr } from "./ocr";

export interface OcrResult {
  text: string;
  error?: string;
}

/**
 * Extrahiert Text aus einer hochgeladenen Datei (PDF, JPG/PNG oder TXT).
 * - PDF: Text wird lokal extrahiert (Groq kann PDFs nicht direkt lesen).
 * - Bild: Tesseract.js (lokal) + Groq Vision-LLM werden kombiniert (zwei
 *   unabhängige OCR-Quellen, robuster als eine einzelne Methode).
 * - TXT: Inhalt wird direkt übernommen.
 */
export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<OcrResult> {
  const isPdf = mimeType === "application/pdf";
  const isImage = mimeType.startsWith("image/");

  if (isPdf) {
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      const text = (result.text || "")
        .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, "") // pdf-parse Seiten-Marker entfernen
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (!text) {
        return {
          text: "",
          error:
            "In der PDF konnte kein Text gefunden werden (vermutlich ein eingescanntes Dokument ohne Textebene). Bitte als Foto/Scan (JPG/PNG) hochladen.",
        };
      }
      return { text };
    } catch (e) {
      console.error("PDF-Textextraktion fehlgeschlagen:", e);
      return { text: "", error: "Die PDF konnte nicht gelesen werden (beschädigt oder verschlüsselt?)." };
    }
  }

  if (isImage) {
    const base64 = buffer.toString("base64");
    const [tesseractText, visionText] = await Promise.all([
      tesseractOcr(buffer).catch((e) => {
        console.error("Tesseract-OCR-Fehler:", e);
        return "";
      }),
      visionTranscribe({ base64, mimeType, fileName }).catch((e) => {
        console.error("Vision-OCR-Fehler:", e);
        return "";
      }),
    ]);

    const text = [
      visionText && `--- Vision-LLM Texterkennung ---\n${visionText}`,
      tesseractText && `--- Tesseract OCR ---\n${tesseractText}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!text) {
      return {
        text: "",
        error: "Es konnte kein Text aus dem Bild erkannt werden. Bitte Qualität prüfen und erneut versuchen.",
      };
    }
    return { text };
  }

  return { text: buffer.toString("utf-8") };
}
