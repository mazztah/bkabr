/**
 * Nachrichten-Hygiene für die LLM-Fallback-Kette.
 *
 * PROBLEM, das dieses Modul löst
 * ------------------------------
 * Der Agent-Loop baut EINE Nachrichtenliste (system → history → user →
 * assistant{tool_calls} → tool → …) und schickt sie in jedem Schritt an die
 * Kette. Welches Modell antwortet, ist nicht vorhersagbar: Schritt 1 kann
 * gpt-oss-120b beantworten, Schritt 2 (Rate-Limit) Kimi, Schritt 3 ein
 * Gemma-Modell im Text-Protokoll. Jedes dieser Modelle hat andere Regeln für
 * dieselbe Liste. Ohne Angleichung entstehen genau die "Übergangs"-Fehler:
 *
 *  1. applyTokenBudget() kürzte bisher einzelne Nachrichten von vorn. Dabei
 *     entstanden verwaiste `tool`-Nachrichten (ohne zugehörigen assistant-
 *     tool_call) oder tool_calls ohne Ergebnis → 400 bei JEDEM Modell.
 *  2. Modelle im Pseudo-/Kein-Tool-Modus (Gemma, GLM, Llama-3B, Compound)
 *     bekommen kein `tools`-Feld, sehen aber im Verlauf `tool_calls` und
 *     `role: "tool"` → 400 oder Ignorieren des Ergebnisses.
 *  3. Mistral verlangt tool_call_id aus genau 9 Zeichen [a-zA-Z0-9]; die von
 *     anderen Anbietern erzeugten IDs ("call_norm_0_x8f2ab", "call_9f3…")
 *     werden mit 400 abgelehnt.
 *  4. Gemma-/Mistral-/Nemotron-Chat-Templates verlangen strikt abwechselnde
 *     Rollen, eine Nutzer-Nachricht am Anfang und user/tool am Ende; mehrere
 *     system-Nachrichten (Systemprompt + Seitenkontext) werden abgelehnt.
 *  5. Leere assistant-Nachrichten und Tool-Argumente mit abgeschnittenem JSON
 *     (Ergebnis früherer Modellfehler) machen ganze Sessions unbrauchbar.
 *
 * Alle Funktionen sind rein (keine Seiteneffekte) und idempotent.
 */

import { getModelProfile, providerOfModel } from "./llm-capabilities";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type LooseMessage = {
  role?: string;
  content?: any;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
  [key: string]: any;
};

const KNOWN_ROLES = new Set(["system", "user", "assistant", "tool"]);

/** Fortsetzungs-Hinweis, wenn ein Anbieter user/tool als letzte Rolle verlangt. */
const CONTINUE_PROMPT = "Bitte fahre fort.";

function textOfContent(content: any): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "string" ? p : typeof p?.text === "string" ? p.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function hasImages(content: any): boolean {
  return Array.isArray(content) && content.some((p) => p?.type === "image_url" || p?.type === "image");
}

/** Deterministische 9-Zeichen-ID [a-z0-9] (Mistral-Anforderung) aus beliebiger ID. */
export function toMistralToolId(id: string): string {
  if (/^[a-zA-Z0-9]{9}$/.test(id)) return id;
  // FNV-1a, zweimal mit unterschiedlichem Seed → genug Bits für 9 Base36-Zeichen
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  };
  const s = (fnv(2166136261).toString(36) + fnv(0x9e3779b1).toString(36)).replace(/[^a-z0-9]/g, "");
  return (s + "000000000").slice(0, 9);
}

function ensureJsonString(args: any): string {
  if (args == null || args === "") return "{}";
  if (typeof args !== "string") {
    try {
      return JSON.stringify(args);
    } catch {
      return "{}";
    }
  }
  try {
    JSON.parse(args);
    return args;
  } catch {
    // Abgeschnittenes/kaputtes JSON aus einem früheren Modellfehler: als
    // gültiges Objekt schicken, sonst lehnt der nächste Anbieter die GANZE
    // Session mit 400 ab.
    return "{}";
  }
}

let idCounter = 0;
function freshToolId(): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `call_h${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/**
 * Schritt 1–3: Grundnormalisierung + Tool-Paar-Integrität.
 * Jede assistant-Nachricht mit tool_calls wird von GENAU den passenden
 * tool-Nachrichten in der Reihenfolge der Aufrufe gefolgt. Fehlende Ergebnisse
 * werden synthetisch ergänzt (statt die Session zu verwerfen), verwaiste
 * tool-Nachrichten entfernt.
 */
function normalizeAndPair(input: LooseMessage[]): LooseMessage[] {
  const cleaned: LooseMessage[] = [];
  for (const raw of input || []) {
    if (!raw || typeof raw !== "object") continue;
    let role = String((raw as any).role || "");
    if (role === "developer") role = "system";
    if (!KNOWN_ROLES.has(role)) continue;
    const m: LooseMessage = { ...raw, role };

    if (role === "assistant") {
      const calls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
      const okCalls = calls
        .filter((c) => c && typeof c === "object" && typeof c.function?.name === "string" && c.function.name)
        .map((c) => ({
          ...c,
          id: typeof c.id === "string" && c.id ? c.id : freshToolId(),
          type: "function",
          function: { ...c.function, arguments: ensureJsonString(c.function.arguments) },
        }));
      if (okCalls.length) {
        m.tool_calls = okCalls;
        m.content = typeof m.content === "string" ? m.content : m.content == null ? null : textOfContent(m.content);
      } else {
        delete m.tool_calls;
        m.content = typeof m.content === "string" ? m.content : textOfContent(m.content);
      }
    } else if (role === "tool") {
      if (typeof m.tool_call_id !== "string" || !m.tool_call_id) continue; // ohne Bezug wertlos
      m.content = typeof m.content === "string" ? m.content : textOfContent(m.content) || "{}";
    } else {
      // system / user: content darf nie null/undefined sein
      if (m.content == null) m.content = "";
    }
    cleaned.push(m);
  }

  const paired: LooseMessage[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const m = cleaned[i];
    if (m.role === "tool") continue; // wird unten an seinem assistant eingesammelt; sonst verwaist

    paired.push(m);
    if (m.role === "assistant" && m.tool_calls?.length) {
      // direkt folgende tool-Nachrichten einsammeln
      const results = new Map<string, LooseMessage>();
      let j = i + 1;
      while (j < cleaned.length && cleaned[j].role === "tool") {
        const t = cleaned[j];
        if (!results.has(t.tool_call_id as string)) results.set(t.tool_call_id as string, t);
        j++;
      }
      for (const call of m.tool_calls) {
        const found = results.get(call.id);
        paired.push(
          found
            ? { ...found, name: found.name || call.function.name }
            : {
                role: "tool",
                tool_call_id: call.id,
                name: call.function.name,
                content: JSON.stringify({ error: "Kein Ergebnis vorhanden (Aufruf wurde unterbrochen)." }),
              }
        );
      }
      i = j - 1; // eingesammelte tool-Nachrichten überspringen
    }
  }
  return paired;
}

/**
 * Für Modelle OHNE nativen Tool-Kanal (oder Requests ohne `tools`): den
 * Tool-Verlauf in normalen Text übersetzen — im selben Format wie das
 * Pseudo-Protokoll aus llm-capabilities.ts, damit das Modell die Regel
 * "so rufst du Werkzeuge auf" an seinem eigenen Verlauf wiedererkennt.
 */
function flattenToolHistory(messages: LooseMessage[]): LooseMessage[] {
  const out: LooseMessage[] = [];
  for (const m of messages) {
    if (m.role === "assistant" && m.tool_calls?.length) {
      const zeilen = m.tool_calls.map(
        (c: any) =>
          JSON.stringify({ tool_call: { name: c.function.name, arguments: safeParse(c.function.arguments) } })
      );
      const text = [typeof m.content === "string" ? m.content : "", ...zeilen].filter(Boolean).join("\n");
      out.push({ role: "assistant", content: text });
    } else if (m.role === "tool") {
      out.push({
        role: "user",
        content: `Ergebnis des Werkzeugs "${m.name || "unbekannt"}":\n${typeof m.content === "string" ? m.content : ""}`,
      });
    } else {
      out.push(m);
    }
  }
  return out;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function mergeText(a: any, b: any): string {
  return [textOfContent(a), textOfContent(b)].filter((x) => x !== "").join("\n\n");
}

/**
 * Bringt eine Nachrichtenliste in eine Form, die das ZIELMODELL akzeptiert.
 * `hasTools`: enthält der Request selbst ein `tools`-Feld?
 */
export function sanitizeMessagesForModel(
  model: string,
  messages: LooseMessage[],
  opts: { hasTools: boolean }
): LooseMessage[] {
  const provider = providerOfModel(model);
  const profile = getModelProfile(model);
  const external = provider !== "groq";

  let msgs = normalizeAndPair(messages);

  // Modelle ohne nativen Tool-Kanal (pseudo/none) bzw. Requests ohne tools:
  // Tool-Verlauf als Text.
  const hasToolHistory = msgs.some((m) => m.role === "tool" || m.tool_calls?.length);
  if (hasToolHistory && (profile.tools !== "native" || !opts.hasTools)) {
    msgs = flattenToolHistory(msgs);
  }

  // Mehrere system-Nachrichten → eine (Systemprompt + Seitenkontext etc.).
  const systemTexts = msgs.filter((m) => m.role === "system").map((m) => textOfContent(m.content));
  const rest = msgs.filter((m) => m.role !== "system");
  const merged: LooseMessage[] = [];
  if (systemTexts.length) merged.push({ role: "system", content: systemTexts.filter(Boolean).join("\n\n") });

  // Leere assistant-Nachrichten ohne tool_calls entfernen; bei externen
  // Anbietern gleiche Rollen in Folge zusammenführen (nur reine Text-Inhalte).
  for (const m of rest) {
    if (m.role === "assistant" && !m.tool_calls?.length && textOfContent(m.content).trim() === "") continue;
    const prev = merged[merged.length - 1];
    if (
      external &&
      prev &&
      prev.role === m.role &&
      (m.role === "user" || (m.role === "assistant" && !m.tool_calls?.length && !prev.tool_calls?.length)) &&
      !hasImages(prev.content) &&
      !hasImages(m.content)
    ) {
      merged[merged.length - 1] = { ...prev, content: mergeText(prev.content, m.content) };
      continue;
    }
    merged.push(m);
  }
  msgs = merged;

  if (external) {
    // Erste Nicht-System-Nachricht muss user sein (Gemma/Mistral-Templates).
    const firstIdx = msgs.findIndex((m) => m.role !== "system");
    if (firstIdx >= 0 && msgs[firstIdx].role !== "user") {
      const nextUser = msgs.findIndex((m, i) => i > firstIdx && m.role === "user");
      if (nextUser >= 0) {
        msgs = [...msgs.slice(0, firstIdx), ...msgs.slice(nextUser)];
      } else {
        msgs.splice(firstIdx, 0, { role: "user", content: CONTINUE_PROMPT });
      }
    }
    // Letzte Nachricht muss user oder tool sein.
    const last = msgs[msgs.length - 1];
    if (last && last.role === "assistant" && !last.tool_calls?.length) {
      msgs.push({ role: "user", content: CONTINUE_PROMPT });
    }
  }

  // Mistral: tool_call_id exakt 9 alphanumerische Zeichen.
  if (provider === "mistral") {
    msgs = msgs.map((m) => {
      if (m.role === "assistant" && m.tool_calls?.length) {
        return { ...m, tool_calls: m.tool_calls.map((c: any) => ({ ...c, id: toMistralToolId(c.id) })) };
      }
      if (m.role === "tool" && m.tool_call_id) return { ...m, tool_call_id: toMistralToolId(m.tool_call_id) };
      return m;
    });
  }

  return msgs;
}

/**
 * Entfernt beim Kürzen die ÄLTESTE Einheit — nie einzelne Nachrichten mitten
 * aus einem tool_call/tool-Paar. Die letzte user-Nachricht (= der Auftrag)
 * bleibt immer erhalten. Gibt die unveränderte Liste zurück, wenn nichts mehr
 * entfernt werden darf.
 */
export function dropOldestUnit(kept: LooseMessage[]): LooseMessage[] {
  let lastUser = -1;
  for (let i = kept.length - 1; i >= 0; i--) {
    if (kept[i].role === "user") {
      lastUser = i;
      break;
    }
  }
  if (kept.length <= 1 || lastUser <= 0) return kept; // nichts vor dem Auftrag
  const next = kept.slice(1);
  // tool-Nachrichten, deren assistant gerade entfernt wurde, mit entfernen
  while (next.length > 1 && next[0].role === "tool") next.shift();
  return next;
}

/** Kürzt Inhalte von tool-Nachrichten (außer der letzten Nachricht) auf maxChars. */
export function shrinkToolResults(messages: LooseMessage[], maxChars: number): LooseMessage[] {
  return messages.map((m, i) => {
    if (m.role !== "tool" || i === messages.length - 1) return m;
    if (typeof m.content !== "string" || m.content.length <= maxChars) return m;
    return { ...m, content: compactToolContent(m.content, maxChars) };
  });
}

/**
 * Verkleinert ein Tool-Ergebnis (JSON-String) auf ungefähr maxChars und gibt
 * dabei weiterhin GÜLTIGES JSON zurück — mit Hinweis, dass gekürzt wurde, damit
 * das Modell nicht auf vermeintlich vollständigen Daten weiterarbeitet.
 */
export function compactToolContent(json: string, maxChars = 8000): string {
  if (typeof json !== "string" || json.length <= maxChars) return json;
  const kopf = Math.floor(maxChars * 0.8);
  const ende = Math.floor(maxChars * 0.1);
  return JSON.stringify({
    gekuerzt: true,
    hinweis: `Ergebnis war ${json.length} Zeichen lang und wurde für das Token-Budget gekürzt. Bei Bedarf gezielter nachfragen (Filter/Limit).`,
    anfang: json.slice(0, kopf),
    ende: json.slice(-ende),
  });
}
