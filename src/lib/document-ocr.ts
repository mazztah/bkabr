import "./dommatrix-polyfill";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";
import { visionTranscribe } from "./ai";
import { tesseractOcr } from "./ocr";

export interface OcrResult {
  text: string;
  error?: string;
}

const EXCEL_EXTENSIONS = /\.(xlsx|xls|xlsm)$/i;
const EXCEL_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
]);

function excelToText(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const bloecke: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    const zeilenText = rows
      .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
      .map((row) => row.map((cell) => String(cell ?? "").trim()).join(" | "))
      .join("\n");
    if (zeilenText) {
      bloecke.push(`--- Tabellenblatt: ${sheetName} ---\n${zeilenText}`);
    }
  }
  return bloecke.join("\n\n");
}

export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<OcrResult> {
  const isPdf = mimeType === "application/pdf";
  const isImage = mimeType.startsWith("image/");
  const isExcel = EXCEL_MIME_TYPES.has(mimeType) || EXCEL_EXTENSIONS.test(fileName);

  if (isExcel) {
    try {
      const text = excelToText(buffer);
      if (!text.trim()) {
        return { text: "", error: "In der Excel-Datei wurden keine befüllten Zeilen gefunden." };
      }
      return { text };
    } catch (e) {
      console.error("Excel-Textextraktion fehlgeschlagen:", e);
      return {
        text: "",
        error: "Die Excel-Datei konnte nicht gelesen werden (beschädigt oder ungültiges Format?).",
      };
    }
  }

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
