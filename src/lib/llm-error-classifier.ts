/**
 * Fehlerklassifikation + Circuit-Breaker für die LLM-Fallback-Kette.
 *
 * Bisher wurde fast jeder Fehler gleich behandelt ("nächstes Modell") und nur
 * 402/403/413/429 lösten einen Cooldown aus. Folgen, die in den Statistiken
 * sichtbar sind:
 *
 *  - Modelle mit dauerhaften Fehlern (Kimi 0/61, Llama-3B 0/34, Nemotron 0/5 …)
 *    ohne 402/429 wurden bei JEDER Anfrage erneut probiert.
 *  - Ein 413 ("Request too large") sperrte das Modell 2 Minuten für ALLE
 *    Anfragen — obwohl nur DIESE eine Anfrage zu groß war. Das beste Modell
 *    (gpt-oss-120b) fiel dadurch nach einer einzigen großen Anfrage für
 *    kleine Anfragen aus.
 *  - "nicht unterstützt" sperrte ein Modell 12 h für JEDEN Modus, obwohl es
 *    meist nur bei Tools/JSON versagt, im Freitext aber funktioniert.
 *
 * Neu: (1) jede Fehlermeldung bekommt eine Klasse, (2) Breaker sind pro
 * MODUS (strukturiert = Tools/JSON, vs. Freitext) statt pro Modell, (3) 413
 * sperrt nur Anfragen ab der beobachteten Größe, (4) Fehlerserien lösen einen
 * exponentiell wachsenden Cooldown mit Half-Open-Versuch aus.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type LlmErrorClass =
  | "rate_limit_minute" // TPM/RPM – wenige Sekunden warten
  | "rate_limit_day" // TPD/RPD – Stunden
  | "quota_exhausted" // 402 – Free-Tier/Guthaben
  | "auth" // 401/403 – Key/Plan
  | "too_large" // 413 – Anfrage zu groß für DIESES Limit
  | "model_unavailable" // 404 / abgekündigt
  | "unsupported_feature" // 400 "not supported" (Tools/JSON/Parameter)
  | "malformed_output" // json_validate_failed, tool_use_failed
  | "bad_request" // sonstiges 400 (meist Nachrichtenstruktur)
  | "timeout" // 408/504/Abbruch/Netzwerk
  | "server_error" // 5xx
  | "empty_or_partial" // Antwort ohne verwertbaren Inhalt
  | "unknown";

export interface ClassifiedError {
  klasse: LlmErrorClass;
  status: number;
  message: string;
  /** Vom Provider genannte Wartezeit in Sekunden (0 = keine Angabe). */
  retryAfterSec: number;
  /** Bei too_large: angeforderte Token laut Fehlermeldung (0 = unbekannt). */
  requested: number;
  limit: number;
}

function parseWaitSeconds(msg: string): number {
  const m = msg.match(/try again in\s+([\dhms.]+)/i);
  if (!m) return 0;
  const w = m[1];
  const h = Number(w.match(/(\d+(?:\.\d+)?)h/)?.[1] ?? 0);
  const min = Number(w.match(/(\d+(?:\.\d+)?)m(?!s)/)?.[1] ?? 0);
  const s = Number(w.match(/(\d+(?:\.\d+)?)s/)?.[1] ?? 0);
  return Math.ceil(h * 3600 + min * 60 + s);
}

export function classifyLlmError(err: any): ClassifiedError {
  const status = Number(err?.status ?? err?.statusCode ?? err?.response?.status) || 0;
  const message = String(err?.message || err || "");
  const low = message.toLowerCase();
  const code = String(err?.error?.code || err?.code || "").toLowerCase();
  const base = {
    status,
    message,
    retryAfterSec: parseWaitSeconds(message),
    requested: Number(message.match(/Requested\s+(\d+)/)?.[1] ?? 0),
    limit: Number(message.match(/Limit\s+(\d+)/)?.[1] ?? 0),
  };

  if (status === 402) return { ...base, klasse: "quota_exhausted" };
  if (status === 401 || status === 403) return { ...base, klasse: "auth" };
  if (status === 413 || /request too large|reduce your message size|request entity too large/.test(low))
    return { ...base, klasse: "too_large" };
  if (status === 429 || code.includes("rate_limit") || /rate.?limit|tokens per (minute|day)|requests per (minute|day)/.test(low)) {
    // "Limit 8000, Requested 9500": die Anfrage allein übersteigt das Limit —
    // Warten hilft nicht, nur eine kleinere Anfrage bzw. ein anderes Modell.
    if (base.limit > 0 && base.requested > base.limit) return { ...base, klasse: "too_large" };
    const tag = /tokens per day|requests per day|\btpd\b|\brpd\b|daily/.test(low) ? "rate_limit_day" : "rate_limit_minute";
    return { ...base, klasse: tag };
  }
  if (status === 404 || /model.*(not found|does not exist|deprecat|decommission|no longer)/.test(low))
    return { ...base, klasse: "model_unavailable" };
  if (code.includes("json_validate_failed") || /failed to validate json|tool_use_failed|failed to (call|parse) (a )?(function|tool)|tool call.*(invalid|failed)/.test(low))
    return { ...base, klasse: "malformed_output" };
  if (status === 400 && /not supported|nicht unterstützt|does not support|unsupported/.test(low))
    return { ...base, klasse: "unsupported_feature" };
  if (status === 400 || status === 422) return { ...base, klasse: "bad_request" };
  if (status === 408 || status === 504 || /timeout|timed out|aborted|etimedout|econnreset|fetch failed|socket hang up/.test(low))
    return { ...base, klasse: "timeout" };
  if (status >= 500) return { ...base, klasse: "server_error" };
  return { ...base, klasse: "unknown" };
}

// ------------------------------------------------------------
// Breaker-Zustand (globalThis, wie cooldowns in groq-client.ts)
// ------------------------------------------------------------

interface ModeBreaker {
  streak: number;
  until: number;
}
interface SizeBlock {
  /** Anfragen ab dieser (geschätzten) Größe werden übersprungen. */
  tokens: number;
  until: number;
}

const KEY = "__bkabr_llmBreakers__";
type Store = { mode: Map<string, ModeBreaker>; size: Map<string, SizeBlock> };
const g = globalThis as unknown as Record<string, Store | undefined>;
if (!g[KEY]) g[KEY] = { mode: new Map(), size: new Map() };
const store = g[KEY]!;

const modeKey = (model: string, structured: boolean) => `${model}|${structured ? "s" : "p"}`;

/** true = dieses Modell ist für diesen Modus gerade gesperrt. */
export function isModeBreakerOpen(model: string, structured: boolean): boolean {
  const b = store.mode.get(modeKey(model, structured));
  return Boolean(b && b.until > Date.now());
}

export function noteModeSuccess(model: string, structured: boolean): void {
  store.mode.delete(modeKey(model, structured));
}

/** true = Anfrage ist größer als eine kürzlich für dieses Modell abgelehnte Größe. */
export function isSizeBlocked(model: string, estimatedTokens: number): boolean {
  const b = store.size.get(model);
  if (!b) return false;
  if (b.until <= Date.now()) {
    store.size.delete(model);
    return false;
  }
  return estimatedTokens >= b.tokens;
}

/**
 * Fehler registrieren und ggf. Breaker setzen. Gibt die verhängte Sperre in
 * Sekunden zurück (0 = keine) und ob sie modell-weit oder nur modusbezogen ist.
 * Rate-Limit/Quota/Auth-Sperren (modellweit) setzt weiterhin groq-client.ts
 * selbst über setModelCooldown — hier nur, was neu ist.
 */
export function registerFailure(
  model: string,
  structured: boolean,
  c: ClassifiedError,
  requestTokens: number
): { sekunden: number; scope: "modus" | "groesse" | "keine" } {
  const now = Date.now();

  if (c.klasse === "too_large") {
    // Nur Anfragen ab (ca.) dieser Größe blockieren; kleinere dürfen weiter.
    const grenze = Math.max(1000, Math.floor(Math.min(requestTokens || Infinity, c.requested || Infinity) * 0.9));
    const cur = store.size.get(model);
    store.size.set(model, {
      tokens: cur && cur.until > now ? Math.min(cur.tokens, grenze) : grenze,
      until: now + 10 * 60_000,
    });
    return { sekunden: 600, scope: "groesse" };
  }

  // Modus-Breaker
  const key = modeKey(model, structured);
  const cur = store.mode.get(key) || { streak: 0, until: 0 };
  const streak = cur.streak + 1;
  let sek = 0;

  switch (c.klasse) {
    case "model_unavailable":
      sek = 3 * 3600;
      break;
    case "unsupported_feature":
      sek = 12 * 3600; // nur für diesen Modus (structured/plain)
      break;
    case "timeout":
    case "server_error":
      if (streak >= 2) sek = Math.min(10 * 60, 30 * 2 ** (streak - 2));
      break;
    case "malformed_output":
    case "unknown":
    case "empty_or_partial":
      if (streak >= 4) sek = Math.min(20 * 60, 60 * 2 ** (streak - 4));
      break;
    default:
      // bad_request: anfragespezifisch → zählt nicht (sonst vergiftet EINE
      // kaputte Anfrage die Kette für alle anderen). rate_limit/quota/auth: siehe groq-client.
      store.mode.set(key, { streak: cur.streak, until: cur.until });
      return { sekunden: 0, scope: "keine" };
  }
  store.mode.set(key, { streak, until: sek ? now + sek * 1000 : 0 });
  return { sekunden: sek, scope: sek ? "modus" : "keine" };
}

export const KLASSEN_TEXT: Record<LlmErrorClass, string> = {
  rate_limit_minute: "Minuten-Limit (TPM/RPM) erreicht",
  rate_limit_day: "Tageslimit (TPD/RPD) erreicht",
  quota_exhausted: "Free-Tier/Guthaben aufgebraucht (402)",
  auth: "Zugriff verweigert (401/403 – Key oder Plan)",
  too_large: "Anfrage zu groß für das Limit (413)",
  model_unavailable: "Modell nicht (mehr) verfügbar (404)",
  unsupported_feature: "Funktion vom Modell nicht unterstützt (Tools/JSON)",
  malformed_output: "Ungültiges JSON / fehlgeschlagener Tool-Call",
  bad_request: "Ungültige Anfrage (400, meist Nachrichtenstruktur)",
  timeout: "Timeout / Netzwerk",
  server_error: "Provider-Serverfehler (5xx)",
  empty_or_partial: "Leere oder unvollständige Antwort",
  unknown: "Sonstiger Fehler",
};
