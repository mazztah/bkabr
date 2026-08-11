import { NextRequest, NextResponse } from "next/server";
import { getObservabilityOverview } from "@/lib/db";
import { createChatCompletion } from "@/lib/groq-client";
import { KNOWN_FREE_TIER_LIMITS } from "@/lib/llm-observability";

/**
 * GET /api/dashboard/cost-recommendation?modelId=...
 *
 * Nimmt die server-seitig bereits vorliegende Call-Statistik eines einzelnen
 * Modells (aus dem Modellkatalog der Observability-Übersicht – NICHT vom
 * Client übernommen, damit hier nichts gefälscht werden kann) und lässt die
 * normale LLM-Fallback-Kette eine kurze, konkrete Empfehlung formulieren,
 * wie sich dessen Fehlerquote senken ließe. Wird im Dashboard im
 * "Cost & Rate-Limits"-Tab per Button je Modell angezeigt.
 */
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
    const fehlerQuoteProzent = h.totalCalls > 0 ? Math.round((failedCalls / h.totalCalls) * 100) : 0;

    if (h.totalCalls === 0) {
      return NextResponse.json({
        recommendation: "Noch keine Aufrufe für dieses Modell protokolliert – noch keine Datenbasis für eine Empfehlung.",
      });
    }

    const limits = KNOWN_FREE_TIER_LIMITS[modelId];
    const statistikText = [
      `Modell: ${model.label} (${model.provider}, Fallback-Stufe ${model.fallbackPriority})`,
      `Aufrufe gesamt: ${h.totalCalls}`,
      `Erfolgreich: ${h.successCalls}`,
      `Fehlgeschlagen: ${failedCalls}`,
      `Fehlerquote: ${fehlerQuoteProzent}%`,
      `Davon Rate-Limits (429/413): ${h.rateLimitCount}`,
      `Free-Tier-Überschreitungen (402): ${h.freeTierExceededCount}`,
      `Bekanntes Provider-Limit: ${limits?.tpm ? `${limits.tpm} TPM` : "unbekannt"}${limits?.tpd ? `, ${limits.tpd} TPD` : ""}`,
    ].join("\n");

    const completion = await createChatCompletion({
      messages: [
        {
          role: "system",
          content:
            "Du bist ein knapper technischer Berater für ein LLM-Fallback-System (Betriebskosten-Buchhaltungs-App). " +
            "Du bekommst die Call-Statistik eines einzelnen Modells und gibst NUR eine kurze, konkrete, umsetzbare " +
            "Empfehlung auf Deutsch, wie sich dessen Fehlerquote senken lässt. Maximal 4 kurze Sätze oder Stichpunkte. " +
            "Keine Einleitung, keine Höflichkeitsfloskeln, direkt zur Sache. Wenn die Fehlerquote niedrig/unauffällig " +
            "ist, sag das kurz und ehrlich statt eine Empfehlung zu erfinden.",
        },
        {
          role: "user",
          content: `Statistik:\n${statistikText}\n\nWas empfiehlst du, um die Fehlerquote zu senken?`,
        },
      ],
      temperature: 0.3,
      max_completion_tokens: 300,
    });

    const text = completion.choices?.[0]?.message?.content?.trim();
    return NextResponse.json({
      recommendation: text || "Keine Antwort von der LLM-Kette erhalten.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/dashboard/cost-recommendation]", message);
    return NextResponse.json({ fehler: message }, { status: 500 });
  }
}
