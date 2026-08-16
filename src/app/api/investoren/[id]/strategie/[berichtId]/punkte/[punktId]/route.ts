import { NextRequest, NextResponse } from "next/server";
import { investorStrategieBerichteDb, logEvent } from "@/lib/db";

/**
 * Übernimmt eine neue Beschreibung für EINEN Strategiepunkt ("Übernehmen"-Button
 * im Frontend) und versioniert die bisherige Fassung in punkt.historie, statt
 * sie zu überschreiben – Grundlage für den "Historie"-Button im Strategie-Tab.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; berichtId: string; punktId: string }> }
) {
  const { id, berichtId, punktId } = await params;
  const bericht = await investorStrategieBerichteDb.get(berichtId);
  if (!bericht || bericht.investorId !== id) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  const idx = bericht.punkte.findIndex((p) => p.id === punktId);
  if (idx === -1) return NextResponse.json({ error: "Strategiepunkt nicht gefunden" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const neueBeschreibung = typeof body.beschreibung === "string" ? body.beschreibung.trim() : "";
  if (!neueBeschreibung) return NextResponse.json({ error: "beschreibung erforderlich" }, { status: 400 });
  const quelle: "user" | "ki-optimierung" = body.quelle === "user" ? "user" : "ki-optimierung";
  const hinweis: string | undefined = typeof body.hinweis === "string" ? body.hinweis : undefined;

  const alt = bericht.punkte[idx];
  const now = new Date().toISOString();
  if (alt.beschreibung === neueBeschreibung) {
    return NextResponse.json({ bericht }); // keine echte Änderung – nichts zu versionieren
  }
  const historie = [...(alt.historie || []), { beschreibung: alt.beschreibung, aktualisiertAm: now, quelle, hinweis }];
  const punkte = [...bericht.punkte];
  punkte[idx] = { ...alt, beschreibung: neueBeschreibung, historie };

  const updated = await investorStrategieBerichteDb.update(berichtId, { punkte, updatedAt: now });
  if (!updated) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  await logEvent(
    "aenderung",
    `Strategiepunkt „${alt.titel}" für „${bericht.investorFirma}" aktualisiert.`,
    { art: "InvestorStrategieBericht", id: berichtId }
  );
  return NextResponse.json({ bericht: updated });
}
