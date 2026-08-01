import Groq from "groq-sdk";

/**
 * Primärmodell + Fallbacks. Rate-Limits (TPD) sind modellbezogen –
 * bei 429/rate_limit_exceeded wird das nächste Modell versucht.
 *
 * Überschreibbar per ENV:
 *   GROQ_TEXT_MODEL=...
 *   GROQ_TEXT_MODELS=model-a,model-b,model-c   (Komma-getrennt, ersetzt die Default-Kette)
 */
const DEFAULT_TEXT_MODELS = [
  // gpt-oss-120b zuerst: höheres TPM-Limit, Llama oft am Tageslimit (TPD)
  process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile",
];

export function getTextModels(): string[] {
  if (process.env.GROQ_TEXT_MODELS) {
    return process.env.GROQ_TEXT_MODELS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // Primärmodell zuerst, dann Fallbacks ohne Duplikate
  const primary = process.env.GROQ_TEXT_MODEL || DEFAULT_TEXT_MODELS[0];
  const rest = DEFAULT_TEXT_MODELS.filter((m) => m !== primary);
  return [primary, ...rest];
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

type ChatParams = Omit<
  Groq.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  "model"
> & { model?: string };

/**
 * chat.completions.create mit automatischem Modell-Fallback bei Rate-Limit / Modellfehlern.
 */
export async function createChatCompletion(
  params: ChatParams
): Promise<Groq.Chat.Completions.ChatCompletion> {
  const groq = getGroqClient();
  const models = params.model
    ? [params.model, ...getTextModels().filter((m) => m !== params.model)]
    : getTextModels();

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
