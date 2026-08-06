import { NextResponse } from "next/server";
import { getAiObservatoryUebersicht } from "@/lib/db";

/**
 * AI Cost & Model Observatory – liefert die Übersicht, die
 * src/components/dashboard/AiObservatory.tsx unter
 * /api/dashboard/ai-observatory erwartet.
 *
 * Daten kommen aus dem in db.json persistierten aiUsageLog
 * (befüllt durch recordAiUsage in createChatCompletion).
 * Liefert auch den Provider-Katalog (welche Free-Tier-Keys gesetzt sind),
 * damit das Dashboard nie leer „Lade…" hängt.
 */
export async function GET() {
  try {
    const uebersicht = await getAiObservatoryUebersicht();
    return NextResponse.json({ uebersicht });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/dashboard/ai-observatory]", message);
    // Nie 500 mit leerem Body – Frontend zeigt sonst ewig „Lade…".
    // Stattdessen leere, aber gültige Übersicht zurückgeben.
    return NextResponse.json({
      uebersicht: {
        gesamtAufrufe: 0,
        gesamtPromptTokens: 0,
        gesamtCompletionTokens: 0,
        gesamtKostenUsd: 0,
        proModell: [],
        providerKatalog: [],
        letzteAufrufe: [],
        _error: message,
      },
    });
  }
}
