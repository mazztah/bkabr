import { NextRequest, NextResponse } from "next/server";
import { handwerkerDb, logEvent } from "@/lib/db";
import { HandwerkerTrackrecordEintrag } from "@/lib/types";
import { uid } from "@/lib/utils";

/**
 * Fügt einen "externen" Trackrecord-Eintrag hinzu – also Auftragshistorie, die
 * NICHT aus einem Ticket dieses Systems stammt (z.B. Aufträge von vor der
 * Einführung des Ticketsystems, oder Aufträge außerhalb der Plattform).
 * Interne Einträge entstehen automatisch aus Tickets (siehe lib/tickets.ts)
 * und werden hier nicht angelegt.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hw = await handwerkerDb.get(id);
  if (!hw) return NextResponse.json({ error: "Handwerker nicht gefunden" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!body.titel?.trim()) {
    return NextResponse.json({ error: "titel ist erforderlich" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const eintrag: HandwerkerTrackrecordEintrag = {
    id: uid(),
    quelle: "extern",
    titel: body.titel,
    beschreibung: body.beschreibung,
    status: body.status || "erledigt",
    bewertung: body.bewertung ? Number(body.bewertung) : undefined,
    datum: body.datum || now,
    createdAt: now,
  };
  const trackrecord = [...(hw.trackrecord || []), eintrag];
  const updated = await handwerkerDb.update(id, { trackrecord });
  await logEvent("anlage", `Externer Trackrecord-Eintrag für „${hw.name}" erfasst: ${eintrag.titel}`, {
    art: "Handwerker",
    id,
  });
  return NextResponse.json({ handwerker: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eintragId = req.nextUrl.searchParams.get("eintragId");
  const hw = await handwerkerDb.get(id);
  if (!hw) return NextResponse.json({ error: "Handwerker nicht gefunden" }, { status: 404 });
  if (!eintragId) return NextResponse.json({ error: "eintragId erforderlich" }, { status: 400 });

  const trackrecord = (hw.trackrecord || []).filter((t) => t.id !== eintragId);
  const updated = await handwerkerDb.update(id, { trackrecord });
  return NextResponse.json({ handwerker: updated });
}
