import { NextRequest, NextResponse } from "next/server";
import { logEvent, ticketsDb } from "@/lib/db";
import { Ticket, TicketHistorieEintrag, TICKET_BAGATELLGRENZE_EUR, TICKET_SLA_STUNDEN } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("ticketsystem", "read");
  if (auth instanceof NextResponse) return auth;

  const status = req.nextUrl.searchParams.get("status") || undefined;
  const handwerkerId = req.nextUrl.searchParams.get("handwerkerId") || undefined;
  const liegenschaftId = req.nextUrl.searchParams.get("liegenschaftId") || undefined;
  const filter: any = {};
  if (status) filter.status = status;
  if (handwerkerId) filter.handwerkerId = handwerkerId;
  if (liegenschaftId) filter.liegenschaftId = liegenschaftId;
  const tickets = await ticketsDb.list(Object.keys(filter).length ? filter : undefined);
  tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return NextResponse.json({ tickets });
}

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3600 * 1000).toISOString();
}

/**
 * Legt ein neues Ticket an - das ist gleichzeitig der "Auftragseingang":
 * jedes neu erstellte Ticket landet automatisch im Status "Eingang", ganz
 * gleich ob es aus einer Mieter-Meldung, intern oder manuell (z.B. aus
 * Instandhaltung/Auftraege) ans Ticketsystem weitergereicht wurde.
 *
 * Zusaetzlich werden hier automatisch die SLA-Zieldaten (Reaktion/Loesung)
 * anhand der Prioritaet berechnet und - sofern eine Kostenschaetzung ueber
 * der Bagatellgrenze angegeben wurde und der Aufrufer nichts anderes
 * vorgibt - eine Freigabepflicht vorgeschlagen.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission("ticketsystem", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  if (!body.titel) {
    return NextResponse.json({ error: "titel ist erforderlich" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const prioritaet = body.prioritaet || "mittel";
  const sla = TICKET_SLA_STUNDEN[prioritaet as keyof typeof TICKET_SLA_STUNDEN] || TICKET_SLA_STUNDEN.mittel;

  const kostenSchaetzung = body.kostenSchaetzung ? Number(body.kostenSchaetzung) : undefined;
  const freigabeErforderlich =
    typeof body.freigabeErforderlich === "boolean"
      ? body.freigabeErforderlich
      : !!(kostenSchaetzung && kostenSchaetzung > TICKET_BAGATELLGRENZE_EUR);

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
    prioritaet,
    quelle: body.quelle || "Intern",
    kategorie: body.kategorie,
    ticketArt: body.ticketArt || "Reparatur",
    schadensart: body.schadensart || undefined,
    liegenschaftId: body.liegenschaftId || undefined,
    gebaeudeId: body.gebaeudeId || undefined,
    wohnungId: body.wohnungId || undefined,
    mieterId: body.mieterId || undefined,
    handwerkerId: undefined,
    erstelltVon: body.erstelltVon,
    melderTyp: body.melderTyp || undefined,
    zustaendigerMitarbeiter: body.zustaendigerMitarbeiter || undefined,
    freigabeErforderlich,
    slaReaktionBis: addHours(now, sla.reaktion),
    slaLoesungBis: addHours(now, sla.loesung),
    kostenstelle: body.kostenstelle || body.liegenschaftId || undefined,
    kostenart: body.kostenart || undefined,
    bestellnummer: body.bestellnummer || undefined,
    kostenSchaetzung,
    schluesselstatus: body.schluesselstatus || undefined,
    mieterVerfuegbarkeit: body.mieterVerfuegbarkeit || undefined,
    betriebsunterbrechungRisiko: !!body.betriebsunterbrechungRisiko,
    sicherheitsfreigabeErforderlich: !!body.sicherheitsfreigabeErforderlich,
    wartungsvertragVorhanden: !!body.wartungsvertragVorhanden,
    wartungspartner: body.wartungspartner || undefined,
    faelligkeitsdatum: body.faelligkeitsdatum || undefined,
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
  await logAudit({ table: "tickets", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ ticket: saved });
}
