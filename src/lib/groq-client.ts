import Groq from "groq-sdk";
import OpenAI from "openai"; // Cerebras API is OpenAI-compatible

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
 * Stufen 3–5 werden automatisch übersprungen, wenn ein Aufruf `tools`
 * (Agent-Funktionsaufrufe) oder striktes JSON-Mode (Klassifikation/Extraktion,
 * u.a. Smart-Upload, Mietvertrags-Analyse) braucht – siehe
 * STRUCTURED_OUTPUT_UNSAFE_MODELS weiter unten. Dort greifen dann weiterhin nur
 * Stufen 1–2 (genau wie vor dieser Erweiterung, also unverändert zuverlässig).
 * Grund: Compound unterstützt laut Groq keine eigenen Tools, und qwen/qwen3.6-27b
 * hat in der Praxis bei striktem JSON-Mode mit "json_validate_failed" abgebrochen
 * (Reasoning-Modelle neigen dazu, dem JSON zusätzlichen Text beizumischen).
 * Für reine Text-Antworten (Chat, Anschreiben-Text, Recht-Einschätzung) stehen
 * dagegen alle 5 Stufen zur Verfügung.
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

const CEREBRAS_MODELS = [
  "cerebras/llama-4-scout",
  "cerebras/qwen3-32b",
  "cerebras/deepseek-r1-distill",
  "cerebras/gemma-4-31b",
  "cerebras/gpt-oss-120b", // Already in Groq, but can be used as Cerebras fallback
];

const ALL_FALLBACK_MODELS = [...DEFAULT_TEXT_MODELS, ...CEREBRAS_MODELS];


const BLOCKED_TEXT_MODELS = new Set([
  "llama-3.3-70b-versatile",
  "llama3-70b-8192",
  "llama-3.1-70b-versatile",
  "llama-3.1-8b-instant", // von Groq zugunsten gpt-oss-20b abgekündigt
  "qwen/qwen3-32b", // von Groq zugunsten gpt-oss-120b / qwen3.6-27b abgekündigt
  "zai-glm-4.7", // Deprecated on Cerebras
]);


// Modelle, die bei Funktionsaufrufen (`tools`) oder striktem JSON-Mode
// (`response_format: json_object`) nicht zuverlässig genug sind, um für
// Smart-Upload, Klassifikation/Extraktion oder den Agenten verwendet zu
// werden. Nur für reine Text-Antworten als Fallback nutzen.
const STRUCTURED_OUTPUT_UNSAFE_MODELS = new Set([
  "groq/compound",
  "groq/compound-mini", // unterstützt keine eigenen Tools
  "qwen/qwen3.6-27b", // in Praxis vereinzelt json_validate_failed bei strikter Extraktion
]);

export function getTextModels(): string[] {
  let models: string[];
  if (process.env.GROQ_TEXT_MODELS) {
    models = process.env.GROQ_TEXT_MODELS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    const primary = process.env.GROQ_TEXT_MODEL || ALL_FALLBACK_MODELS[0];
    const rest = ALL_FALLBACK_MODELS.filter((m) => m !== primary);
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
let cerebrasClient: OpenAI | null = null;

export function getGroqClient(): Groq {
  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY ist nicht gesetzt. Bitte in .env.local bzw. als Fly.io Secret hinterlegen."
    );
  }
  if (!client) client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return client;
}

export function getCerebrasClient(): OpenAI {
  if (!process.env.CEREBRAS_API_KEY) {
    throw new Error(
      "CEREBRAS_API_KEY ist nicht gesetzt. Bitte in .env.local bzw. als Fly.io Secret hinterlegen."
    );
  }
  if (!cerebrasClient) {
    cerebrasClient = new OpenAI({
      apiKey: process.env.CEREBRAS_API_KEY,
      baseURL: process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1",
    });
  }
  return cerebrasClient;
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
  // Modell liefert bei striktem JSON-Mode ungültiges/nicht-schema-konformes JSON
  // (kommt vereinzelt bei bestimmten Modellen vor) -> nächstes Modell versuchen.
  if (code.includes("json_validate_failed")) return true;
  if (msg.includes("failed to validate json")) return true;
  // Modell nicht verfügbar / deaktiviert
  if (status === 404 || status === 400) {
    if (msg.includes("model") || msg.includes("deprecat") || msg.includes("not found")) {
      return true;
    }
  }
  return false;
}

type ChatParams = Omit<ChatCompletionCreateParamsNonStreaming, "model"> & { model?: string };

interface CerebrasChatCompletion {
  id: string;
  choices: Array<{ message: { content: string | null; role: 'assistant' | 'user' | 'system' | 'tool' }; finish_reason: string; index: number }>;
  created: number;
  model: string;
  object: 'chat.completion';
  system_fingerprint: string;
  usage: { completion_tokens: number; prompt_tokens: number; total_tokens: number };
}


/**
 * chat.completions.create mit automatischem Modell-Fallback bei Rate-Limit / Modellfehlern.
 */
export async function createChatCompletion(params: ChatParams): Promise<ChatCompletion | CerebrasChatCompletion> {
  const groq = getGroqClient();
  const cerebras = getCerebrasClient();
  let models = params.model
    ? [params.model, ...getTextModels().filter((m) => m !== params.model)]
    : getTextModels();

  // Modelle ohne Tool-Support bzw. mit unzuverlässigem JSON-Mode für
  // Agent-Funktionsaufrufe und strikte JSON-Extraktion (Smart-Upload,
  // Klassifikation, Mietvertrags-/PM-Vertrags-Analyse, …) konsequent
  // ausschließen.
  const needsStructuredOutput =
    Boolean(params.tools?.length) || params.response_format?.type === "json_object";
  if (needsStructuredOutput) {
    const filtered = models.filter((m) => !STRUCTURED_OUTPUT_UNSAFE_MODELS.has(m));
    // Nur ausschließen, wenn danach noch mindestens ein Modell übrig bleibt
    // (z.B. bei GROQ_TEXT_MODELS-Override auf ausschließlich unsichere Modelle).
    if (filtered.length > 0) models = filtered;
  }

  let lastError: any;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const { model: _ignored, ...rest } = params;
      if (model.startsWith("cerebras/")) {
        return await cerebras.chat.completions.create({
          ...rest,
          model: model.replace("cerebras/", ""),
        });
      } else {
        return await groq.chat.completions.create({
          ...rest,
          model,
        });
      }
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
