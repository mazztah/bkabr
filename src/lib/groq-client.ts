import Groq from "groq-sdk";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "groq-sdk/resources/chat/completions";
import type { AiProvider } from "./types";
import { recordAiUsage } from "./db";

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
 * Zusätzlich (nur wenn CEREBRAS_API_KEY gesetzt):
 *   6. cerebras:gemma-4-31b  – Cerebras Preview, eigenes Kontingent (5 RPM / 2.4k RPD)
 *   7. cerebras:zai-glm-4.7  – Cerebras Preview, eigenes Kontingent (5 RPM / 2.4k RPD)
 *      Hinweis: zai-glm-4.7 ist laut Cerebras bis 17.08.2026 terminiert.
 *
 * Zusätzlich (nur wenn CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN gesetzt):
 *   8. cloudflare:@cf/zai-org/glm-4.7-flash
 *        – schnell, multilingual, multi-turn Tool-Calling, 131k Kontext
 *   9. cloudflare:@cf/google/gemma-4-26b-a4b-it
 *        – effizient, Function Calling + Vision + Structured Output
 *  10. cloudflare:@cf/moonshotai/kimi-k2.6
 *        – frontier agentic, multi-turn Tool-Calling, Vision, Structured Output, 262k
 *      (Hinweis: kimi-k2.6 erfordert i.d.R. Workers Paid Plan)
 *
 * Zusätzlich (nur wenn NVIDIA_API_KEY gesetzt – NVIDIA Build/NIM, https://build.nvidia.com):
 *  11. nvidia:meta/llama-3.3-70b-instruct
 *        – stärkstes Modell der Kette, Reasoning/Function-Calling
 *  12. nvidia:meta/llama-3.1-8b-instruct
 *        – schnell, eigenes (kleineres) Kontingent
 *  13. nvidia:meta/llama-3.2-3b-instruct
 *        – letzte Reserve, sehr schnell, kleinstes Kontingent
 *      Hinweis: NVIDIA Build braucht nur einen API-Key (Format "nvapi-…"),
 *      keine separate Account-ID – anders als Cloudflare.
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
 * dagegen alle Groq-Stufen + optional Cerebras + Cloudflare + NVIDIA zur Verfügung.
 *
 * Cerebras-, Cloudflare- und NVIDIA-Modelle unterstützen Tool-Calling und
 * JSON-Mode und werden daher auch bei strukturierter Ausgabe als Fallback
 * nach Groq genutzt.
 *
 * Überschreibbar per ENV:
 *   GROQ_TEXT_MODEL=...
 *   GROQ_TEXT_MODELS=model-a,model-b,model-c   (Komma-getrennt, ersetzt die Default-Kette)
 *   CEREBRAS_API_KEY=...                       (aktiviert Cerebras-Fallbacks)
 *   CEREBRAS_TEXT_MODELS=gemma-4-31b,zai-glm-4.7
 *   CLOUDFLARE_ACCOUNT_ID=...                  (Account-ID aus dem CF-Dashboard)
 *   CLOUDFLARE_API_TOKEN=...                   (API Token mit Workers AI Read/Write)
 *   CLOUDFLARE_API_KEY=...                     (Alias für CLOUDFLARE_API_TOKEN)
 *   CLOUDFLARE_TEXT_MODELS=@cf/zai-org/glm-4.7-flash,@cf/google/gemma-4-26b-a4b-it,@cf/moonshotai/kimi-k2.6
 *   NVIDIA_API_KEY=...                         (aktiviert NVIDIA-Build-Fallbacks, Key beginnt mit "nvapi-")
 *   NVIDIA_TEXT_MODELS=meta/llama-3.3-70b-instruct,meta/llama-3.1-8b-instruct,meta/llama-3.2-3b-instruct
 */

const CEREBRAS_PREFIX = "cerebras:";
const CLOUDFLARE_PREFIX = "cloudflare:";
const NVIDIA_PREFIX = "nvidia:";

const DEFAULT_TEXT_MODELS = [
  process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b",
  "groq/compound-mini",
  "groq/compound",
];

/** Default-Cerebras-Fallbacks (nur aktiv, wenn CEREBRAS_API_KEY gesetzt). */
const DEFAULT_CEREBRAS_TEXT_MODELS = ["gemma-4-31b", "zai-glm-4.7"];

/**
 * Default-Cloudflare-Workers-AI-Fallbacks (nur aktiv, wenn Account-ID + Token gesetzt).
 * Alle drei mit Function Calling laut CF-Katalog; Diversität an Anbieter/Stärke:
 *   - glm-4.7-flash: günstig/schnell, multi-turn tools, multilingual
 *   - gemma-4-26b: tools + vision + structured
 *   - kimi-k2.6: frontier agentic, tools + vision + structured, großer Kontext
 */
const DEFAULT_CLOUDFLARE_TEXT_MODELS = [
  "@cf/zai-org/glm-4.7-flash",
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/moonshotai/kimi-k2.6",
];

/**
 * Default-NVIDIA-Build-Fallbacks (nur aktiv, wenn NVIDIA_API_KEY gesetzt).
 * Absteigend nach Größe/Qualität, damit jede Stufe ein eigenes (kleineres,
 * schnelleres) Kontingent als letzte Reserve hat, bevor der Request ganz fehlschlägt.
 */
const DEFAULT_NVIDIA_TEXT_MODELS = [
  "meta/llama-3.3-70b-instruct",
  "meta/llama-3.1-8b-instruct",
  "meta/llama-3.2-3b-instruct",
];

const BLOCKED_TEXT_MODELS = new Set([
  "llama-3.3-70b-versatile",
  "llama3-70b-8192",
  "llama-3.1-70b-versatile",
  "llama-3.1-8b-instant", // von Groq zugunsten gpt-oss-20b abgekündigt
  "qwen/qwen3-32b", // von Groq zugunsten gpt-oss-120b / qwen3.6-27b abgekündigt
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

/**
 * Cerebras-Modelle als zusätzliche Fallback-Stufe (nur wenn API-Key gesetzt).
 * Präfix "cerebras:" markiert den Provider in der gemeinsamen Kette.
 */
export function getCerebrasTextModels(): string[] {
  if (!process.env.CEREBRAS_API_KEY) return [];
  let models: string[];
  if (process.env.CEREBRAS_TEXT_MODELS) {
    models = process.env.CEREBRAS_TEXT_MODELS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    models = [...DEFAULT_CEREBRAS_TEXT_MODELS];
  }
  return models.map((m) => (m.startsWith(CEREBRAS_PREFIX) ? m : `${CEREBRAS_PREFIX}${m}`));
}

/**
 * Cloudflare Workers AI Modelle als zusätzliche Fallback-Stufe.
 * Aktiv nur wenn Account-ID und API-Token gesetzt sind.
 * Präfix "cloudflare:" markiert den Provider; Modell-IDs behalten das @cf/... Format.
 */
export function getCloudflareTextModels(): string[] {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token =
    process.env.CLOUDFLARE_API_TOKEN?.trim() || process.env.CLOUDFLARE_API_KEY?.trim();
  if (!accountId || !token) return [];

  let models: string[];
  if (process.env.CLOUDFLARE_TEXT_MODELS) {
    models = process.env.CLOUDFLARE_TEXT_MODELS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    models = [...DEFAULT_CLOUDFLARE_TEXT_MODELS];
  }
  return models.map((m) => (m.startsWith(CLOUDFLARE_PREFIX) ? m : `${CLOUDFLARE_PREFIX}${m}`));
}

/**
 * NVIDIA-Build-Modelle (NIM, https://build.nvidia.com) als zusätzliche
 * Fallback-Stufe. Aktiv nur wenn NVIDIA_API_KEY gesetzt ist – im Gegensatz
 * zu Cloudflare reicht hier ein einzelner API-Key ("nvapi-…"), es gibt
 * keine separate Account-ID.
 */
export function getNvidiaTextModels(): string[] {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) return [];

  let models: string[];
  if (process.env.NVIDIA_TEXT_MODELS) {
    models = process.env.NVIDIA_TEXT_MODELS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    models = [...DEFAULT_NVIDIA_TEXT_MODELS];
  }
  return models.map((m) => (m.startsWith(NVIDIA_PREFIX) ? m : `${NVIDIA_PREFIX}${m}`));
}

export const VISION_MODEL =
  process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

/** Optionales Cerebras-Vision-Fallback (gemma-4-31b unterstützt bis 10 Bilder/Request). */
export const CEREBRAS_VISION_MODEL =
  process.env.CEREBRAS_VISION_MODEL || "gemma-4-31b";

/**
 * Optionales Cloudflare-Vision-Fallback (Gemma 4 und Kimi K2.6 sind vision-fähig).
 * Standard: gemma-4-26b-a4b-it (tools + vision, effizienter als frontier Kimi).
 */
export const CLOUDFLARE_VISION_MODEL =
  process.env.CLOUDFLARE_VISION_MODEL || "@cf/google/gemma-4-26b-a4b-it";

/**
 * NVIDIA Build unterstützt bei den hier genutzten Llama-3.x-Textmodellen
 * kein Vision-Input – daher kein eigenes NVIDIA-Vision-Fallback (bewusst
 * kein NVIDIA_VISION_MODEL, um keine falschen Erwartungen zu wecken).
 */

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
  if (status === 503 || status === 502) return true;
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
    if (
      msg.includes("model") ||
      msg.includes("deprecat") ||
      msg.includes("not found") ||
      msg.includes("does not exist")
    ) {
      return true;
    }
  }
  return false;
}

type ChatParams = Omit<ChatCompletionCreateParamsNonStreaming, "model"> & { model?: string };

function isCerebrasModel(model: string): boolean {
  return model.startsWith(CEREBRAS_PREFIX);
}

function isCloudflareModel(model: string): boolean {
  return model.startsWith(CLOUDFLARE_PREFIX);
}

function isNvidiaModel(model: string): boolean {
  return model.startsWith(NVIDIA_PREFIX);
}

function stripCerebrasPrefix(model: string): string {
  return model.startsWith(CEREBRAS_PREFIX) ? model.slice(CEREBRAS_PREFIX.length) : model;
}

function stripCloudflarePrefix(model: string): string {
  return model.startsWith(CLOUDFLARE_PREFIX) ? model.slice(CLOUDFLARE_PREFIX.length) : model;
}

function stripNvidiaPrefix(model: string): string {
  return model.startsWith(NVIDIA_PREFIX) ? model.slice(NVIDIA_PREFIX.length) : model;
}

function stripProviderPrefix(model: string): string {
  if (isCerebrasModel(model)) return stripCerebrasPrefix(model);
  if (isCloudflareModel(model)) return stripCloudflarePrefix(model);
  if (isNvidiaModel(model)) return stripNvidiaPrefix(model);
  return model;
}

/**
 * OpenAI-kompatibler Aufruf gegen Cerebras Inference
 * (https://api.cerebras.ai/v1/chat/completions).
 * Keine Extra-Dependency – reines fetch, Antwort wird an Groq-ChatCompletion angepasst.
 */
async function createCerebrasChatCompletion(
  modelId: string,
  params: ChatParams
): Promise<ChatCompletion> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    const err: any = new Error("CEREBRAS_API_KEY ist nicht gesetzt.");
    err.status = 401;
    throw err;
  }

  const { model: _ignored, max_completion_tokens, max_tokens, ...rest } = params as ChatParams & {
    max_tokens?: number;
  };

  // Cerebras/OpenAI nutzen max_tokens; Groq-SDK liefert oft max_completion_tokens.
  const maxTokens = max_tokens ?? max_completion_tokens;

  const body: Record<string, unknown> = {
    model: modelId,
    messages: rest.messages,
    temperature: rest.temperature,
    top_p: rest.top_p,
    stream: false,
  };
  if (maxTokens != null) body.max_tokens = maxTokens;
  if (rest.response_format) body.response_format = rest.response_format;
  if (rest.tools?.length) {
    body.tools = rest.tools;
    if (rest.tool_choice != null) body.tool_choice = rest.tool_choice;
  }
  if (rest.stop != null) body.stop = rest.stop;

  const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  let data: any;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { error: { message: rawText || res.statusText } };
  }

  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      rawText ||
      `Cerebras HTTP ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.statusCode = res.status;
    err.error = data?.error || { message: msg, code: data?.error?.code };
    err.code = data?.error?.code;
    throw err;
  }

  // Antwort ist OpenAI-kompatibel genug für unsere Verbraucher
  // (choices[0].message.content / tool_calls).
  return data as ChatCompletion;
}

/**
 * OpenAI-kompatibler Aufruf gegen Cloudflare Workers AI
 * (https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions).
 * Keine Extra-Dependency – reines fetch.
 *
 * Auth: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (oder CLOUDFLARE_API_KEY).
 * Modell-IDs im CF-Format, z.B. @cf/zai-org/glm-4.7-flash.
 */
async function createCloudflareChatCompletion(
  modelId: string,
  params: ChatParams
): Promise<ChatCompletion> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken =
    process.env.CLOUDFLARE_API_TOKEN?.trim() || process.env.CLOUDFLARE_API_KEY?.trim();
  if (!accountId || !apiToken) {
    const err: any = new Error(
      "CLOUDFLARE_ACCOUNT_ID und CLOUDFLARE_API_TOKEN (oder CLOUDFLARE_API_KEY) sind nicht gesetzt."
    );
    err.status = 401;
    throw err;
  }

  const { model: _ignored, max_completion_tokens, max_tokens, ...rest } = params as ChatParams & {
    max_tokens?: number;
  };

  const maxTokens = max_tokens ?? max_completion_tokens;

  const body: Record<string, unknown> = {
    model: modelId,
    messages: rest.messages,
    temperature: rest.temperature,
    top_p: rest.top_p,
    stream: false,
  };
  if (maxTokens != null) body.max_tokens = maxTokens;
  if (rest.response_format) body.response_format = rest.response_format;
  if (rest.tools?.length) {
    body.tools = rest.tools;
    if (rest.tool_choice != null) body.tool_choice = rest.tool_choice;
  }
  if (rest.stop != null) body.stop = rest.stop;

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  let data: any;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { error: { message: rawText || res.statusText } };
  }

  if (!res.ok) {
    // CF kann Fehler in data.errors[] (v4-Envelope) oder data.error ablegen
    const cfErrors = Array.isArray(data?.errors)
      ? data.errors.map((e: any) => e?.message || JSON.stringify(e)).join("; ")
      : null;
    const msg =
      cfErrors ||
      data?.error?.message ||
      data?.message ||
      rawText ||
      `Cloudflare Workers AI HTTP ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.statusCode = res.status;
    err.error = data?.error || data?.errors?.[0] || { message: msg };
    err.code = data?.error?.code || data?.errors?.[0]?.code;
    throw err;
  }

  // Manche CF-Antworten sind in { success, result } gewrappt – Chat Completions
  // OpenAI-kompatibel liefert i.d.R. direkt choices; falls result vorhanden, auspacken.
  if (data?.result && !data?.choices) {
    data = data.result;
  }

  return data as ChatCompletion;
}

/**
 * OpenAI-kompatibler Aufruf gegen NVIDIA Build / NIM
 * (https://integrate.api.nvidia.com/v1/chat/completions).
 * Keine Extra-Dependency – reines fetch.
 *
 * Auth: NVIDIA_API_KEY (Bearer-Token, Format "nvapi-…"). Keine Account-ID nötig.
 * Modell-IDs im NVIDIA-Format, z.B. meta/llama-3.3-70b-instruct.
 */
async function createNvidiaChatCompletion(
  modelId: string,
  params: ChatParams
): Promise<ChatCompletion> {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) {
    const err: any = new Error("NVIDIA_API_KEY ist nicht gesetzt.");
    err.status = 401;
    throw err;
  }

  const { model: _ignored, max_completion_tokens, max_tokens, ...rest } = params as ChatParams & {
    max_tokens?: number;
  };

  const maxTokens = max_tokens ?? max_completion_tokens;

  const body: Record<string, unknown> = {
    model: modelId,
    messages: rest.messages,
    temperature: rest.temperature,
    top_p: rest.top_p,
    stream: false,
  };
  if (maxTokens != null) body.max_tokens = maxTokens;
  if (rest.response_format) body.response_format = rest.response_format;
  if (rest.tools?.length) {
    body.tools = rest.tools;
    if (rest.tool_choice != null) body.tool_choice = rest.tool_choice;
  }
  if (rest.stop != null) body.stop = rest.stop;

  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  let data: any;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { error: { message: rawText || res.statusText } };
  }

  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      rawText ||
      `NVIDIA Build HTTP ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.statusCode = res.status;
    err.error = data?.error || { message: msg, code: data?.error?.code };
    err.code = data?.error?.code;
    throw err;
  }

  // Antwort ist bereits OpenAI-Chat-Completions-kompatibel.
  return data as ChatCompletion;
}

function messageHasImages(params: ChatParams): boolean {
  const messages = params.messages || [];
  for (const m of messages) {
    const content = (m as any)?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type === "image_url" || part?.type === "image") return true;
    }
  }
  return false;
}

/**
 * chat.completions.create mit automatischem Modell-Fallback bei Rate-Limit / Modellfehlern.
 * Nach Ausschöpfung der Groq-Kette werden optional Cerebras- und Cloudflare-Modelle versucht.
 *
 * Bei Bild-Eingaben (Vision) wird nicht auf reine Text-Modelle gewechselt, sondern
 * optional auf Cerebras gemma-4-31b bzw. Cloudflare gemma-4-26b (vision-fähig).
 */

/** Grobe Token-Schätzung (DE/EN): ~4 Zeichen ≈ 1 Token. */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

function estimateMessagesTokens(messages: ChatParams["messages"]): number {
  let n = 0;
  for (const m of messages || []) {
    const c = (m as any)?.content;
    if (typeof c === "string") n += estimateTokens(c);
    else if (Array.isArray(c)) {
      for (const part of c) {
        if (typeof part?.text === "string") n += estimateTokens(part.text);
        else if (part?.type === "image_url" || part?.type === "image") n += 800; // Vision-Pauschale
      }
    }
    // tool_calls / name
    const tcs = (m as any)?.tool_calls;
    if (Array.isArray(tcs)) {
      for (const tc of tcs) {
        n += estimateTokens(tc?.function?.name || "");
        n += estimateTokens(tc?.function?.arguments || "");
      }
    }
    n += 4; // role overhead
  }
  return n;
}

/**
 * Globaler Token-Budget-Cap (Free-Tier-Schutz).
 *
 * Nie mehr als GLOBAL_TOKEN_SAFE Tokens pro Aufruf (Input + max_completion).
 * Zusätzlich bleibt der engere qwen-TPM-Schutz im Hinterkopf; der strengere
 * Wert (5000 global) gewinnt immer.
 *
 * Kürzt bei Bedarf History (älteste non-system zuerst) und begrenzt
 * max_completion_tokens, damit Free-Tier-Kontingente nicht unnötig
 * verbrannt werden.
 */
const GLOBAL_TOKEN_SAFE = 5000;
const MIN_COMPLETION = 256;

function applyTokenBudget(model: string, params: ChatParams): ChatParams {
  const SAFE = GLOBAL_TOKEN_SAFE;

  const messages = [...(params.messages || [])];
  let inputTokens = estimateMessagesTokens(messages);
  const toolsTax = params.tools?.length
    ? Math.min(1800, estimateTokens(JSON.stringify(params.tools)))
    : 0;
  inputTokens += toolsTax;

  let maxCompletion =
    (params as any).max_completion_tokens ??
    (params as any).max_tokens ??
    1500;
  // Completion nie größer als Restbudget und nie größer als 1500 (Free-Tier-schonend)
  maxCompletion = Math.min(
    maxCompletion,
    1500,
    Math.max(MIN_COMPLETION, SAFE - inputTokens)
  );

  if (inputTokens + MIN_COMPLETION <= SAFE && maxCompletion >= MIN_COMPLETION) {
    if (maxCompletion < ((params as any).max_completion_tokens ?? 1500)) {
      console.warn(
        `[llm] max_completion_tokens auf ${maxCompletion} begrenzt (input≈${inputTokens}, safe=${SAFE}, model=${model})`
      );
    }
    return {
      ...params,
      max_completion_tokens: maxCompletion,
    } as ChatParams;
  }

  // Input zu groß: älteste non-system Nachrichten droppen, dann letzte kürzen
  const system = messages.filter((m) => m.role === "system");
  let kept = messages.filter((m) => m.role !== "system");
  while (kept.length > 1) {
    const trial = [...system, ...kept];
    const t = estimateMessagesTokens(trial) + toolsTax;
    if (t + MIN_COMPLETION <= SAFE) break;
    kept = kept.slice(1);
  }

  let trialMsgs = [...system, ...kept];
  let t = estimateMessagesTokens(trialMsgs) + toolsTax;
  if (t + MIN_COMPLETION > SAFE) {
    const budgetForLast = Math.max(400, SAFE - toolsTax - MIN_COMPLETION - 150);
    trialMsgs = trialMsgs.map((m, idx) => {
      if (idx < trialMsgs.length - 1) return m;
      const c = (m as any).content;
      if (typeof c !== "string") return m;
      const maxChars = budgetForLast * 4;
      if (c.length <= maxChars) return m;
      return {
        ...m,
        content:
          c.slice(0, Math.floor(maxChars * 0.7)) +
          "\n…[gekürzt wegen Token-Budget ≤5000]…\n" +
          c.slice(-Math.floor(maxChars * 0.25)),
      } as any;
    });
    t = estimateMessagesTokens(trialMsgs) + toolsTax;
  }

  maxCompletion = Math.min(
    maxCompletion,
    1500,
    Math.max(MIN_COMPLETION, SAFE - t)
  );

  console.warn(
    `[llm] Token-Budget angepasst (model=${model}, input≈${t}, max_completion=${maxCompletion}, safe=${SAFE})`
  );

  return {
    ...params,
    messages: trialMsgs,
    max_completion_tokens: maxCompletion,
  } as ChatParams;
}


export async function createChatCompletion(params: ChatParams): Promise<ChatCompletion> {
  const hasImages = messageHasImages(params);
  const isExplicitVision =
    params.model === VISION_MODEL ||
    (typeof params.model === "string" && params.model.includes("llama-4-scout"));

  let models: string[];

  if (hasImages || isExplicitVision) {
    // Vision-Pfad: nur vision-fähige Modelle (kein Text-Fallback ohne Bilder).
    models = [params.model || VISION_MODEL];
    if (process.env.CEREBRAS_API_KEY) {
      const visionFallback = `${CEREBRAS_PREFIX}${CEREBRAS_VISION_MODEL}`;
      if (!models.includes(visionFallback) && !models.includes(CEREBRAS_VISION_MODEL)) {
        models.push(visionFallback);
      }
    }
    const cfAccount = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const cfToken =
      process.env.CLOUDFLARE_API_TOKEN?.trim() || process.env.CLOUDFLARE_API_KEY?.trim();
    if (cfAccount && cfToken) {
      const cfVision = `${CLOUDFLARE_PREFIX}${CLOUDFLARE_VISION_MODEL}`;
      if (!models.includes(cfVision) && !models.includes(CLOUDFLARE_VISION_MODEL)) {
        models.push(cfVision);
      }
    }
  } else {
    const groqModels = params.model
      ? [params.model, ...getTextModels().filter((m) => m !== params.model)]
      : getTextModels();

    // Modelle ohne Tool-Support bzw. mit unzuverlässigem JSON-Mode für
    // Agent-Funktionsaufrufe und strikte JSON-Extraktion (Smart-Upload,
    // Klassifikation, Mietvertrags-/PM-Vertrags-Analyse, …) konsequent
    // ausschließen – gilt nur für Groq-Modelle; Cerebras/Cloudflare bleiben verfügbar.
    const needsStructuredOutput =
      Boolean(params.tools?.length) || params.response_format?.type === "json_object";
    models = [...groqModels];
    if (needsStructuredOutput) {
      const filtered = models.filter((m) => !STRUCTURED_OUTPUT_UNSAFE_MODELS.has(m));
      if (filtered.length > 0) models = filtered;
    }

    // Cerebras als zusätzliche Fallback-Stufe anhängen (eigenes Kontingent).
    const cerebrasModels = getCerebrasTextModels();
    for (const cm of cerebrasModels) {
      if (!models.includes(cm)) models.push(cm);
    }

    // Cloudflare Workers AI als weitere Fallback-Stufe (eigenes Kontingent/Neurons).
    const cloudflareModels = getCloudflareTextModels();
    for (const cfm of cloudflareModels) {
      if (!models.includes(cfm)) models.push(cfm);
    }

    // NVIDIA Build (NIM) als weitere, unabhängige Fallback-Stufe.
    const nvidiaModels = getNvidiaTextModels();
    for (const nvm of nvidiaModels) {
      if (!models.includes(nvm)) models.push(nvm);
    }
  }

  let lastError: any;
  const groq = process.env.GROQ_API_KEY ? getGroqClient() : null;

  function providerNameOf(model: string): string {
    if (isCerebrasModel(model)) return "cerebras";
    if (isCloudflareModel(model)) return "cloudflare";
    if (isNvidiaModel(model)) return "nvidia";
    return "groq";
  }

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      // Globaler Token-Cap ≤ 5000 für ALLE Provider (Free-Tier-Schutz)
      const budgeted = applyTokenBudget(model, params);
      const { model: _ignored, ...rest } = budgeted;

      let completion: ChatCompletion;
      if (isCerebrasModel(model)) {
        const cerebrasId = stripCerebrasPrefix(model);
        completion = await createCerebrasChatCompletion(cerebrasId, { ...rest, model: cerebrasId } as ChatParams);
      } else if (isCloudflareModel(model)) {
        const cfId = stripCloudflarePrefix(model);
        completion = await createCloudflareChatCompletion(cfId, { ...rest, model: cfId } as ChatParams);
      } else if (isNvidiaModel(model)) {
        const nvId = stripNvidiaPrefix(model);
        completion = await createNvidiaChatCompletion(nvId, { ...rest, model: nvId } as ChatParams);
      } else {
        if (!groq) {
          const err: any = new Error(
            "GROQ_API_KEY ist nicht gesetzt und kein Cerebras-/Cloudflare-/NVIDIA-Modell verfügbar."
          );
          err.status = 401;
          throw err;
        }
        completion = await groq.chat.completions.create({
          ...rest,
          model,
        });
      }

      // Sichtbares Erfolgs-Log bei Fallback
      if (i > 0) {
        console.info(`[${providerNameOf(model)}] Modell ${stripProviderPrefix(model)} erfolgreich (Fallback-Stufe ${i + 1}/${models.length}).`);
      }

      // Usage-Logging (fire-and-forget) → speist das AI Cost & Model Observatory
      try {
        const usage = (completion as any)?.usage;
        let promptTokens = 0;
        let completionTokens = 0;
        let exakt = false;
        if (usage && (usage.prompt_tokens != null || usage.completion_tokens != null)) {
          promptTokens = Number(usage.prompt_tokens) || 0;
          completionTokens = Number(usage.completion_tokens) || 0;
          exakt = true;
        } else {
          // Schätzung, wenn Provider kein usage liefert
          promptTokens = estimateMessagesTokens(budgeted.messages || params.messages || []);
          const toolsTax = (budgeted.tools || params.tools)?.length
            ? Math.min(1800, estimateTokens(JSON.stringify(budgeted.tools || params.tools)))
            : 0;
          promptTokens += toolsTax;
          const content = completion?.choices?.[0]?.message?.content;
          completionTokens = typeof content === "string" ? estimateTokens(content) : 0;
          const tcs = (completion?.choices?.[0]?.message as any)?.tool_calls;
          if (Array.isArray(tcs)) {
            for (const tc of tcs) {
              completionTokens += estimateTokens(tc?.function?.name || "");
              completionTokens += estimateTokens(tc?.function?.arguments || "");
            }
          }
          exakt = false;
        }
        void recordAiUsage({
          provider: providerNameOf(model) as AiProvider,
          model: stripProviderPrefix(model),
          fallbackStufe: i,
          promptTokens,
          completionTokens,
          exakt,
        }).catch((e) =>
          console.warn("[llm] recordAiUsage fehlgeschlagen:", e instanceof Error ? e.message : e)
        );
      } catch (logErr) {
        console.warn("[llm] Usage-Logging übersprungen:", logErr instanceof Error ? logErr.message : logErr);
      }

      return completion;
    } catch (err: any) {
      lastError = err;
      const hasMore = i < models.length - 1;
      if (hasMore && isRetryableModelError(err)) {
        const next = models[i + 1];
        console.warn(
          `[${providerNameOf(model)}] Modell ${stripProviderPrefix(model)} fehlgeschlagen (${err?.status || ""} ${err?.message || err}). Fallback → ${stripProviderPrefix(next)}`
        );
        continue;
      }
      // Wenn Groq ohne Key und nur noch andere Provider übrig: weiter versuchen
      if (hasMore) {
        const next = models[i + 1];
        console.warn(
          `[llm] Modell ${stripProviderPrefix(model)} fehlgeschlagen (${err?.status || ""} ${err?.message || err}). Fallback → ${stripProviderPrefix(next)}`
        );
        continue;
      }
      throw err;
    }
  }

  // Klarere Meldung, wenn das Tageskontingent (TPD) weg ist
  const msg = String(lastError?.message || lastError || "");
  if (/tokens per day|TPD|rate_limit_exceeded/i.test(msg)) {
    const wait = msg.match(/try again in ([0-9m.\s]+s)/i)?.[1]?.trim();
    const err: any = new Error(
      wait
        ? `Groq Free-Tier: Tages-Tokenlimit (200k TPD) erreicht. Bitte in ca. ${wait} erneut versuchen oder Dev-Tier upgraden.`
        : "Groq Free-Tier: Tages-Tokenlimit erreicht. Bitte später erneut versuchen oder Dev-Tier upgraden."
    );
    err.status = 429;
    err.cause = lastError;
    throw err;
  }
  throw lastError;
}
