import { NextRequest, NextResponse } from "next/server";
import { investorenDb, investorStrategieBerichteDb } from "@/lib/db";
import { optimizeInvestorStrategiePunkt } from "@/lib/ai";

/**
 * Schlägt für EINEN Strategiepunkt eine überarbeitete Beschreibung vor,
 * basierend auf dem im Body übergebenen Änderungswunsch. Speichert NICHTS –
 * das übernimmt erst PATCH .../punkte/[punktId], sobald der Nutzer den
 * Vorschlag über "Übernehmen" bestätigt (siehe Strategie-Tab im Frontend).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; berichtId: string; punktId: string }> }
) {
  const { id, berichtId, punktId } = await params;
  const investor = await investorenDb.get(id);
  const bericht = await investorStrategieBerichteDb.get(berichtId);
  if (!investor || !bericht || bericht.investorId !== id) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  const punkt = bericht.punkte.find((p) => p.id === punktId);
  if (!punkt) return NextResponse.json({ error: "Strategiepunkt nicht gefunden" }, { status: 404 });

  try {
    const body = await req.json().catch(() => ({}));
    const wunsch = typeof body.wunsch === "string" ? body.wunsch : "";
    const vorschlag = await optimizeInvestorStrategiePunkt(investor, punkt, wunsch);
    if (!vorschlag) {
      return NextResponse.json({ error: "Keine Antwort vom Modell erhalten" }, { status: 502 });
    }
    return NextResponse.json({ vorschlag });
  } catch (e: any) {
    console.error("Strategiepunkt-Optimierung fehlgeschlagen:", e);
    return NextResponse.json({ error: e.message || "Optimierung fehlgeschlagen" }, { status: 500 });
  }
}
