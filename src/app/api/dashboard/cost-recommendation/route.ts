import { NextRequest, NextResponse } from "next/server";
import { getChainStats, getObservabilityOverview } from "@/lib/db";
import { KNOWN_FREE_TIER_LIMITS } from "@/lib/llm-observability";
import { KLASSEN_TEXT, type LlmErrorClass } from "@/lib/llm-error-classifier";

/**
 * GET /api/dashboard/cost-recommendation?modelId=...
 *
 * Liefert eine DETERMINISTISCHE Diagnose aus den tatsächlich protokollierten
 * Fehlerklassen des Modells (siehe llm-error-classifier.ts / recordModelCallStats).
 *
 * Vorher wurde die Empfehlung von der LLM-Fallback-Kette selbst formuliert –
 * nur aus Zählern, ohne Fehlerursache. Ergebnis waren generische Ratschläge
 * ("Backoff, Caching, Queue"), die im Code längst umgesetzt sind, und jede
 * Empfehlung erzeugte selbst einen weiteren Kettenaufruf (und damit weitere
 * Fehlversuche in genau der Statistik, die sie erklären sollte).
 */

/** Konkrete Maßnahme je Fehlerklasse – bezogen auf das, was das System bereits tut. */
const MASSNAHME: Record<LlmErrorClass, (ctx: { tpm?: number }) => string> = {
  rate_limit_minute: ({ tpm }) =>
    `Minuten-Limit${tpm ? ` (${tpm.toLocaleString("de-DE")} TPM)` : ""}: Die Kette weicht automatisch aus und sperrt das Modell für die vom Provider genannte Wartezeit. Dauerhaft entlasten: parallele Analysen/Uploads zeitlich entzerren und große Prompts kürzen – ein Limit dieser Größe trifft vor allem mehrere gleichzeitige Anfragen.`,
  rate_limit_day: () =>
    "Tageslimit (TPD) erschöpft: Das Modell fällt bis zum Reset aus. Nur ein anderer Provider/Tarif hilft; die Kette überspringt es automatisch.",
  quota_exhausted: () =>
    "Free-Tier/Guthaben beim Provider aufgebraucht (402): Kein Codeproblem. Konto/Kontingent prüfen – oder die Stufe per ENV (…_TEXT_MODELS) aus der Kette nehmen, damit sie nicht alle 30 Min. erneut probiert wird.",
  auth: () =>
    "Zugriff verweigert (401/403): API-Key bzw. Plan-Freigabe beim Provider prüfen (z. B. Workers-Free-Plan). Das Modell wird 6 h ausgesetzt.",
  too_large: () =>
    "Anfrage überstieg das Limit: Kürzung greift bereits (Tool-Ergebnisse, älterer Verlauf). Anfragen ab der abgelehnten Größe werden 10 Min. nicht mehr an dieses Modell geschickt, kleinere laufen weiter. Bei Häufung: System-Prompt/Tool-Katalog verkleinern.",
  model_unavailable: () =>
    "Modell beim Provider nicht (mehr) vorhanden (404/abgekündigt): Modell-ID aus der ENV-Liste entfernen bzw. durch den Nachfolger ersetzen.",
  unsupported_feature: () =>
    "Modell unterstützt Tools/JSON-Mode nicht: wird für strukturierte Aufrufe 12 h ausgesetzt, bleibt für Freitext nutzbar. Kein Handlungsbedarf, solange andere Stufen strukturierte Aufrufe übernehmen.",
  malformed_output: () =>
    "Modell liefert ungültiges JSON/fehlerhafte Tool-Calls: Kette läuft weiter, nach Serien wird das Modell im strukturierten Modus kurz ausgesetzt. Modell dauerhaft nachrangig einsortieren (STRUCTURED_OUTPUT_UNSAFE_MODELS).",
  bad_request: () =>
    "Anfrage abgelehnt (400): meist Nachrichtenstruktur (Tool-Paare, Rollenfolge, Tool-IDs). Diese wird vor jedem Versuch modellspezifisch bereinigt; bleibt der Fehler bestehen, die letzte Fehlermeldung unten prüfen.",
  timeout: () =>
    "Timeouts/Netzwerkabbrüche: Modell zu langsam oder überlastet. Nach zwei Fehlern in Folge wird es exponentiell länger ausgesetzt (bis 10 Min.).",
  server_error: () =>
    "Serverfehler beim Provider (5xx): vorübergehend; Breaker setzt das Modell nach Wiederholung automatisch aus.",
  empty_or_partial: () =>
    "Modell antwortet leer oder unvollständig: Kette läuft zur nächsten Stufe; bei Serien wird das Modell kurz ausgesetzt.",
  unknown: () => "Sonstige Fehler: siehe letzte Fehlermeldung unten.",
};

export async function GET(req: NextRequest) {
  try {
    const modelId = req.nextUrl.searchParams.get("modelId");
    if (!modelId) {
      return NextResponse.json({ fehler: "modelId fehlt." }, { status: 400 });
    }

    const overview = await getObservabilityOverview();
    const model = overview.modelCatalog.find((m) => m.id === modelId);
    if (!model) {
      return NextResponse.json({ fehler: `Modell "${modelId}" nicht gefunden.` }, { status: 404 });
    }

    const h = model.health;
    const failedCalls = Math.max(0, h.totalCalls - h.successCalls);
    if (h.totalCalls === 0) {
      return NextResponse.json({
        recommendation: "Noch keine Aufrufe für dieses Modell protokolliert – noch keine Datenbasis für eine Diagnose.",
      });
    }

    const zeilen: string[] = [];
    const quote = Math.round((failedCalls / h.totalCalls) * 100);
    const limits = KNOWN_FREE_TIER_LIMITS[modelId];

    // 1) Ketten-Sicht: was Nutzer tatsächlich erleben
    const kette = await getChainStats();
    if (kette && kette.anfragen > 0) {
      const ok = Math.round((kette.erfolgreich / kette.anfragen) * 100);
      const erste = Math.round((kette.ersteStufe / kette.anfragen) * 100);
      zeilen.push(
        `Gesamtkette: ${kette.erfolgreich}/${kette.anfragen} Anfragen erfolgreich (${ok} %), ${erste} % schon auf der ersten Stufe. Die Modell-Fehlerquote unten zählt JEDEN Zwischenschritt einer Kette – ein Fehlversuch mit späterem Erfolg ist kein Nutzerfehler.`
      );
    }

    // 2) Diagnose dieses Modells
    const klassen = Object.entries(h.errorClasses || {})
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]) as [LlmErrorClass, number][];

    if (failedCalls === 0) {
      zeilen.push("Keine Fehlschläge – nichts zu tun.");
    } else if (klassen.length > 0) {
      const summe = klassen.reduce((s, [, n]) => s + n, 0);
      zeilen.push(
        `Fehlerquote ${quote} % (${failedCalls} von ${h.totalCalls}). Ursachen seit Erfassung: ` +
          klassen
            .slice(0, 4)
            .map(([k, n]) => `${KLASSEN_TEXT[k] || k} ${Math.round((n / summe) * 100)} %`)
            .join(", ") +
          "."
      );
      for (const [k] of klassen.slice(0, 3)) {
        zeilen.push(`- ${(MASSNAHME[k] || MASSNAHME.unknown)({ tpm: limits?.tpm })}`);
      }
    } else {
      // Ältere Zähler ohne Klasse: nur Rate-Limit-/402-Anteile sind bekannt.
      const unklar = Math.max(0, failedCalls - h.rateLimitCount - h.freeTierExceededCount);
      zeilen.push(
        `Fehlerquote ${quote} % (${failedCalls} von ${h.totalCalls}): davon ${h.rateLimitCount} Rate-Limits, ${h.freeTierExceededCount} × 402, ${unklar} ohne erfasste Ursache. Fehlerklassen werden erst seit diesem Update mitgeschrieben – nach einigen Aufrufen erscheint hier die genaue Aufschlüsselung.`
      );
      if (h.freeTierExceededCount > 0) zeilen.push(`- ${MASSNAHME.quota_exhausted({})}`);
      if (h.rateLimitCount > 0) zeilen.push(`- ${MASSNAHME.rate_limit_minute({ tpm: limits?.tpm })}`);
    }

    if (h.lastErrorMessage) {
      zeilen.push(`Letzter Fehler${h.lastErrorAt ? ` (${new Date(h.lastErrorAt).toLocaleString("de-DE")})` : ""}: ${h.lastErrorMessage}`);
    }

    return NextResponse.json({ recommendation: zeilen.join("\n") });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/dashboard/cost-recommendation]", message);
    return NextResponse.json({ fehler: message }, { status: 500 });
  }
}
