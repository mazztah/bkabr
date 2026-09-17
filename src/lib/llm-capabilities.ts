import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "groq-sdk/resources/chat/completions";

/**
 * ============================================================
 * LLM-FÄHIGKEITSPROFILE — "jedes Modell will es anders"
 * ============================================================
 *
 * Ausgangsproblem (siehe groq-client.ts, STRUCTURED_OUTPUT_UNSAFE_MODELS):
 * Die Fallback-Kette spricht inzwischen SECHS verschiedene Anbieter an, und
 * die dahinterliegenden Modelle haben nachweislich unterschiedliche
 * Anforderungen an ein und dieselbe Anfrage:
 *
 *   • Groq gpt-oss/qwen         → response_format:{type:"json_object"} + echte
 *                                 `tools` funktionieren beide nativ
 *   • groq/compound(-mini)      → KEINE eigenen Tools (400 "not supported")
 *   • Cerebras/Cloudflare GLM   → akzeptiert `tools`, liefert den Aufruf aber
 *     und Gemma                   als rohen Pseudo-XML-Text im content:
 *                                 "<tool_call>name<arg_key>x</arg_key>…"
 *   • NVIDIA NIM (Llama)        → "This model only supports single tool-calls
 *                                 at once!", wenn parallel_tool_calls gesetzt ist
 *   • Mistral                   → `max_tokens` statt `max_completion_tokens`,
 *                                 tool_choice "any" statt "required"
 *   • OpenRouter                → braucht Referer/Title-Header, `:free`-Routen
 *                                 wechseln ständig die Fähigkeiten
 *
 * Bisher wurde das über eine reine Sperrliste gelöst: Modelle, die Tools oder
 * JSON nicht sauber beherrschen, wurden bei strukturierten Aufrufen einfach
 * aus der Kette geworfen. Das funktioniert, verschenkt aber genau die Stufen,
 * die man im Rate-Limit-Notfall am dringendsten braucht.
 *
 * Dieses Modul dreht den Ansatz um: statt Modelle auszuschließen, wird die
 * ANFRAGE pro Modell passend übersetzt (adaptParamsForModel) und die ANTWORT
 * wieder in das einheitliche OpenAI-Format zurückgeführt
 * (normalizeCompletion). Ein Modell ohne nativen JSON-Mode bekommt die
 * JSON-Anforderung als Prompt-Anweisung, ein Modell ohne natives
 * Tool-Calling bekommt ein Text-Protokoll und dessen Antwort wird wieder zu
 * einem echten `tool_calls`-Array geparst. Für den Aufrufer (agent.ts, ai.ts)
 * bleibt alles wie bisher.
 */

// ------------------------------------------------------------
// Profil-Typen
// ------------------------------------------------------------

/**
 * Wie das Modell zu strukturiertem JSON gebracht wird.
 *  - "json_schema"  : response_format mit Schema (strengste Variante)
 *  - "json_object"  : response_format:{type:"json_object"} (Groq-Standard)
 *  - "prompt"       : kein nativer Modus — Anforderung wandert in den Prompt
 */
export type JsonModeSupport = "json_schema" | "json_object" | "prompt";

/**
 * Wie Funktionsaufrufe übergeben werden.
 *  - "native" : echtes `tools`-Feld, Antwort kommt in `tool_calls`
 *  - "pseudo" : Tools werden als Text-Protokoll beschrieben, die Antwort wird
 *               aus dem content zurückgeparst (GLM/Gemma-Fall)
 *  - "none"   : Modell kann gar keine Tools (groq/compound) — nur Freitext
 */
export type ToolSupport = "native" | "pseudo" | "none";

export interface ModelProfile {
  jsonMode: JsonModeSupport;
  tools: ToolSupport;
  /** Feldname für das Output-Budget im Request-Body. */
  maxTokensField: "max_completion_tokens" | "max_tokens";
  /** Darf `parallel_tool_calls` überhaupt mitgeschickt werden? */
  sendParallelToolCalls: boolean;
  /** Wie "erzwinge einen Tool-Aufruf" bei diesem Anbieter heißt. */
  toolChoiceRequiredValue: "required" | "any";
  supportsTemperature: boolean;
  supportsTopP: boolean;
  supportsStop: boolean;
  /** Modell schreibt Reasoning in <think>-Blöcke, die entfernt werden müssen. */
  stripThinkTags: boolean;
  /** Konservatives Token-Budget (Input+Output) für diesen Anbieter. */
  safeTpm: number;
  /** Zusätzliche Body-Felder (z.B. reasoning-Effort abschalten). */
  extraBody?: Record<string, unknown>;
  hinweis?: string;
}

const BASE_PROFILE: ModelProfile = {
  jsonMode: "json_object",
  tools: "native",
  maxTokensField: "max_completion_tokens",
  sendParallelToolCalls: false,
  toolChoiceRequiredValue: "required",
  supportsTemperature: true,
  supportsTopP: true,
  supportsStop: true,
  stripThinkTags: false,
  safeTpm: 7200,
};

/**
 * Provider-Standardprofile. Greifen, wenn für die konkrete Modell-ID kein
 * Eintrag in MODEL_PROFILES steht — wichtig, damit neu über die ENV-Variablen
 * nachgetragene Modelle (GROQ_TEXT_MODELS, MISTRAL_TEXT_MODELS, …) sofort
 * funktionieren, ohne dass hier Code angefasst werden muss.
 */
const PROVIDER_PROFILES: Record<string, Partial<ModelProfile>> = {
  groq: { safeTpm: 7200 },
  cerebras: { safeTpm: 16000, maxTokensField: "max_tokens" },
  cloudflare: { safeTpm: 40000, maxTokensField: "max_tokens" },
  nvidia: {
    safeTpm: 24000,
    maxTokensField: "max_tokens",
    // NVIDIA NIM meldet bei mehreren Modellen hart "This model only supports
    // single tool-calls at once!", sobald parallel_tool_calls gesetzt ist.
    sendParallelToolCalls: false,
  },
  mistral: {
    safeTpm: 24000,
    maxTokensField: "max_tokens",
    // Mistral nennt den Zwang zum Tool-Aufruf "any", nicht "required".
    toolChoiceRequiredValue: "any",
    jsonMode: "json_object",
  },
  openrouter: {
    safeTpm: 32000,
    maxTokensField: "max_tokens",
  },
};

/**
 * Abweichungen auf Modell-Ebene. Nur eintragen, was real beobachtet wurde —
 * geratene Einschränkungen kosten unnötig Fallback-Stufen.
 */
const MODEL_PROFILES: Record<string, Partial<ModelProfile>> = {
  // ---- Groq ----
  // Compound-Systeme routen intern auf eigene Tools und lehnen fremde
  // Tool-Definitionen mit 400 ab. JSON-Mode ist ebenfalls unzuverlässig.
  "groq/compound": { tools: "none", jsonMode: "prompt" },
  "groq/compound-mini": { tools: "none", jsonMode: "prompt" },
  // Reasoning-Modelle mischen dem JSON gern Gedanken bei -> <think> entfernen.
  "qwen/qwen3.6-27b": { stripThinkTags: true },
  "qwen/qwen3.8-27b": { stripThinkTags: true },
  "openai/gpt-oss-120b": { stripThinkTags: true },
  "openai/gpt-oss-20b": { stripThinkTags: true },

  // ---- Cerebras ----
  // Siehe groq-client.ts: Tool-Aufrufe landen als Pseudo-XML im content
  // statt im tool_calls-Feld. Mit "pseudo" wird genau das jetzt nutzbar,
  // statt das Modell komplett aus der Kette zu werfen.
  "gemma-4-31b": { tools: "pseudo", jsonMode: "prompt", stripThinkTags: true },

  // ---- Cloudflare Workers AI ----
  "@cf/zai-org/glm-4.7-flash": { tools: "pseudo", jsonMode: "prompt", stripThinkTags: true },
  "@cf/google/gemma-4-26b-a4b-it": { tools: "pseudo", jsonMode: "prompt" },
  "@cf/moonshotai/kimi-k2.6": { tools: "native", jsonMode: "json_object" },

  // ---- NVIDIA Build / NIM ----
  "meta/llama-3.3-70b-instruct": { tools: "native" },
  "nvidia/llama-3.3-nemotron-super-49b-v1": { tools: "native", stripThinkTags: true },
  "mistralai/mistral-nemotron": { tools: "native", toolChoiceRequiredValue: "any" },
  // Zu klein für große Tool-Kataloge: kündigen den Aufruf nur als Text an.
  // Mit "pseudo" wird diese Textankündigung wenigstens noch geparst.
  "meta/llama-3.1-8b-instruct": { tools: "pseudo" },
  "meta/llama-3.2-3b-instruct": { tools: "pseudo" },

  // ---- Mistral La Plateforme ----
  "magistral-small-latest": { stripThinkTags: true },
  "open-mistral-nemo": { tools: "pseudo" },

  // ---- OpenRouter ----
  // openrouter/free ist ein Router, der selbst nach Fähigkeiten filtert
  // (Tool-Calling, Structured Output) – daher nativ behandeln.
  "openrouter/free": { tools: "native", jsonMode: "json_object" },
};

export function providerOfModel(model: string): string {
  const idx = model.indexOf(":");
  if (idx > 0) {
    const prefix = model.slice(0, idx);
    if (PROVIDER_PROFILES[prefix]) return prefix;
  }
  return "groq";
}

export function stripModelPrefix(model: string): string {
  const provider = providerOfModel(model);
  return model.startsWith(`${provider}:`) ? model.slice(provider.length + 1) : model;
}

/** Vollständiges Profil für ein (ggf. präfigiertes) Modell. */
export function getModelProfile(model: string): ModelProfile {
  const provider = providerOfModel(model);
  const bare = stripModelPrefix(model);
  return {
    ...BASE_PROFILE,
    ...(PROVIDER_PROFILES[provider] || {}),
    ...(MODEL_PROFILES[bare] || {}),
  };
}

// ------------------------------------------------------------
// Anfrage-Anpassung
// ------------------------------------------------------------

type ChatParams = Omit<ChatCompletionCreateParamsNonStreaming, "model"> & { model?: string };

type ToolDef = {
  type?: string;
  function?: { name?: string; description?: string; parameters?: unknown };
};

export interface AdaptedRequest {
  params: ChatParams;
  /** Tools, die als Text-Protokoll übergeben wurden (für die Rück-Übersetzung). */
  pseudoTools: ToolDef[] | null;
  /** true, wenn JSON nur per Prompt (statt response_format) gefordert wurde. */
  jsonViaPrompt: boolean;
  profile: ModelProfile;
}

/**
 * Baut die Anweisung für Modelle ohne natives Tool-Calling. Bewusst ein
 * einzelnes JSON-Objekt als Antwortformat (kein XML): das lässt sich deutlich
 * robuster zurückparsen als die Pseudo-XML-Fragmente, die GLM/Gemma von sich
 * aus produzieren – und diese Modelle beherrschen "antworte nur mit JSON"
 * zuverlässig, auch wenn ihnen der native Tool-Kanal fehlt.
 */
function buildPseudoToolInstruction(tools: ToolDef[]): string {
  const katalog = tools
    .map((t) => {
      const fn = t.function || {};
      const params = fn.parameters ? JSON.stringify(fn.parameters) : "{}";
      return `- ${fn.name}: ${fn.description || ""}\n  Parameter (JSON-Schema): ${params}`;
    })
    .join("\n");

  return (
    "WERKZEUG-PROTOKOLL (dieses Modell hat keinen nativen Funktionsaufruf-Kanal):\n" +
    "Du kannst die folgenden Werkzeuge benutzen:\n" +
    katalog +
    "\n\n" +
    "Willst du ein Werkzeug aufrufen, antworte AUSSCHLIESSLICH mit genau einem " +
    "JSON-Objekt in exakt dieser Form – ohne Markdown-Codefence, ohne Fließtext " +
    "davor oder danach, ohne Erklärung, ohne Ankündigung:\n" +
    '{"tool_call":{"name":"<werkzeugname>","arguments":{ … }}}\n\n' +
    "Wichtig: NICHT ankündigen, dass du gleich etwas tust (\"Ich recherchiere jetzt…\"), " +
    "sondern den Aufruf direkt ausgeben. Nur wenn du KEIN Werkzeug brauchst und die " +
    "endgültige Antwort geben kannst, antworte mit normalem Text statt mit JSON."
  );
}

const JSON_PROMPT_INSTRUCTION =
  "AUSGABEFORMAT: Antworte ausschließlich mit einem einzigen, syntaktisch gültigen " +
  "JSON-Objekt. Kein Markdown, keine Codefences (```), kein Text vor oder nach dem " +
  "JSON, keine Kommentare, keine Erklärungen. Beginne direkt mit { und ende mit }.";

/**
 * Übersetzt einen einheitlichen Request in das, was dieses konkrete Modell
 * tatsächlich verträgt. Alles, was ein Anbieter nicht kennt, wird entfernt
 * statt mitgeschickt – unbekannte Felder führen bei mehreren der hier
 * genutzten OpenAI-kompatiblen APIs zu 400ern statt still ignoriert zu werden.
 */
export function adaptParamsForModel(model: string, params: ChatParams): AdaptedRequest {
  const profile = getModelProfile(model);
  const next: ChatParams = { ...params };
  let pseudoTools: ToolDef[] | null = null;
  let jsonViaPrompt = false;

  const systemZusatz: string[] = [];

  // --- Tools ---
  const tools = (next.tools || []) as ToolDef[];
  if (tools.length) {
    if (profile.tools === "native") {
      if (!profile.sendParallelToolCalls) {
        delete (next as Record<string, unknown>).parallel_tool_calls;
      }
      // tool_choice:"required" heißt bei Mistral "any"
      if (next.tool_choice === "required" && profile.toolChoiceRequiredValue !== "required") {
        (next as Record<string, unknown>).tool_choice = profile.toolChoiceRequiredValue;
      }
    } else {
      // "pseudo" und "none": Tool-Schemas aus dem Body entfernen …
      pseudoTools = profile.tools === "pseudo" ? tools : null;
      if (pseudoTools) systemZusatz.push(buildPseudoToolInstruction(pseudoTools));
      delete (next as Record<string, unknown>).tools;
      delete (next as Record<string, unknown>).tool_choice;
      delete (next as Record<string, unknown>).parallel_tool_calls;
    }
  } else {
    delete (next as Record<string, unknown>).parallel_tool_calls;
  }

  // --- JSON-Mode ---
  if (next.response_format?.type === "json_object" && profile.jsonMode === "prompt") {
    delete (next as Record<string, unknown>).response_format;
    jsonViaPrompt = true;
    systemZusatz.push(JSON_PROMPT_INSTRUCTION);
  }

  // --- Sampling-Parameter, die manche Anbieter nicht kennen ---
  if (!profile.supportsTemperature) delete (next as Record<string, unknown>).temperature;
  if (!profile.supportsTopP) delete (next as Record<string, unknown>).top_p;
  if (!profile.supportsStop) delete (next as Record<string, unknown>).stop;

  // --- Zusatzanweisungen in den System-Prompt hängen ---
  if (systemZusatz.length) {
    const messages = [...(next.messages || [])];
    const sysIdx = messages.findIndex((m) => (m as { role?: string }).role === "system");
    const zusatz = systemZusatz.join("\n\n");
    if (sysIdx >= 0) {
      const sys = messages[sysIdx] as { role: string; content?: unknown };
      const bisher = typeof sys.content === "string" ? sys.content : "";
      messages[sysIdx] = { ...sys, content: `${bisher}\n\n${zusatz}` } as (typeof messages)[number];
    } else {
      messages.unshift({ role: "system", content: zusatz } as (typeof messages)[number]);
    }
    next.messages = messages;
  }

  if (profile.extraBody) Object.assign(next, profile.extraBody);

  return { params: next, pseudoTools, jsonViaPrompt, profile };
}

// ------------------------------------------------------------
// Antwort-Normalisierung
// ------------------------------------------------------------

function stripThink(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/^[\s\S]*?<\/think>/i, (m) => (/<think>/i.test(m) ? "" : m))
    .trim();
}

function zuToolCall(name: string, args: unknown, index: number) {
  return {
    id: `call_norm_${index}_${Math.random().toString(36).slice(2, 8)}`,
    type: "function" as const,
    function: {
      name,
      arguments: typeof args === "string" ? args : JSON.stringify(args ?? {}),
    },
  };
}

/**
 * Holt einen Tool-Aufruf aus reinem Text. Deckt die drei Formen ab, die in
 * dieser Kette real aufgetreten sind:
 *   1. {"tool_call":{"name":…,"arguments":{…}}}  (unser Pseudo-Protokoll)
 *   2. <tool_call>name<arg_key>k</arg_key><arg_value>v</arg_value>…  (GLM/Gemma)
 *   3. <function=name>{…}</function>                                 (Llama)
 * und zusätzlich das nackte {"name":…,"arguments":{…}}, das viele Modelle
 * ausgeben, wenn man ihnen ein Tool-Schema in den Prompt legt.
 */
export function parseToolCallsFromText(
  text: string,
  erlaubteNamen?: Set<string>
): { toolCalls: ReturnType<typeof zuToolCall>[]; restText: string } {
  const toolCalls: ReturnType<typeof zuToolCall>[] = [];
  let rest = text;
  let idx = 0;

  const nameOk = (n: string) => !erlaubteNamen || erlaubteNamen.has(n);

  // Form 3: <function=NAME>{json}</function>
  rest = rest.replace(/<function=([\w.-]+)>\s*([\s\S]*?)\s*<\/function>/gi, (_m, name: string, body: string) => {
    if (!nameOk(name)) return _m;
    let args: unknown = {};
    try {
      args = JSON.parse(body);
    } catch {
      args = {};
    }
    toolCalls.push(zuToolCall(name, args, idx++));
    return "";
  });

  // Form 2: <tool_call>NAME<arg_key>k</arg_key><arg_value>v</arg_value>…
  rest = rest.replace(/<tool_call>\s*([\w.-]+)([\s\S]*?)(?:<\/tool_call>|$)/gi, (_m, name: string, body: string) => {
    if (!nameOk(name)) return _m;
    const args: Record<string, unknown> = {};
    const paar = /<arg_key>\s*([\s\S]*?)\s*<\/arg_key>\s*<arg_value>\s*([\s\S]*?)\s*(?:<\/arg_value>|$)/gi;
    let m: RegExpExecArray | null;
    while ((m = paar.exec(body))) {
      const key = m[1].trim();
      const rohWert = m[2];
      let wert: unknown = rohWert;
      const trimmed = rohWert.trim();
      if (/^-?\d+(\.\d+)?$/.test(trimmed)) wert = Number(trimmed);
      else if (trimmed === "true" || trimmed === "false") wert = trimmed === "true";
      else if (/^[[{]/.test(trimmed)) {
        try {
          wert = JSON.parse(trimmed);
        } catch {
          wert = trimmed;
        }
      } else wert = trimmed;
      if (key) args[key] = wert;
    }
    toolCalls.push(zuToolCall(name, args, idx++));
    return "";
  });

  // Form 1 / nacktes JSON: erstes vollständiges Objekt suchen
  if (!toolCalls.length) {
    const kandidat = rest.replace(/```(?:json)?\s*([\s\S]*?)```/i, "$1").trim();
    const start = kandidat.indexOf("{");
    if (start >= 0) {
      const ausschnitt = extrahiereObjekt(kandidat.slice(start));
      if (ausschnitt) {
        try {
          const obj = JSON.parse(ausschnitt) as Record<string, unknown>;
          const tc = (obj.tool_call || obj.function_call || obj) as Record<string, unknown>;
          const name = typeof tc?.name === "string" ? tc.name : undefined;
          if (name && nameOk(name)) {
            const args = tc.arguments ?? tc.parameters ?? tc.args ?? {};
            toolCalls.push(zuToolCall(name, args, idx++));
            rest = (kandidat.slice(0, start) + kandidat.slice(start + ausschnitt.length)).trim();
          }
        } catch {
          // kein verwertbares JSON – Text unverändert lassen
        }
      }
    }
  }

  return { toolCalls, restText: rest.trim() };
}

/** Schneidet ab Position 0 ein balanciertes {…}/[…] heraus (String-sicher). */
function extrahiereObjekt(s: string): string | null {
  if (!s) return null;
  const open = s[0];
  if (open !== "{" && open !== "[") return null;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return s.slice(0, i + 1);
    }
  }
  return null;
}

/**
 * Führt die Antwort eines beliebigen Anbieters in das einheitliche
 * OpenAI-Format zurück: <think>-Blöcke raus, Pseudo-Tool-Aufrufe in ein
 * echtes `tool_calls`-Array, Markdown-Fences um JSON entfernen.
 *
 * Damit sieht agent.ts/ai.ts bei JEDEM Modell dieselbe Struktur — genau das
 * war bisher der Grund, warum GLM/Gemma-Stufen als "erfolgreich" galten,
 * obwohl der Agent-Loop ihre Tool-Absicht nie erkannt hat.
 */
export function normalizeCompletion(
  model: string,
  completion: ChatCompletion,
  ctx: { pseudoTools?: ToolDef[] | null; jsonViaPrompt?: boolean } = {}
): ChatCompletion {
  const profile = getModelProfile(model);
  const choice = completion.choices?.[0] as
    | { message?: { content?: string | null; tool_calls?: unknown[] }; finish_reason?: string }
    | undefined;
  if (!choice?.message) return completion;

  let content = String(choice.message.content ?? "");
  const hatNativeToolCalls = Array.isArray(choice.message.tool_calls) && choice.message.tool_calls.length > 0;

  if (profile.stripThinkTags && content) content = stripThink(content);

  let toolCalls = choice.message.tool_calls;

  // Pseudo-Tool-Aufrufe zurückübersetzen — auch dann, wenn gar keine
  // pseudoTools gesetzt waren: Cerebras/Cloudflare-Modelle produzieren die
  // Pseudo-XML-Form auch bei nativ übergebenen Tools (dokumentierter Bug).
  if (!hatNativeToolCalls && content) {
    const erlaubt = ctx.pseudoTools?.length
      ? new Set(ctx.pseudoTools.map((t) => t.function?.name).filter(Boolean) as string[])
      : undefined;
    const sieht = /<tool_call>|<function=|"tool_call"\s*:|"function_call"\s*:/i.test(content);
    if (sieht || ctx.pseudoTools?.length) {
      const { toolCalls: geparst, restText } = parseToolCallsFromText(content, erlaubt);
      if (geparst.length) {
        toolCalls = geparst;
        content = restText;
        console.info(
          `[llm] ${model}: ${geparst.length} Pseudo-Tool-Aufruf(e) aus dem Antworttext rekonstruiert (${geparst
            .map((t) => t.function.name)
            .join(", ")}).`
        );
      }
    }
  }

  // Bei prompt-basiertem JSON die Codefence entfernen, damit der Aufrufer
  // dieselbe rohe JSON-Antwort sieht wie bei nativem json_object-Mode.
  if (ctx.jsonViaPrompt && content) {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) content = fenced[1].trim();
  }

  return {
    ...completion,
    choices: [
      {
        ...(choice as unknown as Record<string, unknown>),
        message: {
          ...(choice.message as unknown as Record<string, unknown>),
          content: content || null,
          ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
        },
      },
      ...(completion.choices?.slice(1) ?? []),
    ],
  } as unknown as ChatCompletion;
}

// ------------------------------------------------------------
// Ergebnis-Bewertung (vollständig / Teilergebnis / leer)
// ------------------------------------------------------------

/**
 * Was der Aufrufer von dieser Antwort erwartet. Wird von createChatCompletion
 * genutzt, um zu entscheiden, ob die Kette weiterlaufen muss.
 */
export interface ResultExpectation {
  /** Antwort muss gültiges JSON sein. */
  json?: boolean;
  /** Diese Schlüssel müssen im JSON-Objekt vorhanden (und nicht leer) sein. */
  requiredKeys?: string[];
  /** Diese Schlüssel müssen nicht-leere Arrays sein. */
  nonEmptyArrays?: string[];
  /** Mindestlänge des Freitexts. */
  minLength?: number;
  /** Es muss ein Tool-Aufruf zurückkommen. */
  toolCall?: boolean;
}

export type ErgebnisStufe = "vollstaendig" | "teilweise" | "leer";

export interface Bewertung {
  stufe: ErgebnisStufe;
  /** 0..1 – für die Auswahl des besten Teilergebnisses der gesamten Kette. */
  score: number;
  grund?: string;
}

function parseJsonLocker(text: string): unknown | null {
  if (!text) return null;
  let kandidat = text.trim();
  const fenced = kandidat.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) kandidat = fenced[1].trim();
  const start = Math.min(
    ...[kandidat.indexOf("{"), kandidat.indexOf("[")].filter((i) => i >= 0).concat([Number.MAX_SAFE_INTEGER])
  );
  if (start === Number.MAX_SAFE_INTEGER) return null;
  const objekt = extrahiereObjekt(kandidat.slice(start));
  if (!objekt) return null;
  try {
    return JSON.parse(objekt);
  } catch {
    return null;
  }
}

/**
 * Bewertet, ob diese Antwort das ist, was der Aufrufer braucht.
 *
 * Kernstück des "Teilergebnis"-Verhaltens: Eine Antwort, die zwar ankommt,
 * aber z.B. nur 3 von 20 geforderten Strategiepunkten enthält oder deren JSON
 * mitten im Array abbricht, wird als "teilweise" eingestuft. Die Kette läuft
 * dann weiter zum nächsten Modell, behält das Teilergebnis aber als Reserve —
 * falls kein späteres Modell etwas Besseres liefert, wird das beste
 * Teilergebnis zurückgegeben statt eines Fehlers.
 */
export function bewerteErgebnis(completion: ChatCompletion, expect?: ResultExpectation): Bewertung {
  const choice = completion.choices?.[0] as
    | { message?: { content?: string | null; tool_calls?: unknown[] }; finish_reason?: string }
    | undefined;
  const text = String(choice?.message?.content ?? "").trim();
  const toolCalls = (choice?.message?.tool_calls || []) as { function?: { arguments?: string } }[];
  const abgeschnitten = choice?.finish_reason === "length";

  if (expect?.toolCall) {
    if (!toolCalls.length) {
      return { stufe: text ? "teilweise" : "leer", score: text ? 0.2 : 0, grund: "kein Tool-Aufruf geliefert" };
    }
    // Argumente müssen parsebar sein – abgeschnittene Tool-JSONs waren in den
    // Logs ein häufiger Grund für "Failed to parse tool call arguments".
    for (const tc of toolCalls) {
      const args = tc.function?.arguments ?? "{}";
      try {
        JSON.parse(args);
      } catch {
        return { stufe: "teilweise", score: 0.4, grund: "Tool-Argumente sind unvollständiges JSON" };
      }
    }
    return { stufe: "vollstaendig", score: 1 };
  }

  if (toolCalls.length) return { stufe: "vollstaendig", score: 1 };

  if (!text) return { stufe: "leer", score: 0, grund: "leere Antwort (HTTP ok, aber kein Inhalt)" };

  if (expect?.json) {
    const daten = parseJsonLocker(text);
    if (daten === null) {
      return {
        stufe: abgeschnitten ? "teilweise" : "teilweise",
        score: Math.min(0.35, text.length / 8000),
        grund: abgeschnitten ? "JSON mitten in der Antwort abgeschnitten" : "keine gültige JSON-Struktur",
      };
    }
    const obj = (daten || {}) as Record<string, unknown>;
    const fehlend: string[] = [];
    for (const key of expect.requiredKeys || []) {
      const v = obj[key];
      if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) fehlend.push(key);
    }
    for (const key of expect.nonEmptyArrays || []) {
      const v = obj[key];
      if (!Array.isArray(v) || v.length === 0) fehlend.push(key);
    }
    if (fehlend.length) {
      const erwartet = (expect.requiredKeys?.length || 0) + (expect.nonEmptyArrays?.length || 0);
      const score = erwartet ? Math.max(0.1, (erwartet - fehlend.length) / erwartet) * 0.9 : 0.5;
      return { stufe: "teilweise", score, grund: `Felder fehlen oder sind leer: ${fehlend.join(", ")}` };
    }
    return { stufe: abgeschnitten ? "teilweise" : "vollstaendig", score: abgeschnitten ? 0.8 : 1 };
  }

  const min = expect?.minLength ?? 0;
  if (min && text.length < min) {
    return { stufe: "teilweise", score: Math.max(0.1, text.length / min) * 0.8, grund: `Antwort zu kurz (${text.length}/${min} Zeichen)` };
  }
  if (abgeschnitten) return { stufe: "teilweise", score: 0.85, grund: "Antwort abgeschnitten (finish_reason=length)" };

  return { stufe: "vollstaendig", score: 1 };
}
