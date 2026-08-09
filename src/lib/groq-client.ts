import Groq from "groq-sdk";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "groq-sdk/resources/chat/completions";
import { recordAiUsage, recordModelCallStats, recordRateLimitEvent } from "./db";
import type { RateLimitEvent, RateLimitKategorie } from "./types";
import { uid } from "./utils";
import type { AiProvider } from "./types";

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

/**
 * Groq-Modelle im On-Demand-Tier mit 8000-TPM-Limit (laut Fehlermeldungen in
 * der Praxis beobachtet: "Limit 8000" für gpt-oss-120b, gpt-oss-20b und
 * qwen3.6-27b). Wird das Tools-Schema allein schon zu groß für dieses Limit,
 * werden diese Modelle übersprungen statt garantiert zu scheitern.
 */
const LOW_TPM_GROQ_MODELS = new Set([
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b",
]);
/** Schwelle (Tokens, nur Tools-Schema): ab hier bleibt zu wenig Spielraum für Nachricht+Antwort bei 8000 TPM. */
const LOW_TPM_SKIP_THRESHOLD = 5500;

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

/**
 * Extrahiert Rate-Limit-Details aus Groq/Cerebras/Cloudflare-Fehlermeldungen
 * für die "Letzte Rate-Limits"-Liste im Dashboard. Groq-Fehler haben ein
 * erkennbares Muster wie:
 *   "... on tokens per minute (TPM): Limit 8000, Requested 8123 ..."
 *   "... on tokens per day (TPD): Limit 100000, Used 96525, Requested 8224.
 *        Please try again in 1h8m23.13...s"
 * Liefert `null`, wenn keine der bekannten Kategorien (TPM/TPD/RPM/RPD)
 * gefunden wird (z.B. bei 402 Payment-required, das separat als
 * "Free-Tier-Exceed" gezählt wird statt als Rate-Limit-Event).
 */
function parseRateLimitDetails(errMessage: string): {
  kategorie: RateLimitKategorie;
  limit: number;
  used: number;
  requested: number;
  warteSekunden: number;
} | null {
  const m = String(errMessage || "");
  const katMatch = m.match(/\b(TPM|TPD|RPM|RPD)\b/);
  if (!katMatch) return null;
  const kategorie = katMatch[1] as RateLimitKategorie;
  const limit = Number(m.match(/Limit\s+(\d+)/)?.[1] ?? 0);
  const used = Number(m.match(/Used\s+(\d+)/)?.[1] ?? 0);
  const requested = Number(m.match(/Requested\s+(\d+)/)?.[1] ?? 0);
  let warteSekunden = 0;
  const waitMatch = m.match(/try again in\s+([\dhms.]+)/i);
  if (waitMatch) {
    const wait = waitMatch[1];
    const h = Number(wait.match(/(\d+(?:\.\d+)?)h/)?.[1] ?? 0);
    const min = Number(wait.match(/(\d+(?:\.\d+)?)m(?!s)/)?.[1] ?? 0);
    const s = Number(wait.match(/(\d+(?:\.\d+)?)s/)?.[1] ?? 0);
    warteSekunden = Math.round(h * 3600 + min * 60 + s);
  }
  return { kategorie, limit, used, requested, warteSekunden };
}

/** Baut die Katalog-ID im Format "{provider}:{modell}" (siehe llm-observability.ts). */
function toCatalogModelId(model: string): string {
  return `${providerNameOf(model)}:${stripProviderPrefix(model)}`;
}

/**
 * Erfasst einen Modell-Aufruf für die Cost & Rate-Limits-Übersicht
 * (fire-and-forget, darf den Response-Pfad nie beeinträchtigen).
 */
function trackModelCall(
  model: string,
  outcome: { success: boolean; rateLimited?: boolean; freeTierExceeded?: boolean },
  errMessage?: string,
  fallbackInfo?: { fallbackTo: string; fallbackStufe: number; gesamteKette: number }
): void {
  try {
    const modelId = toCatalogModelId(model);
    void recordModelCallStats(modelId, outcome).catch(() => {});
    if (outcome.rateLimited && errMessage) {
      const details = parseRateLimitDetails(errMessage);
      if (details) {
        const event: RateLimitEvent = {
          id: uid(),
          zeitpunkt: new Date().toISOString(),
          provider: providerNameOf(model),
          model: stripProviderPrefix(model),
          ...details,
          fallbackTo: fallbackInfo ? stripProviderPrefix(fallbackInfo.fallbackTo) : "",
          fallbackStufe: fallbackInfo?.fallbackStufe ?? 0,
          gesamteKette: fallbackInfo?.gesamteKette ?? 0,
        };
        void recordRateLimitEvent(event).catch(() => {});
      }
    }
  } catch {
    // Tracking darf den Response-Pfad nie beeinträchtigen.
  }
}

/**
 * Cooldown-Speicher: Modelle, die GERADE als rate-limitiert/erschöpft
 * bekannt sind, werden für die Dauer des Cooldowns übersprungen statt bei
 * JEDER Nachricht erneut angefragt und erneut abgelehnt zu werden.
 *
 * Vorher: jede einzelne Chat-Nachricht hat brav wieder alle 10
 * TPD-erschöpften/402-gesperrten Modelle in Folge angefragt, obwohl der
 * Provider Sekunden vorher schon "erst in 31 Minuten wieder" gesagt hatte –
 * das kostete bei JEDER Nachricht ~10 unnötige Requests und mehrere Sekunden
 * Latenz, bevor überhaupt ein funktionierendes Modell (meist NVIDIA, Stufe
 * 11/13) erreicht wurde.
 *
 * globalThis-basiert aus demselben Grund wie bei fly-logs.ts/db.ts: separate
 * Next.js-Webpack-Bundles dürfen hier keine eigenen, isolierten Kopien
 * bekommen (siehe providerNameOf-Bug, der genau daran lag).
 */
const COOLDOWN_GLOBAL_KEY = "__bkabr_modelCooldowns__";
const cooldownGlobal = globalThis as unknown as Record<string, Map<string, number> | undefined>;
if (!cooldownGlobal[COOLDOWN_GLOBAL_KEY]) {
  cooldownGlobal[COOLDOWN_GLOBAL_KEY] = new Map();
}
const modelCooldowns: Map<string, number> = cooldownGlobal[COOLDOWN_GLOBAL_KEY]!;

/** Cooldown setzen (Timestamp in ms, ab wann das Modell wieder versucht werden darf). */
function setModelCooldown(model: string, seconds: number): void {
  modelCooldowns.set(model, Date.now() + seconds * 1000);
}

/** true, wenn das Modell aktuell im Cooldown ist (noch nicht wieder versuchen). */
function isInCooldown(model: string): boolean {
  const until = modelCooldowns.get(model);
  return typeof until === "number" && until > Date.now();
}

/** Cooldown-Dauer aus einer Fehlermeldung ableiten. Fallback-Werte, wenn der Provider keine genaue Wartezeit nennt. */
function cooldownSecondsFor(err: any, status: number): number {
  const msg = String(err?.message || err || "");
  const waitMatch = msg.match(/try again in\s+([\dhms.]+)/i);
  if (waitMatch) {
    const wait = waitMatch[1];
    const h = Number(wait.match(/(\d+(?:\.\d+)?)h/)?.[1] ?? 0);
    const min = Number(wait.match(/(\d+(?:\.\d+)?)m(?!s)/)?.[1] ?? 0);
    const s = Number(wait.match(/(\d+(?:\.\d+)?)s/)?.[1] ?? 0);
    const total = h * 3600 + min * 60 + s;
    if (total > 0) return Math.ceil(total) + 5; // kleiner Sicherheitsabstand
  }
  // Kein genauer Wert genannt:
  if (status === 402) return 30 * 60; // Free-Tier/Guthaben aufgebraucht – selten kurzfristig behoben, aber Konto könnte aufgeladen werden
  if (status === 403) return 6 * 60 * 60; // Plan-/Freigabe-Problem (z.B. "not available on Workers Free plan") – strukturell, lange Pause
  if (status === 413) return 2 * 60; // "Request too large" – kann bei kleinerer nächster Anfrage schon wieder klappen
  return 60; // generischer Fallback
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

/**
 * Zuvor eine lokale Funktion innerhalb von createChatCompletion – dadurch
 * für andere Top-Level-Funktionen (z.B. trackModelCall) nicht erreichbar.
 * Auf Modulebene verschoben, damit sie überall im File nutzbar ist.
 */
function providerNameOf(model: string): string {
  if (isCerebrasModel(model)) return "cerebras";
  if (isCloudflareModel(model)) return "cloudflare";
  if (isNvidiaModel(model)) return "nvidia";
  return "groq";
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

/**
 * Grobe Token-Schätzung (DE/EN): ~2,2 Zeichen ≈ 1 Token.
 *
 * War vorher 4 Zeichen/Token – das hat den realen Verbrauch bei diesem
 * deutschen + JSON-strukturierten Content-Mix systematisch um ~1.7-2x
 * unterschätzt (Beleg aus Produktionslogs: geschätzt "input≈4616, safe=5000",
 * real vom Provider abgelehnt mit "Requested 8415-10203"). Die Folge: das
 * Budget hielt sich selbst für "safe", obwohl es nie sicher war, und die
 * beiden kleinsten Modelle (8000 TPM) sind dadurch faktisch IMMER an
 * "Request too large" gescheitert, unabhängig vom tatsächlichen
 * Kontextumfang. 2,2 Zeichen/Token liegt bewusst am unteren (=strengeren)
 * Ende, lieber leicht überschätzen als erneut zu knapp kalkulieren.
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(String(text).length / 2.2);
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
 * Für ALLE Modelle: Nachrichten so kürzen und max_completion_tokens so
 * setzen, dass Input+Output ein sicheres Budget nicht überschreiten.
 * Nutzervorgabe: nie mehr als 5000 Tokens pro Anfrage senden — das hält
 * Free-Tier-TPM-Limits ein (mehrere Modelle in der Fallback-Kette liegen bei
 * 8000 TPM) und schont zugleich das Tages-Kontingent (TPD), weil weniger
 * Tokens pro Retry verbraucht werden. Vorher galt das nur für qwen/qwen3.6-27b
 * — laut Logs schlugen aber auch openai/gpt-oss-20b und qwen mit exakt
 * demselben "Request too large"-Fehler fehl, deshalb jetzt für jedes Modell.
 */
function applyTokenBudget(model: string, params: ChatParams): ChatParams {
  const TPM_SAFE = 5000;
  const MIN_COMPLETION = 256;
  const messages = [...(params.messages || [])];

  // System + letzte User-Nachricht priorisieren; ältere Turns kürzen
  let inputTokens = estimateMessagesTokens(messages);
  // Tools-Tax: echte Schätzung, NICHT künstlich gedeckelt. Der Agent-Pfad
  // hängt bis zu 48 Tool-Definitionen an (~34.000 Zeichen Quelltext,
  // real ca. 5000-9000 Tokens je nach Modell-Tokenizer) – ein Deckel bei
  // 2000 hat das Budget systematisch schöngerechnet und dazu geführt, dass
  // JEDE Anfrage mit Tools bei den kleinsten Modellen (8000 TPM) garantiert
  // mit "Request too large" scheiterte, obwohl der Code "safe" meldete.
  const toolsTax = params.tools?.length ? estimateTokens(JSON.stringify(params.tools)) : 0;
  inputTokens += toolsTax;

  // max completion so wählen, dass Input + Completion ≤ TPM_SAFE
  let maxCompletion =
    (params as any).max_completion_tokens ??
    (params as any).max_tokens ??
    2000;
  maxCompletion = Math.min(maxCompletion, Math.max(MIN_COMPLETION, TPM_SAFE - inputTokens));

  // Wenn Input schon zu groß: von vorn (älteste non-system) kürzen / truncaten
  if (inputTokens + MIN_COMPLETION > TPM_SAFE) {
    const system = messages.filter((m) => m.role === "system");
    const rest = messages.filter((m) => m.role !== "system");
    // Behalte die letzten N Nachrichten, bis Budget passt
    let kept = [...rest];
    while (kept.length > 1) {
      const trial = [...system, ...kept];
      const t = estimateMessagesTokens(trial) + toolsTax;
      if (t + MIN_COMPLETION <= TPM_SAFE) break;
      // älteste droppen
      kept = kept.slice(1);
    }
    // Falls immer noch zu groß: letzte User-Nachricht hart kürzen
    let trialMsgs = [...system, ...kept];
    let t = estimateMessagesTokens(trialMsgs) + toolsTax;
    if (t + MIN_COMPLETION > TPM_SAFE) {
      const budgetForLast = Math.max(500, TPM_SAFE - toolsTax - MIN_COMPLETION - 200);
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
            "\n…[gekürzt wegen Token-Budget]…\n" +
            c.slice(-Math.floor(maxChars * 0.25)),
        } as any;
      });
      t = estimateMessagesTokens(trialMsgs) + toolsTax;
    }
    maxCompletion = Math.min(
      maxCompletion,
      Math.max(MIN_COMPLETION, TPM_SAFE - (estimateMessagesTokens(trialMsgs) + toolsTax))
    );
    console.warn(
      `[groq] ${model}: Token-Budget angepasst (input≈${estimateMessagesTokens(trialMsgs) + toolsTax}, max_completion=${maxCompletion}, safe=${TPM_SAFE})`
    );
    return {
      ...params,
      messages: trialMsgs,
      max_completion_tokens: maxCompletion,
    } as ChatParams;
  }

  if (maxCompletion < ((params as any).max_completion_tokens ?? 2000)) {
    console.warn(
      `[groq] ${model}: max_completion_tokens auf ${maxCompletion} begrenzt (input≈${inputTokens}, safe=${TPM_SAFE})`
    );
  }
  return {
    ...params,
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

    // Groq-Modelle mit niedrigem TPM-Limit (8000, On-Demand-Tier) von
    // vornherein überspringen, wenn allein das Tools-Schema (z.B. die 48
    // Agent-Tools, ~5000-9000 Tokens je nach Tokenizer) schon nahe an dieses
    // Limit heranreicht. Ohne diese Prüfung wird bei JEDEM Agent-Aufruf
    // garantiert 2x "Request too large" produziert, bevor überhaupt ein
    // Modell mit ausreichendem Kontingent versucht wird – kostet Zeit und
    // unnötige Fehlerlogs, ändert aber nichts am Ergebnis.
    if (params.tools?.length) {
      const toolsEstimate = estimateTokens(JSON.stringify(params.tools));
      if (toolsEstimate > LOW_TPM_SKIP_THRESHOLD) {
        const before = models.length;
        models = models.filter((m) => !LOW_TPM_GROQ_MODELS.has(m));
        if (models.length === 0) {
          // Alle Groq-Modelle rausgefiltert (keine Cerebras/Cloudflare/NVIDIA
          // konfiguriert) – dann lieber doch versuchen als komplett leer.
          models = groqModels;
        } else if (models.length < before) {
          console.warn(
            `[groq] Tools-Schema ≈${toolsEstimate} Tokens: ${before - models.length} Groq-Modell(e) mit 8000-TPM-Limit übersprungen.`
          );
        }
      }
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

  // Modelle im aktuellen Cooldown (kürzlich als rate-limitiert/gesperrt
  // erkannt) überspringen, statt sie erneut anzufragen und erneut abgelehnt
  // zu werden. Bleibt dadurch nichts mehr übrig (z.B. alles gleichzeitig im
  // Cooldown), lieber die volle Liste behalten als gar nichts zu versuchen.
  const nichtGekuehlt = models.filter((m) => !isInCooldown(m));
  if (nichtGekuehlt.length > 0) {
    const uebersprungen = models.length - nichtGekuehlt.length;
    if (uebersprungen > 0) {
      console.info(`[llm] ${uebersprungen} Modell(e) im Cooldown übersprungen, starte bei "${stripProviderPrefix(nichtGekuehlt[0])}".`);
    }
    models = nichtGekuehlt;
  }

  let lastError: any;
  const groq = process.env.GROQ_API_KEY ? getGroqClient() : null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const budgeted = applyTokenBudget(model, params);
    try {
      let completion: ChatCompletion;
      if (isCerebrasModel(model)) {
        const cerebrasId = stripCerebrasPrefix(model);
        completion = await createCerebrasChatCompletion(cerebrasId, budgeted);
      } else if (isCloudflareModel(model)) {
        const cfId = stripCloudflarePrefix(model);
        completion = await createCloudflareChatCompletion(cfId, budgeted);
      } else if (isNvidiaModel(model)) {
        const nvId = stripNvidiaPrefix(model);
        completion = await createNvidiaChatCompletion(nvId, budgeted);
      } else {
        if (!groq) {
          const err: any = new Error(
            "GROQ_API_KEY ist nicht gesetzt und kein Cerebras-/Cloudflare-/NVIDIA-Modell verfügbar."
          );
          err.status = 401;
          throw err;
        }
        const { model: _ignored, ...rest } = budgeted;
        completion = await groq.chat.completions.create({
          ...rest,
          model,
        });
      }
      // "Erfolgreich, aber leer" ist KEIN echter Erfolg: manche Modelle
      // (v.a. die schwächeren Fallback-Stufen wie glm-4.7-flash) liefern
      // gelegentlich HTTP 200 mit leerem content zurück, ohne dass ein Fehler
      // geworfen wird. Ohne diese Prüfung wird das als "Erfolg" akzeptiert
      // und an den Nutzer als "(Keine Antwort)" durchgereicht, obwohl noch
      // weitere Fallback-Stufen verfügbar wären. Bei echten Tool-Calls ist
      // leerer content dagegen normal (das Modell antwortet dann über
      // tool_calls statt Text) – das wird hier bewusst nicht als leer gewertet.
      const replyMsg = completion.choices?.[0]?.message as
        | { content?: string | null; tool_calls?: unknown[] }
        | undefined;
      const hasToolCalls = Boolean(replyMsg?.tool_calls?.length);
      const isBlankReply = !hasToolCalls && !String(replyMsg?.content ?? "").trim();
      const hasMoreForBlank = i < models.length - 1;
      if (isBlankReply && hasMoreForBlank) {
        const next = models[i + 1];
        console.warn(
          `[${providerNameOf(model)}] Modell ${stripProviderPrefix(model)} lieferte leere Antwort (HTTP ok, aber kein content). Fallback → ${stripProviderPrefix(next)}`
        );
        trackModelCall(model, { success: false });
        continue;
      }

      // Sichtbares Erfolgs-Log, sobald NICHT das primäre Modell verwendet wurde –
      // sonst bleibt bei einem Fallback (insb. Cerebras/Cloudflare/NVIDIA) unklar, ob
      // der Request überhaupt durchgekommen ist ("kein Feedback von der Cloudflare API").
      if (i > 0) {
        console.info(`[${providerNameOf(model)}] Modell ${stripProviderPrefix(model)} erfolgreich (Fallback-Stufe ${i + 1}/${models.length}).`);
      }
      trackModelCall(model, { success: true });
      modelCooldowns.delete(model);
      // AI Cost & Model Observatory (Durchgang 6): jeder erfolgreiche Aufruf
      // wird protokolliert (Tokens exakt aus completion.usage, sonst
      // geschätzt). Bewusst fire-and-forget mit eigenem try/catch — ein
      // Logging-Fehler darf den eigentlichen KI-Aufruf niemals scheitern lassen.
      try {
        const usage = (completion as unknown as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
        const exakt = usage?.prompt_tokens != null && usage?.completion_tokens != null;
        const promptTokens = usage?.prompt_tokens ?? estimateMessagesTokens(budgeted.messages);
        const completionContent = completion.choices?.[0]?.message?.content;
        const completionTokens =
          usage?.completion_tokens ??
          estimateTokens(typeof completionContent === "string" ? completionContent : JSON.stringify(completionContent || ""));
        void recordAiUsage({
          provider: providerNameOf(model) as AiProvider,
          model: stripProviderPrefix(model),
          fallbackStufe: i,
          promptTokens,
          completionTokens,
          exakt,
        }).catch(() => {});
      } catch {
        // Logging darf den Response-Pfad nie beeinträchtigen.
      }
      return completion;
    } catch (err: any) {
      lastError = err;
      const hasMore = i < models.length - 1;
      // 402 = Payment required → Free-Tier-Kontingent/Guthaben aufgebraucht.
      // 429 = klassisches Rate-Limit. 413 = "Request too large", bei Groqs
      // Free-Tier faktisch auch ein TPM-Rate-Limit (siehe applyTokenBudget).
      const status = Number(err?.status) || 0;
      const errMsg = String(err?.message || err || "");
      const freeTierExceeded = status === 402;
      const rateLimited =
        !freeTierExceeded &&
        (status === 429 || status === 413 || /rate_limit_exceeded|tokens per (minute|day)|requests per (minute|day)/i.test(errMsg));

      // Cooldown setzen, damit nachfolgende Nachrichten dieses Modell nicht
      // sofort wieder anfragen und erneut abgelehnt bekommen (siehe
      // setModelCooldown-Dokumentation oben).
      if (status === 402 || status === 403 || status === 413 || status === 429) {
        setModelCooldown(model, cooldownSecondsFor(err, status));
      }

      if (hasMore && isRetryableModelError(err)) {
        const next = models[i + 1];
        console.warn(
          `[${providerNameOf(model)}] Modell ${stripProviderPrefix(model)} fehlgeschlagen (${err?.status || ""} ${err?.message || err}). Fallback → ${stripProviderPrefix(next)}`
        );
        trackModelCall(model, { success: false, rateLimited, freeTierExceeded }, errMsg, {
          fallbackTo: next,
          fallbackStufe: i + 1,
          gesamteKette: models.length,
        });
        continue;
      }
      // Wenn Groq ohne Key und nur noch andere Provider übrig: weiter versuchen
      if (hasMore) {
        const next = models[i + 1];
        console.warn(
          `[llm] Modell ${stripProviderPrefix(model)} fehlgeschlagen (${err?.status || ""} ${err?.message || err}). Fallback → ${stripProviderPrefix(next)}`
        );
        trackModelCall(model, { success: false, rateLimited, freeTierExceeded }, errMsg, {
          fallbackTo: next,
          fallbackStufe: i + 1,
          gesamteKette: models.length,
        });
        continue;
      }
      trackModelCall(model, { success: false, rateLimited, freeTierExceeded }, errMsg);
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
