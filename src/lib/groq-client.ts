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
 * Zusätzlich (nur wenn CEREBRAS_API_KEY gesetzt):
 *   6. cerebras:gemma-4-31b  – Cerebras Preview, eigenes Kontingent (5 RPM / 2.4k RPD)
 *   7. cerebras:zai-glm-4.7  – Cerebras Preview, eigenes Kontingent (5 RPM / 2.4k RPD)
 *      Hinweis: zai-glm-4.7 ist laut Cerebras bis 17.08.2026 terminiert.
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
 * dagegen alle Groq-Stufen + optional Cerebras zur Verfügung.
 *
 * Cerebras-Modelle (Stufen 6–7) unterstützen Tool-Calling und JSON-Mode und
 * werden daher auch bei strukturierter Ausgabe als Fallback nach Groq genutzt.
 *
 * Überschreibbar per ENV:
 *   GROQ_TEXT_MODEL=...
 *   GROQ_TEXT_MODELS=model-a,model-b,model-c   (Komma-getrennt, ersetzt die Default-Kette)
 *   CEREBRAS_API_KEY=...                       (aktiviert Cerebras-Fallbacks)
 *   CEREBRAS_TEXT_MODELS=gemma-4-31b,zai-glm-4.7
 */

const CEREBRAS_PREFIX = "cerebras:";

const DEFAULT_TEXT_MODELS = [
  process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b",
  "groq/compound-mini",
  "groq/compound",
];

/** Default-Cerebras-Fallbacks (nur aktiv, wenn CEREBRAS_API_KEY gesetzt). */
const DEFAULT_CEREBRAS_TEXT_MODELS = ["gemma-4-31b", "zai-glm-4.7"];

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

export const VISION_MODEL =
  process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

/** Optionales Cerebras-Vision-Fallback (gemma-4-31b unterstützt bis 10 Bilder/Request). */
export const CEREBRAS_VISION_MODEL =
  process.env.CEREBRAS_VISION_MODEL || "gemma-4-31b";

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

function stripCerebrasPrefix(model: string): string {
  return model.startsWith(CEREBRAS_PREFIX) ? model.slice(CEREBRAS_PREFIX.length) : model;
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
 * Nach Ausschöpfung der Groq-Kette werden optional Cerebras-Modelle versucht.
 *
 * Bei Bild-Eingaben (Vision) wird nicht auf reine Text-Modelle gewechselt, sondern
 * optional auf Cerebras gemma-4-31b (vision-fähig, bis 10 Bilder/Request).
 */
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
  } else {
    const groqModels = params.model
      ? [params.model, ...getTextModels().filter((m) => m !== params.model)]
      : getTextModels();

    // Modelle ohne Tool-Support bzw. mit unzuverlässigem JSON-Mode für
    // Agent-Funktionsaufrufe und strikte JSON-Extraktion (Smart-Upload,
    // Klassifikation, Mietvertrags-/PM-Vertrags-Analyse, …) konsequent
    // ausschließen – gilt nur für Groq-Modelle; Cerebras bleibt verfügbar.
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
  }

  let lastError: any;
  const groq = process.env.GROQ_API_KEY ? getGroqClient() : null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      if (isCerebrasModel(model)) {
        const cerebrasId = stripCerebrasPrefix(model);
        return await createCerebrasChatCompletion(cerebrasId, params);
      }
      if (!groq) {
        const err: any = new Error(
          "GROQ_API_KEY ist nicht gesetzt und kein Cerebras-Modell verfügbar."
        );
        err.status = 401;
        throw err;
      }
      const { model: _ignored, ...rest } = params;
      return await groq.chat.completions.create({
        ...rest,
        model,
      });
    } catch (err: any) {
      lastError = err;
      const hasMore = i < models.length - 1;
      if (hasMore && isRetryableModelError(err)) {
        const next = models[i + 1];
        const provider = isCerebrasModel(model) ? "cerebras" : "groq";
        console.warn(
          `[${provider}] Modell ${stripCerebrasPrefix(model)} fehlgeschlagen (${err?.status || ""} ${err?.message || err}). Fallback → ${stripCerebrasPrefix(next)}`
        );
        continue;
      }
      // Wenn Groq ohne Key und nur noch Cerebras übrig: weiter versuchen
      if (hasMore) {
        const next = models[i + 1];
        console.warn(
          `[llm] Modell ${stripCerebrasPrefix(model)} fehlgeschlagen (${err?.status || ""} ${err?.message || err}). Fallback → ${stripCerebrasPrefix(next)}`
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
