import { NextRequest, NextResponse } from "next/server";
import { logEvent, ticketsDb } from "@/lib/db";
import { Ticket, TicketHistorieEintrag } from "@/lib/types";
import { uid } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const handwerkerId = req.nextUrl.searchParams.get("handwerkerId") || undefined;
  const filter: any = {};
  if (status) filter.status = status;
  if (handwerkerId) filter.handwerkerId = handwerkerId;
  const tickets = await ticketsDb.list(Object.keys(filter).length ? filter : undefined);
  // neueste zuerst
  tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return NextResponse.json({ tickets });
}

/**
 * Legt ein neues Ticket an – das ist gleichzeitig der "Auftragseingang":
 * jedes neu erstellte Ticket landet automatisch im Status "Eingang", ganz
 * gleich ob es aus einer Mieter-Meldung, intern oder manuell (z.B. aus
 * Instandhaltung/Aufträge) ans Ticketsystem weitergereicht wurde.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.titel) {
    return NextResponse.json({ error: "titel ist erforderlich" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const erstHistorie: TicketHistorieEintrag = {
    id: uid(),
    zeitpunkt: now,
    status: "Eingang",
    text: `Ticket angelegt (Quelle: ${body.quelle || "Intern"}).`,
    von: body.erstelltVon,
  };
  const ticket: Ticket = {
    id: uid(),
    titel: body.titel,
    beschreibung: body.beschreibung,
    status: "Eingang",
    prioritaet: body.prioritaet || "mittel",
    quelle: body.quelle || "Intern",
    kategorie: body.kategorie,
    liegenschaftId: body.liegenschaftId || undefined,
    gebaeudeId: body.gebaeudeId || undefined,
    wohnungId: body.wohnungId || undefined,
    mieterId: body.mieterId || undefined,
    handwerkerId: undefined,
    erstelltVon: body.erstelltVon,
    freigabeErforderlich: !!body.freigabeErforderlich,
    faelligkeitsdatum: body.faelligkeitsdatum || undefined,
    kostenSchaetzung: body.kostenSchaetzung ? Number(body.kostenSchaetzung) : undefined,
    dokumente: [],
    historie: [erstHistorie],
    createdAt: now,
    updatedAt: now,
  };
  const saved = await ticketsDb.create(ticket);
  await logEvent("anlage", `Ticket „${saved.titel}" im Auftragseingang angelegt.`, {
    art: "Ticket",
    id: saved.id,
  });
  return NextResponse.json({ ticket: saved });
}
