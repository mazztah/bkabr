import { createWorker } from "tesseract.js";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
// Sprachdaten werden auf dem persistenten Volume gecacht, damit sie nicht bei
// jedem Kaltstart der Maschine erneut heruntergeladen werden müssen.
const TESS_CACHE_PATH = path.join(DATA_DIR, "tessdata");

let workerPromise: ReturnType<typeof createWorker> | null = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("deu+eng", undefined, {
      cachePath: TESS_CACHE_PATH,
    });
  }
  return workerPromise;
}

/**
 * Lokale OCR-Texterkennung via Tesseract.js (Deutsch + Englisch).
 * Läuft komplett serverseitig ohne externe API und dient als zweite,
 * unabhängige Texterkennungsquelle zusätzlich zum Vision-LLM.
 *
 * Mit Timeout abgesichert: falls der Worker (z.B. wegen eines langsamen/
 * blockierten Downloads der Sprachdaten beim ersten Aufruf) nicht rechtzeitig
 * antwortet, wird mit leerem Ergebnis fortgefahren, statt den Request
 * unbegrenzt hängen zu lassen. Das Vision-LLM-Ergebnis reicht dann als
 * alleinige OCR-Quelle.
 */
export async function tesseractOcr(buffer: Buffer, timeoutMs = 45000): Promise<string> {
  try {
    const worker = await getWorker();
    const result = await Promise.race([
      worker.recognize(buffer).then((r) => r.data.text || ""),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve(""), timeoutMs)
      ),
    ]);
    return result.trim();
  } catch (e) {
    console.error("Tesseract-OCR fehlgeschlagen:", e);
    return "";
  }
}
