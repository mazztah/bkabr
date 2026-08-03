import Groq from "groq-sdk";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "groq-sdk/resources/chat/completions";

/**
 * Primärmodell + Fallbacks. Rate-Limits (TPD) sind modellbezogen –
 * bei 429/rate_limit_exceeded wird das nächste Modell versucht.
 *
 * Reihenfolge bewusst so gewählt, dass jede Stufe ein eigenes,
 * unabhängiges Tages-Kontingent bei Groq hat:
 *   1. openai/gpt-oss-120b   – Primärmodell, beste Qualität
 *   2. openai/gpt-oss-20b    – schnell, eigenes Kontingent
 *   3. qwen/qwen3.6-27b      – weiteres vollwertiges Modell, eigenes Kontingent
 *   4. groq/compound-mini    – agentisches Groq-System, eigenes (kleineres) Kontingent
 *   5. groq/compound         – größtes agentisches Groq-System, letzte Reserve
 *
 * Stufen 4+5 (Compound) unterstützen laut Groq keine eigenen/benutzerdefinierten
 * Tools und werden daher automatisch übersprungen, wenn ein Aufruf `tools`
 * (Agent-Funktionsaufrufe) oder striktes JSON-Mode (Klassifikation/Extraktion,
 * u.a. Smart-Upload) braucht – siehe COMPOUND_MODELS weiter unten. Dort greifen
 * dann weiterhin nur Stufen 1–3. Für reine Text-Antworten (Chat, Anschreiben-Text,
 * Recht-Einschätzung) stehen alle 5 Stufen zur Verfügung.
 *
 * Überschreibbar per ENV:
 *   GROQ_TEXT_MODEL=...
 *   GROQ_TEXT_MODELS=model-a,model-b,model-c   (Komma-getrennt, ersetzt die Default-Kette)
 */
const DEFAULT_TEXT_MODELS = [
  process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b",
  "groq/compound-mini",
  "groq/compound",
];

const BLOCKED_TEXT_MODELS = new Set([
  "llama-3.3-70b-versatile",
  "llama3-70b-8192",
  "llama-3.1-70b-versatile",
  "llama-3.1-8b-instant", // von Groq zugunsten gpt-oss-20b abgekündigt
  "qwen/qwen3-32b", // von Groq zugunsten gpt-oss-120b / qwen3.6-27b abgekündigt
]);

// Groq Compound-Systeme führen intern eigene (Web-Suche/Code-Ausführung) Tools
// aus, unterstützen aber keine benutzerdefinierten `tools` und halten JSON-Mode
// nicht zuverlässig ein. Deshalb: nie für Agent-Funktionsaufrufe oder strikte
// JSON-Extraktion verwenden (Smart-Upload, Klassifikation, Rechnungsprüfung, …).
const COMPOUND_MODELS = new Set(["groq/compound", "groq/compound-mini"]);

export function getTextModels(): string[] {
  let models: string[];
  if (process.env.GROQ_TEXT_MODELS) {
    models = process.env.GROQ_TEXT_MODELS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    const primary = process.env.GROQ_TEXT_MODEL || DEFAULT_TEXT_MODELS[0];
    const rest = DEFAULT_TEXT_MODELS.filter((m) => m !== primary);
    models = [primary, ...rest];
  }
  // Llama-Versatile und ähnliche nie verwenden (TPD oft leer, unerwünscht)
  models = models.filter((m) => !BLOCKED_TEXT_MODELS.has(m));
  if (models.length === 0) {
    models = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
  }
  return models;
}

export const VISION_MODEL =
  process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

let client: Groq | null = null;

export function getGroqClient(): Groq {
  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY ist nicht gesetzt. Bitte in .env.local bzw. als Fly.io Secret hinterlegen."
    );
  }
  if (!client) client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return client;
}

function isRetryableModelError(err: any): boolean {
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  const msg = String(err?.message || err || "").toLowerCase();
  const code = String(err?.error?.code || err?.code || "").toLowerCase();
  if (status === 429) return true;
  if (status === 413) return true;
  if (code.includes("rate_limit")) return true;
  if (msg.includes("rate limit") || msg.includes("rate_limit")) return true;
  if (msg.includes("tokens per day") || msg.includes("tpd")) return true;
  if (msg.includes("tokens per minute") || msg.includes("tpm")) return true;
  if (msg.includes("request too large") || msg.includes("reduce your message size")) return true;
  // Modell nicht verfügbar / deaktiviert
  if (status === 404 || status === 400) {
    if (msg.includes("model") || msg.includes("deprecat") || msg.includes("not found")) {
      return true;
    }
  }
  return false;
}

type ChatParams = Omit<ChatCompletionCreateParamsNonStreaming, "model"> & { model?: string };

/**
 * chat.completions.create mit automatischem Modell-Fallback bei Rate-Limit / Modellfehlern.
 */
export async function createChatCompletion(params: ChatParams): Promise<ChatCompletion> {
  const groq = getGroqClient();
  let models = params.model
    ? [params.model, ...getTextModels().filter((m) => m !== params.model)]
    : getTextModels();

  // Compound-Systeme unterstützen keine eigenen `tools` und halten JSON-Mode
  // nicht zuverlässig ein -> für Agent-Funktionsaufrufe und strikte
  // JSON-Extraktion (Smart-Upload, Klassifikation, …) konsequent ausschließen.
  const needsStructuredOutput =
    Boolean(params.tools?.length) || params.response_format?.type === "json_object";
  if (needsStructuredOutput) {
    const withoutCompound = models.filter((m) => !COMPOUND_MODELS.has(m));
    // Nur ausschließen, wenn danach noch mindestens ein Modell übrig bleibt
    // (z.B. bei GROQ_TEXT_MODELS-Override auf ausschließlich Compound-Systeme).
    if (withoutCompound.length > 0) models = withoutCompound;
  }

  let lastError: any;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const { model: _ignored, ...rest } = params;
      return await groq.chat.completions.create({
        ...rest,
        model,
      });
    } catch (err: any) {
      lastError = err;
      if (i < models.length - 1 && isRetryableModelError(err)) {
        console.warn(
          `[groq] Modell ${model} fehlgeschlagen (${err?.status || ""} ${err?.message || err}). Fallback → ${models[i + 1]}`
        );
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
