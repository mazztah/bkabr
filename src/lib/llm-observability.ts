import type { LedEntry, ModelCatalogEntry, RateLimitEvent, RateLimitKategorie } from "./types";

// ============================================================
// LLM & System Observability – zentrale Engine
// ============================================================
// „Super Spielekind-Agent": Registry aller Fallback-Modelle (+ Vision) über
// sechs Ketten: Groq, Cerebras, Cloudflare, NVIDIA, Mistral, OpenRouter.
// Rate-Limit-Parser, Health-Ping-Logik und Modell-Dokumentation.
// Bewusst als eigenständiges Modul (kein DB-Zwang) – die Persistenz liegt in
// db.ts, die Erkennung/Statik hier.

export const FUN_MODE_ENV = "BK_FUN_MODE";

/** Erlaubte Provider-Präfixe für die Fallback-Kette. */
export const PROVIDER_PREFIXES = ["cerebras:", "cloudflare:", "nvidia:", "mistral:", "openrouter:"] as const;

/** Ermittelt den Provider aus einem Modell-String (Präfix oder Standard). */
export function providerOf(model: string): string {
  if (model.startsWith("cerebras:")) return "cerebras";
  if (model.startsWith("cloudflare:")) return "cloudflare";
  if (model.startsWith("nvidia:")) return "nvidia";
  if (model.startsWith("mistral:")) return "mistral";
  if (model.startsWith("openrouter:")) return "openrouter";
  return "groq";
}

/** Entfernt den Provider-Präfix für die saubere Anzeige. */
export function stripProviderPrefix(model: string): string {
  for (const p of PROVIDER_PREFIXES) {
    if (model.startsWith(p)) return model.slice(p.length);
  }
  return model;
}

/** Prüft, ob der Spaßmodus aktiv ist (ENV). */
export function isFunModeEnabled(): boolean {
  return process.env[FUN_MODE_ENV] === "1" || process.env[FUN_MODE_ENV] === "true";
}

// ------------------------------------------------------------
// Modell-Katalog (alle Fallback-Modelle aller sechs Ketten + Vision-Modelle)
// ------------------------------------------------------------

function baseHealth() {
  return {
    status: "unknown" as const,
    freeTierExceededCount: 0,
    rateLimitCount: 0,
    totalCalls: 0,
    successCalls: 0,
  };
}

function baseCapabilities() {
  return {
    vision: false,
    reasoning: false,
    functionCalling: false,
    jsonMode: false,
    structuredOutput: false,
    streaming: true,
    multilingual: true,
    toolUse: false,
    embedding: false,
  };
}

/**
 * Bekannte Free-Tier-Limits (TPM/TPD), NUR für Modelle, bei denen die exakten
 * Werte tatsächlich aus realen Fehlermeldungen des jeweiligen Providers
 * beobachtet wurden (siehe Server-Logs) – bewusst KEINE geschätzten/
 * erfundenen Werte für andere Modelle, um im Dashboard keine falsche
 * Sicherheit vorzutäuschen. Fehlt ein Eintrag, zeigt das UI "unbekannt".
 *
 * groq/compound und groq/compound-mini sind Meta-Modelle: Groq routet sie
 * intern an llama-4-scout-17b-16e-instruct bzw. llama-3.3-70b-versatile –
 * ursprüngliche Annahme war, die Limits dieser zugrunde liegenden Modelle
 * (30000 TPM bzw. 100000 TPD) würden auch für "compound" selbst gelten.
 *
 * WIDERLEGT durch reale Produktionslogs: beide Modelle scheiterten
 * nacheinander mit echtem 413 "Request Entity Too Large" bei
 * input≈8196 Tokens – deutlich unter der angenommenen 30000/100000-Grenze.
 * Effektiv verhalten sie sich also wie die anderen On-Demand-Modelle mit
 * ~8000-Token-Limit (siehe groq-client.ts LOW_TPM_GROQ_MODELS, wo beide
 * inzwischen ebenfalls eingetragen sind). Werte hier auf die real
 * beobachtete Grenze korrigiert, damit das Dashboard nicht weiter ein
 * großzügigeres Budget vorspiegelt, als tatsächlich nutzbar ist.
 */
export const KNOWN_FREE_TIER_LIMITS: Record<
  string,
  { tpm?: number; tpd?: number; hinweis?: string }
> = {
  "groq:openai/gpt-oss-120b": { tpm: 8000, tpd: 200000 },
  "groq:openai/gpt-oss-20b": { tpm: 8000 },
  "groq:qwen/qwen3.6-27b": { tpm: 8000 },
  "groq:qwen/qwen3.8-27b": { tpm: 8000 },
  "groq:groq/compound-mini": {
    tpm: 8000,
    hinweis: "Real beobachtet: 413 bei input≈8196 Tokens, trotz früherer Annahme (100000 TPD via llama-3.3-70b-versatile)",
  },
  "groq:groq/compound": {
    tpm: 8000,
    hinweis: "Real beobachtet: 413 bei input≈8196 Tokens, trotz früherer Annahme (30000 TPM via llama-4-scout-17b-16e-instruct)",
  },
  "groq:meta-llama/llama-4-scout-17b-16e-instruct": { tpm: 30000 },
};

/**
 * Statischer Modell-Katalog. Die `health`-Felder werden zur Laufzeit durch
 * db.ts (Ping-Ergebnisse, Rate-Limits) überschrieben bzw. ergänzt – hier
 * stehen die Stammdaten (Firma, Release, Context, Links).
 */
export function getStaticModelCatalog(): ModelCatalogEntry[] {
  const entries: ModelCatalogEntry[] = [
    // ---- Groq (Stufen 1–5) ----
    {
      id: "groq:openai/gpt-oss-120b",
      provider: "groq",
      model: "openai/gpt-oss-120b",
      label: "GPT-OSS-120B",
      apiModel: "openai/gpt-oss-120b",
      providerPrefix: "groq",
      fallbackPriority: 1,
      company: "OpenAI (via Groq)",
      released: "2025",
      contextLength: 128000,
      maxOutput: 16384,
      capabilities: { ...baseCapabilities(), reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://console.groq.com/docs/models",
        docs: "https://console.groq.com/docs",
        playground: "https://console.groq.com/playground",
        pricing: "https://console.groq.com/settings",
      },
      health: { ...baseHealth() },
      lastAgentUpdate: undefined,
      dataSource: "builtin",
    },
    {
      id: "groq:openai/gpt-oss-20b",
      provider: "groq",
      model: "openai/gpt-oss-20b",
      label: "GPT-OSS-20B",
      apiModel: "openai/gpt-oss-20b",
      providerPrefix: "groq",
      fallbackPriority: 2,
      company: "OpenAI (via Groq)",
      released: "2025",
      contextLength: 128000,
      maxOutput: 16384,
      capabilities: { ...baseCapabilities(), reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://console.groq.com/docs/models",
        docs: "https://console.groq.com/docs",
        playground: "https://console.groq.com/playground",
        pricing: "https://console.groq.com/settings",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "groq:qwen/qwen3.6-27b",
      provider: "groq",
      model: "qwen/qwen3.6-27b",
      label: "Qwen 3.6-27B",
      apiModel: "qwen/qwen3.6-27b",
      providerPrefix: "groq",
      fallbackPriority: 3,
      company: "Alibaba (via Groq)",
      released: "2025",
      contextLength: 128000,
      maxOutput: 16384,
      capabilities: { ...baseCapabilities(), reasoning: true, jsonMode: true, structuredOutput: true },
      links: {
        docs: "https://qwen.readthedocs.io",
        github: "https://github.com/QwenLM/Qwen",
        playground: "https://console.groq.com/playground",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "groq:qwen/qwen3.8-27b",
      provider: "groq",
      model: "qwen/qwen3.8-27b",
      label: "Qwen 3.8 27B",
      apiModel: "qwen/qwen3.8-27b",
      providerPrefix: "groq",
      fallbackPriority: 4,
      company: "Alibaba Cloud (via Groq)",
      released: "2026",
      contextLength: 131042,
      maxOutput: 16384,
      capabilities: { ...baseCapabilities(), vision: true, reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://console.groq.com/docs/models",
        docs: "https://console.groq.com/docs/model/qwen/qwen3.8-27b",
        playground: "https://console.groq.com/playground",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "groq:groq/compound-mini",
      provider: "groq",
      model: "groq/compound-mini",
      label: "Compound Mini",
      apiModel: "groq/compound-mini",
      providerPrefix: "groq",
      fallbackPriority: 4,
      company: "Groq",
      released: "2026",
      contextLength: 128000,
      maxOutput: 16384,
      capabilities: { ...baseCapabilities(), reasoning: true },
      links: {
        docs: "https://console.groq.com/docs",
        playground: "https://console.groq.com/playground",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "groq:groq/compound",
      provider: "groq",
      model: "groq/compound",
      label: "Compound",
      apiModel: "groq/compound",
      providerPrefix: "groq",
      fallbackPriority: 5,
      company: "Groq",
      released: "2026",
      contextLength: 128000,
      maxOutput: 16384,
      capabilities: { ...baseCapabilities(), reasoning: true },
      links: {
        docs: "https://console.groq.com/docs",
        playground: "https://console.groq.com/playground",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },

    // ---- Cerebras (Stufen 6–7) ----
    {
      id: "cerebras:gemma-4-31b",
      provider: "cerebras",
      model: "gemma-4-31b",
      label: "Gemma 4 31B",
      apiModel: "gemma-4-31b",
      providerPrefix: "cerebras:",
      fallbackPriority: 6,
      company: "Google (via Cerebras)",
      released: "2025",
      contextLength: 128000,
      maxOutput: 8192,
      capabilities: { ...baseCapabilities(), vision: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://inference-docs.cerebras.ai",
        docs: "https://inference-docs.cerebras.ai",
        github: "https://github.com/google-deepmind/gemma",
        pricing: "https://www.cerebras.ai/pricing",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "cerebras:zai-glm-4.7",
      provider: "cerebras",
      model: "zai-glm-4.7",
      label: "ZAI GLM-4.7",
      apiModel: "zai-glm-4.7",
      providerPrefix: "cerebras:",
      fallbackPriority: 7,
      company: "Zhipu AI (via Cerebras)",
      released: "2025",
      contextLength: 131072,
      maxOutput: 8192,
      capabilities: { ...baseCapabilities(), functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        docs: "https://zhipuai.cn/en",
        github: "https://github.com/zai-org/GLM",
        api: "https://inference-docs.cerebras.ai",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },

    // ---- Cloudflare Workers AI (Stufen 8–10) ----
    {
      id: "cloudflare:@cf/zai-org/glm-4.7-flash",
      provider: "cloudflare",
      model: "@cf/zai-org/glm-4.7-flash",
      label: "GLM-4.7-Flash",
      apiModel: "@cf/zai-org/glm-4.7-flash",
      providerPrefix: "cloudflare:",
      fallbackPriority: 8,
      company: "Zhipu AI (via Cloudflare)",
      released: "2025",
      contextLength: 131072,
      maxOutput: 8192,
      capabilities: { ...baseCapabilities(), functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        docs: "https://developers.cloudflare.com/workers-ai/models/",
        api: "https://developers.cloudflare.com/api/operations/workers-ai-post-ai-run",
        github: "https://github.com/zai-org/GLM",
        changelog: "https://developers.cloudflare.com/workers-ai/changelog/",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "cloudflare:@cf/google/gemma-4-26b-a4b-it",
      provider: "cloudflare",
      model: "@cf/google/gemma-4-26b-a4b-it",
      label: "Gemma 4 26B",
      apiModel: "@cf/google/gemma-4-26b-a4b-it",
      providerPrefix: "cloudflare:",
      fallbackPriority: 9,
      company: "Google (via Cloudflare)",
      released: "2025",
      contextLength: 131072,
      maxOutput: 8192,
      capabilities: { ...baseCapabilities(), vision: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        docs: "https://developers.cloudflare.com/workers-ai/models/",
        github: "https://github.com/google-deepmind/gemma",
        changelog: "https://developers.cloudflare.com/workers-ai/changelog/",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "cloudflare:@cf/moonshotai/kimi-k2.6",
      provider: "cloudflare",
      model: "@cf/moonshotai/kimi-k2.6",
      label: "Kimi K2.6",
      apiModel: "@cf/moonshotai/kimi-k2.6",
      providerPrefix: "cloudflare:",
      fallbackPriority: 10,
      company: "Moonshot AI (via Cloudflare)",
      released: "2025",
      contextLength: 262144,
      maxOutput: 16384,
      capabilities: { ...baseCapabilities(), vision: true, reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        docs: "https://developers.cloudflare.com/workers-ai/models/",
        github: "https://github.com/MoonshotAI",
        changelog: "https://developers.cloudflare.com/workers-ai/changelog/",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },

    // ---- NVIDIA Build / NIM (Stufen 11–13) ----
    {
      id: "nvidia:meta/llama-3.3-70b-instruct",
      provider: "nvidia",
      model: "meta/llama-3.3-70b-instruct",
      label: "Llama 3.3 70B",
      apiModel: "meta/llama-3.3-70b-instruct",
      providerPrefix: "nvidia:",
      fallbackPriority: 11,
      company: "Meta (via NVIDIA)",
      released: "2024",
      contextLength: 128000,
      maxOutput: 8192,
      capabilities: { ...baseCapabilities(), reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://build.nvidia.com/meta/llama-3_3-70b-instruct",
        docs: "https://build.nvidia.com/docs",
        github: "https://github.com/meta-llama/llama-models",
        pricing: "https://build.nvidia.com",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "nvidia:meta/llama-3.1-8b-instruct",
      provider: "nvidia",
      model: "meta/llama-3.1-8b-instruct",
      label: "Llama 3.1 8B",
      apiModel: "meta/llama-3.1-8b-instruct",
      providerPrefix: "nvidia:",
      fallbackPriority: 12,
      company: "Meta (via NVIDIA)",
      released: "2024",
      contextLength: 128000,
      maxOutput: 8192,
      capabilities: { ...baseCapabilities(), reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://build.nvidia.com/meta/llama-3_1-8b-instruct",
        docs: "https://build.nvidia.com/docs",
        github: "https://github.com/meta-llama/llama-models",
        pricing: "https://build.nvidia.com",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "nvidia:meta/llama-3.2-3b-instruct",
      provider: "nvidia",
      model: "meta/llama-3.2-3b-instruct",
      label: "Llama 3.2 3B",
      apiModel: "meta/llama-3.2-3b-instruct",
      providerPrefix: "nvidia:",
      fallbackPriority: 13,
      company: "Meta (via NVIDIA)",
      released: "2024",
      contextLength: 128000,
      maxOutput: 8192,
      capabilities: { ...baseCapabilities(), reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://build.nvidia.com/meta/llama-3_2-3b-instruct",
        docs: "https://build.nvidia.com/docs",
        github: "https://github.com/meta-llama/llama-models",
        pricing: "https://build.nvidia.com",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },


    // ---- NVIDIA Build / NIM: zusätzliche tool-starke Stufen ----
    // Beide laut NVIDIA-Modellkarte explizit für Function Calling / agentische
    // Workflows gebaut – deshalb in der Kette VOR den kleinen Llama-Stufen,
    // die Tool-Aufrufe in der Praxis nur als Text ankündigen.
    {
      id: "nvidia:nvidia/llama-3.3-nemotron-super-49b-v1",
      provider: "nvidia",
      model: "nvidia/llama-3.3-nemotron-super-49b-v1",
      label: "Llama 3.3 Nemotron Super 49B",
      apiModel: "nvidia/llama-3.3-nemotron-super-49b-v1",
      providerPrefix: "nvidia:",
      fallbackPriority: 11,
      company: "NVIDIA",
      released: "2025",
      contextLength: 131072,
      maxOutput: 16384,
      capabilities: { ...baseCapabilities(), reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://build.nvidia.com/nvidia/llama-3_3-nemotron-super-49b-v1",
        docs: "https://docs.api.nvidia.com/nim/reference/llm-apis",
        pricing: "https://build.nvidia.com",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "nvidia:mistralai/mistral-nemotron",
      provider: "nvidia",
      model: "mistralai/mistral-nemotron",
      label: "Mistral Nemotron",
      apiModel: "mistralai/mistral-nemotron",
      providerPrefix: "nvidia:",
      fallbackPriority: 12,
      company: "Mistral AI + NVIDIA",
      released: "2025",
      contextLength: 131072,
      maxOutput: 16384,
      capabilities: { ...baseCapabilities(), reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://build.nvidia.com/mistralai/mistral-nemotron",
        docs: "https://docs.api.nvidia.com/nim/reference/llm-apis",
        pricing: "https://build.nvidia.com",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },

    // ---- Mistral La Plateforme (NEUE KETTE 1, Stufen 16-19) ----
    // Eigener Free-Tier ("Experiment"), unabhängig von allen bisherigen
    // Anbietern. EU-Anbieter (Frankreich) – bei Mieter-/Vertragsdaten
    // datenschutzseitig deutlich unkomplizierter als die US-Stufen.
    {
      id: "mistral:mistral-medium-latest",
      provider: "mistral",
      model: "mistral-medium-latest",
      label: "Mistral Medium (Flagship)",
      apiModel: "mistral-medium-latest",
      providerPrefix: "mistral:",
      fallbackPriority: 16,
      company: "Mistral AI",
      released: "2026",
      contextLength: 262144,
      maxOutput: 32768,
      capabilities: { ...baseCapabilities(), vision: true, reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://api.mistral.ai/v1/chat/completions",
        docs: "https://docs.mistral.ai/",
        playground: "https://console.mistral.ai/",
        pricing: "https://mistral.ai/pricing",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "mistral:mistral-small-latest",
      provider: "mistral",
      model: "mistral-small-latest",
      label: "Mistral Small",
      apiModel: "mistral-small-latest",
      providerPrefix: "mistral:",
      fallbackPriority: 17,
      company: "Mistral AI",
      released: "2026",
      contextLength: 131072,
      maxOutput: 16384,
      capabilities: { ...baseCapabilities(), vision: true, reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://api.mistral.ai/v1/chat/completions",
        docs: "https://docs.mistral.ai/",
        playground: "https://console.mistral.ai/",
        pricing: "https://mistral.ai/pricing",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "mistral:magistral-small-latest",
      provider: "mistral",
      model: "magistral-small-latest",
      label: "Magistral Small (Reasoning)",
      apiModel: "magistral-small-latest",
      providerPrefix: "mistral:",
      fallbackPriority: 18,
      company: "Mistral AI",
      released: "2025",
      contextLength: 131072,
      maxOutput: 16384,
      capabilities: { ...baseCapabilities(), reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://api.mistral.ai/v1/chat/completions",
        docs: "https://docs.mistral.ai/",
        playground: "https://console.mistral.ai/",
        pricing: "https://mistral.ai/pricing",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "mistral:open-mistral-nemo",
      provider: "mistral",
      model: "open-mistral-nemo",
      label: "Mistral Nemo 12B",
      apiModel: "open-mistral-nemo",
      providerPrefix: "mistral:",
      fallbackPriority: 19,
      company: "Mistral AI",
      released: "2024",
      contextLength: 131072,
      maxOutput: 8192,
      capabilities: { ...baseCapabilities(), jsonMode: true, multilingual: true },
      links: {
        api: "https://api.mistral.ai/v1/chat/completions",
        docs: "https://docs.mistral.ai/",
        playground: "https://console.mistral.ai/",
        pricing: "https://mistral.ai/pricing",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },

    // ---- OpenRouter (NEUE KETTE 2, Stufen 20-23) ----
    // Bewusst letzte Kette: Aggregator, nicht eigener Inferenz-Anbieter.
    // "openrouter/free" ist OpenRouters eigener Free-Models-Router – er wählt
    // zur Laufzeit eine kostenlose Route und filtert dabei SELBST nach den
    // Fähigkeiten des Requests (Tool-Calling, Structured Output, Vision).
    // Genau deshalb steht er vor den festen Slugs: die ":free"-Routen
    // rotieren schnell, der Router überlebt das ohne Code-Änderung.
    {
      id: "openrouter:openrouter/free",
      provider: "openrouter",
      model: "openrouter/free",
      label: "Free Models Router",
      apiModel: "openrouter/free",
      providerPrefix: "openrouter:",
      fallbackPriority: 20,
      company: "OpenRouter",
      released: "2026",
      contextLength: 200000,
      maxOutput: 16384,
      capabilities: { ...baseCapabilities(), vision: true, reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://openrouter.ai/api/v1/chat/completions",
        docs: "https://openrouter.ai/docs",
        playground: "https://openrouter.ai/chat",
        pricing: "https://openrouter.ai/models?q=free",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "openrouter:openai/gpt-oss-120b:free",
      provider: "openrouter",
      model: "openai/gpt-oss-120b:free",
      label: "GPT-OSS 120B (free)",
      apiModel: "openai/gpt-oss-120b:free",
      providerPrefix: "openrouter:",
      fallbackPriority: 21,
      company: "OpenAI (via OpenRouter)",
      released: "2025",
      contextLength: 131072,
      maxOutput: 32768,
      capabilities: { ...baseCapabilities(), reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://openrouter.ai/api/v1/chat/completions",
        docs: "https://openrouter.ai/docs",
        playground: "https://openrouter.ai/chat",
        pricing: "https://openrouter.ai/models?q=free",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "openrouter:nvidia/nemotron-3-nano-30b-a3b:free",
      provider: "openrouter",
      model: "nvidia/nemotron-3-nano-30b-a3b:free",
      label: "Nemotron 3 Nano 30B (free)",
      apiModel: "nvidia/nemotron-3-nano-30b-a3b:free",
      providerPrefix: "openrouter:",
      fallbackPriority: 22,
      company: "NVIDIA (via OpenRouter)",
      released: "2026",
      contextLength: 131072,
      maxOutput: 16384,
      capabilities: { ...baseCapabilities(), reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://openrouter.ai/api/v1/chat/completions",
        docs: "https://openrouter.ai/docs",
        playground: "https://openrouter.ai/chat",
        pricing: "https://openrouter.ai/models?q=free",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "openrouter:google/gemma-4-27b-it:free",
      provider: "openrouter",
      model: "google/gemma-4-27b-it:free",
      label: "Gemma 4 27B (free)",
      apiModel: "google/gemma-4-27b-it:free",
      providerPrefix: "openrouter:",
      fallbackPriority: 23,
      company: "Google (via OpenRouter)",
      released: "2025",
      contextLength: 131072,
      maxOutput: 8192,
      capabilities: { ...baseCapabilities(), jsonMode: true, functionCalling: true, toolUse: true },
      links: {
        api: "https://openrouter.ai/api/v1/chat/completions",
        docs: "https://openrouter.ai/docs",
        playground: "https://openrouter.ai/chat",
        pricing: "https://openrouter.ai/models?q=free",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },

    // ---- Vision-Modelle (Fallback für Bild-Verarbeitung) ----
    // WICHTIG (Stand 17.09.2026): llama-4-scout wurde von Groq am 17.06.2026
    // abgekündigt und ist seit 16.08.2026 abgeschaltet – der Eintrag bleibt
    // nur noch zur Nachvollziehbarkeit alter Logs stehen (dataSource bleibt
    // "builtin", Status wird beim Ping automatisch grau). Aktuelle
    // Groq-Vision-Modelle sind die beiden Qwen-3er darunter.
    {
      id: "groq:qwen/qwen3.6-27b-vision",
      provider: "groq",
      model: "qwen/qwen3.6-27b",
      label: "Qwen 3.6 27B (Vision)",
      apiModel: "qwen/qwen3.6-27b",
      providerPrefix: "groq",
      fallbackPriority: 24,
      company: "Alibaba Cloud (via Groq)",
      released: "2026",
      contextLength: 131072,
      maxOutput: 16384,
      capabilities: { ...baseCapabilities(), vision: true, reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        docs: "https://console.groq.com/docs/vision",
        api: "https://console.groq.com/docs/model/qwen/qwen3.6-27b",
        playground: "https://console.groq.com/playground",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "groq:qwen/qwen3.8-27b-vision",
      provider: "groq",
      model: "qwen/qwen3.8-27b",
      label: "Qwen 3.8 27B (Vision)",
      apiModel: "qwen/qwen3.8-27b",
      providerPrefix: "groq",
      fallbackPriority: 25,
      company: "Alibaba Cloud (via Groq)",
      released: "2026",
      contextLength: 131042,
      maxOutput: 16384,
      capabilities: { ...baseCapabilities(), vision: true, reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        docs: "https://console.groq.com/docs/vision",
        api: "https://console.groq.com/docs/model/qwen/qwen3.8-27b",
        playground: "https://console.groq.com/playground",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "groq:meta-llama/llama-4-scout-17b-16e-instruct",
      provider: "groq",
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      label: "Llama 4 Scout 17B (abgekündigt)",
      apiModel: "meta-llama/llama-4-scout-17b-16e-instruct",
      providerPrefix: "groq",
      fallbackPriority: 14,
      company: "Meta (via Groq)",
      released: "2025",
      contextLength: 10000000,
      maxOutput: 16384,
      capabilities: { ...baseCapabilities(), vision: true, reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        docs: "https://console.groq.com/docs/vision",
        github: "https://github.com/meta-llama/llama-models",
        playground: "https://console.groq.com/playground",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "cerebras:gemma-4-31b-vision",
      provider: "cerebras",
      model: "gemma-4-31b",
      label: "Gemma 4 31B (Vision)",
      apiModel: "gemma-4-31b",
      providerPrefix: "cerebras:",
      fallbackPriority: 15,
      company: "Google (via Cerebras)",
      released: "2025",
      contextLength: 128000,
      maxOutput: 8192,
      capabilities: { ...baseCapabilities(), vision: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://inference-docs.cerebras.ai",
        docs: "https://inference-docs.cerebras.ai",
        github: "https://github.com/google-deepmind/gemma",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "cloudflare:@cf/google/gemma-4-26b-a4b-it-vision",
      provider: "cloudflare",
      model: "@cf/google/gemma-4-26b-a4b-it",
      label: "Gemma 4 26B (Vision)",
      apiModel: "@cf/google/gemma-4-26b-a4b-it",
      providerPrefix: "cloudflare:",
      fallbackPriority: 16,
      company: "Google (via Cloudflare)",
      released: "2025",
      contextLength: 131072,
      maxOutput: 8192,
      capabilities: { ...baseCapabilities(), vision: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        docs: "https://developers.cloudflare.com/workers-ai/models/",
        github: "https://github.com/google-deepmind/gemma",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
    {
      id: "mistral:mistral-medium-latest-vision",
      provider: "mistral",
      model: "mistral-medium-latest",
      label: "Mistral Medium (Vision)",
      apiModel: "mistral-medium-latest",
      providerPrefix: "mistral:",
      fallbackPriority: 26,
      company: "Mistral AI",
      released: "2026",
      contextLength: 262144,
      maxOutput: 32768,
      capabilities: { ...baseCapabilities(), vision: true, reasoning: true, functionCalling: true, jsonMode: true, structuredOutput: true, toolUse: true },
      links: {
        api: "https://api.mistral.ai/v1/chat/completions",
        docs: "https://docs.mistral.ai/",
        playground: "https://console.mistral.ai/",
      },
      health: { ...baseHealth() },
      dataSource: "builtin",
    },
  ];

  return entries;
}

// ------------------------------------------------------------
// Rate-Limit-Parser (Fly.io/Log-Zeilen)
// ------------------------------------------------------------

/** Erkennt Kategorie (TPD/TPM/RPM/RPD) und extrahiert Limit/Used/Requested. */
export function parseRateLimitKategorie(msg: string): { kategorie: RateLimitKategorie; limit: number; used: number; requested: number } | null {
  const m = msg.match(
    /(TPD|TPM|RPM|RPD|ZPM|ZPD)[^:]*:\s*Limit\s+(\d+)[^U]*Used\s+(\d+)[^R]*Requested\s+(\d+)/
  );
  if (!m) return null;
  const kategorie = m[1] as RateLimitKategorie;
  return {
    kategorie,
    limit: Number(m[2]),
    used: Number(m[3]),
    requested: Number(m[4]),
  };
}

/** Extrahiert Wartezeit "try again in XXs/m" aus Fehlermeldung. */
export function parseWarteSekunden(msg: string): number {
  const m = msg.match(/try again in\s+([\d.]+)\s*m?(?:in)?\s*([\d.]+)?\s*s/i);
  if (m && m[2]) {
    return Math.round(Number(m[1]) * 60 + Number(m[2]));
  }
  const plain = msg.match(/try again in\s+([\d.]+)\s*s/i);
  if (plain) return Math.round(Number(plain[1]));
  const min = msg.match(/try again in\s+([\d.]+)\s*m/i);
  if (min) return Math.round(Number(min[1]) * 60);
  return 0;
}

/**
 * Parst eine Level-0-Log-Zeile (z.B. ein Fehler im connection-Handler) und
 * erzeugt – falls es sich um ein Rate-Limit handelt – ein `RateLimitEvent`.
 */
export function parseRateLimitEvent(input: {
  message: string;
  provider: string;
  model: string;
  fallbackTo: string;
  fallbackStufe: number;
  gesamteKette: number;
}): RateLimitEvent | null {
  const parsed = parseRateLimitKategorie(input.message);
  if (!parsed) return null;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    zeitpunkt: new Date().toISOString(),
    provider: input.provider,
    model: input.model,
    kategorie: parsed.kategorie,
    limit: parsed.limit,
    used: parsed.used,
    requested: parsed.requested,
    warteSekunden: parseWarteSekunden(input.message),
    fallbackTo: input.fallbackTo,
    fallbackStufe: input.fallbackStufe,
    gesamteKette: input.gesamteKette,
  };
}

// ------------------------------------------------------------
// Health-Ping-Logik
// ------------------------------------------------------------

export interface PingResult {
  ok: boolean;
  status: "green" | "gray";
  durationMs: number;
  error?: string;
}

/**
 * Führt einen minimalen Health-Ping gegen einen OpenAI-kompatiblen Endpoint
 * durch. Nutzt einen leeren (bzw. 1-Token) Chat-Completion-Request – genug,
 * um API-Key/Erreichbarkeit zu prüfen, ohne nennenswert Tokens zu verbrauchen.
 */
export async function pingProviderModel(input: {
  provider: string;
  apiModel: string;
  apiKey?: string;
  baseUrl?: string;
  accountId?: string;
}): Promise<PingResult> {
  const start = Date.now();
  try {
    let url: string;
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    let body: Record<string, unknown> = {
      model: input.apiModel,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    };

    if (input.provider === "groq") {
      url = "https://api.groq.com/openai/v1/chat/completions";
      if (!input.apiKey) return { ok: false, status: "gray", durationMs: Date.now() - start, error: "GROQ_API_KEY fehlt" };
      headers.Authorization = `Bearer ${input.apiKey}`;
    } else if (input.provider === "cerebras") {
      url = "https://api.cerebras.ai/v1/chat/completions";
      if (!input.apiKey) return { ok: false, status: "gray", durationMs: Date.now() - start, error: "CEREBRAS_API_KEY fehlt" };
      headers.Authorization = `Bearer ${input.apiKey}`;
    } else if (input.provider === "cloudflare") {
      if (!input.accountId) return { ok: false, status: "gray", durationMs: Date.now() - start, error: "CLOUDFLARE_ACCOUNT_ID fehlt" };
      if (!input.apiKey) return { ok: false, status: "gray", durationMs: Date.now() - start, error: "CLOUDFLARE_API_TOKEN fehlt" };
      url = `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/ai/v1/chat/completions`;
      headers.Authorization = `Bearer ${input.apiKey}`;
    } else if (input.provider === "nvidia") {
      url = "https://integrate.api.nvidia.com/v1/chat/completions";
      if (!input.apiKey) return { ok: false, status: "gray", durationMs: Date.now() - start, error: "NVIDIA_API_KEY fehlt" };
      headers.Authorization = `Bearer ${input.apiKey}`;
    } else {
      return { ok: false, status: "gray", durationMs: Date.now() - start, error: `Unbekannter Provider: ${input.provider}` };
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      return { ok: true, status: "green", durationMs: Date.now() - start };
    }
    // 429/401/402/413 = erreichbar, aber nicht verfügbar (Rate-Limit/Paywall)
    if ([429, 401, 402, 403, 413].includes(res.status)) {
      return { ok: false, status: "gray", durationMs: Date.now() - start, error: `HTTP ${res.status}` };
    }
    return { ok: false, status: "gray", durationMs: Date.now() - start, error: `HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, status: "gray", durationMs: Date.now() - start, error: err?.message || String(err) };
  }
}

// ------------------------------------------------------------
// LED-Wall
// ------------------------------------------------------------

/** Baut die LED-Wall aus Umgebungsvariablen + Daten auf. */
export function buildLedWall(input: {
  hasDocuments: boolean;
  hasPruefLaeufe: boolean;
  rateLimitCount: number;
  /** Anzahl Dokumente in der Ablage (für Detail-Popover). */
  documentCount?: number;
  /** Anzahl protokollierter Agent-Aktionen. */
  auditCount?: number;
  /** Zeitpunkt des letzten monatlichen Modell-Updates. */
  lastMonthlyUpdateAt?: string | null;
  /** Fun-Mode aktiv? */
  funMode?: boolean;
  /** Aggregierte Call-Statistik je Provider, aus dem Modellkatalog berechnet. */
  providerStats?: Record<
    string,
    { totalCalls: number; successCalls: number; rateLimitCount: number }
  >;
}): LedEntry[] {
  const ly = (yellow: boolean): "green" | "yellow" => (yellow ? "yellow" : "green");
  const stats = input.providerStats || {};

  /** Baut die Standard-Detailzeilen für ein Provider-LED (Groq/Cerebras/Cloudflare/NVIDIA). */
  const providerDetail = (
    hasKey: boolean,
    providerId: string
  ): { label: string; value: string }[] => {
    const s = stats[providerId];
    if (!hasKey) return [{ label: "Status", value: "Kein API-Key gesetzt" }];
    if (!s || s.totalCalls === 0) {
      return [
        { label: "Status", value: "Konfiguriert, noch keine Aufrufe" },
      ];
    }
    const failed = s.totalCalls - s.successCalls;
    const quote = s.totalCalls > 0 ? `${((failed / s.totalCalls) * 100).toFixed(0)}%` : "—";
    return [
      { label: "Aufrufe gesamt", value: String(s.totalCalls) },
      { label: "Erfolgreich", value: String(s.successCalls) },
      { label: "Fehlgeschlagen", value: String(failed) },
      { label: "Fehlerquote", value: quote },
      { label: "Rate-Limits", value: String(s.rateLimitCount) },
    ];
  };

  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  const hasCerebras = Boolean(process.env.CEREBRAS_API_KEY);
  const hasCloudflare = Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID && (process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_KEY)
  );
  const hasNvidia = Boolean(process.env.NVIDIA_API_KEY);

  return [
    {
      id: "fly",
      label: "Fly.io",
      status: "green",
      blinker: true,
      tooltip: "Deployment-Plattform",
      href: "/dashboard",
      detail: [
        { label: "Region", value: "fra (Frankfurt)" },
        { label: "Rolle", value: "Hosting & Reverse-Proxy" },
      ],
    },
    {
      id: "sqlite",
      label: "SQLite / JSON-DB",
      status: "green",
      tooltip: "Datenspeicher aktiv",
      detail: [{ label: "Speicherort", value: "/data/db.json (Fly-Volume)" }],
    },
    {
      id: "supabase",
      label: "Supabase",
      status: process.env.SUPABASE_URL ? "green" : "gray",
      tooltip: process.env.SUPABASE_URL ? "Verfügbar" : "Nicht konfiguriert",
      detail: [
        { label: "Status", value: process.env.SUPABASE_URL ? "Verbunden" : "Nicht konfiguriert" },
        { label: "Verwendung", value: "Observability / Agent-Gedächtnis" },
      ],
    },
    {
      id: "groq",
      label: "Groq",
      status: hasGroq ? "green" : "gray",
      tooltip: "Primärkette",
      detail: [{ label: "Rolle", value: "Primäre Fallback-Kette" }, ...providerDetail(hasGroq, "groq")],
    },
    {
      id: "cerebras",
      label: "Cerebras",
      status: hasCerebras ? "green" : "gray",
      tooltip: "Fallback",
      detail: [{ label: "Rolle", value: "Fallback-Stufe" }, ...providerDetail(hasCerebras, "cerebras")],
    },
    {
      id: "cloudflare",
      label: "Cloudflare",
      status: hasCloudflare ? "green" : "gray",
      tooltip: "Workers AI Fallback",
      detail: [{ label: "Rolle", value: "Workers-AI-Fallback" }, ...providerDetail(hasCloudflare, "cloudflare")],
    },
    {
      id: "nvidia",
      label: "NVIDIA",
      status: hasNvidia ? "green" : "gray",
      tooltip: "Fallback",
      detail: [{ label: "Rolle", value: "Fallback-Stufe" }, ...providerDetail(hasNvidia, "nvidia")],
    },
    {
      id: "github",
      label: "GitHub",
      status: "green",
      tooltip: "Repo: mazztah/bkabr",
      detail: [{ label: "Repository", value: "github.com/mazztah/bkabr" }],
    },
    {
      id: "scheduler",
      label: "Scheduler",
      status: "green",
      tooltip: "30s-Ticker aktiv",
      detail: [
        { label: "Intervall", value: "30 Sekunden" },
        { label: "Aufgabe", value: "Prüft fällige Agent-Kalendereinträge" },
      ],
    },
    {
      id: "agent",
      label: "KI-Agent",
      status: "green",
      tooltip: "Super Spielekind-Agent",
      detail: [
        { label: "Protokollierte Aktionen", value: String(input.auditCount ?? 0) },
        {
          label: "Letztes Modell-Update",
          value: input.lastMonthlyUpdateAt ? new Date(input.lastMonthlyUpdateAt).toLocaleString("de-DE") : "noch nie",
        },
      ],
    },
    {
      id: "sse",
      label: "SSE Live-Logs",
      status: "green",
      tooltip: "Server-Sent Events",
      detail: [{ label: "Polling-Intervall", value: "3 Sekunden" }],
    },
    {
      id: "cron",
      label: "Cron / 30-Tage",
      status: "green",
      tooltip: "Monatlicher Modell-Update",
      detail: [
        { label: "Letzter Lauf", value: input.lastMonthlyUpdateAt ? new Date(input.lastMonthlyUpdateAt).toLocaleString("de-DE") : "noch nie" },
      ],
    },
    {
      id: "memory",
      label: "Memory",
      status: process.env.SUPABASE_URL ? "green" : "gray",
      tooltip: "Agent-Gedächtnis",
    },
    {
      id: "api_keys",
      label: "API-Keys",
      status: hasGroq ? "green" : "yellow",
      tooltip: "Basis-Keys gesetzt",
      detail: [
        { label: "Groq", value: hasGroq ? "gesetzt" : "fehlt" },
        { label: "Cerebras", value: hasCerebras ? "gesetzt" : "fehlt" },
        { label: "Cloudflare", value: hasCloudflare ? "gesetzt" : "fehlt" },
        { label: "NVIDIA", value: hasNvidia ? "gesetzt" : "fehlt" },
      ],
    },
    {
      id: "billing",
      label: "Billing",
      status: ly(input.rateLimitCount > 20),
      tooltip: `${input.rateLimitCount} Rate-Limits beobachtet`,
      detail: [
        { label: "Rate-Limits gesamt", value: String(input.rateLimitCount) },
        { label: "Schwelle für Gelb", value: "> 20" },
      ],
    },
    {
      id: "dokumente",
      label: "Dokumente",
      status: input.hasDocuments ? "green" : "gray",
      tooltip: "Dokumenten-Eingang",
      detail: [{ label: "Dokumente in Ablage", value: String(input.documentCount ?? 0) }],
    },
    { id: "ocr_queue", label: "OCR-Queue", status: "green", tooltip: "Tesseract/Vision bereit" },
    { id: "bk_bearbeitung", label: "BK-Abrechnungen", status: "green", tooltip: "Betriebskosten-Modul" },
    { id: "eigentuemerwechsel", label: "Eigentümerwechsel", status: "green", tooltip: "Vollmachten/Wechsel" },
    { id: "mieterwechsel", label: "Mieterwechsel", status: "green", tooltip: "Ein-/Auszüge" },
    { id: "mahnlauf", label: "Mahnlauf", status: "green", tooltip: "Schriftverkehr/Mahnwesen" },
    { id: "export", label: "Export (PDF/Excel)", status: "green", tooltip: "DATEV/PDF/Excel" },
    {
      id: "db_backup",
      label: "DB-Backup",
      status: "green",
      tooltip: "JSON-DB persistiert",
      detail: [{ label: "Persistenz", value: "Fly-Volume, atomarer Write (rename)" }],
    },
    { id: "sync_extern", label: "Externe Sync", status: "green", tooltip: "Schnittstellen" },
  ];
}
