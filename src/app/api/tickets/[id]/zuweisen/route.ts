import { NextRequest, NextResponse } from "next/server";
import { handwerkerDb, logEvent, ticketsDb } from "@/lib/db";
import { assignTicket } from "@/lib/tickets";

/**
 * Manuelle Weiterleitung eines Tickets an einen Handwerker – der zentrale
 * Endpunkt für "man kann auch manuell Aufträge ans Ticketsystem weiterreichen".
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await ticketsDb.get(id);
  if (!ticket) return NextResponse.json({ error: "Ticket nicht gefunden" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!body.handwerkerId) {
    return NextResponse.json({ error: "handwerkerId ist erforderlich" }, { status: 400 });
  }
  const hw = await handwerkerDb.get(body.handwerkerId);
  if (!hw) return NextResponse.json({ error: "Handwerker nicht gefunden" }, { status: 404 });

  const updated = await assignTicket(ticket, body.handwerkerId, body.von || "Verwaltung");
  await logEvent("zuordnung", `Ticket „${updated.titel}" an Handwerker „${hw.name}" zugewiesen.`, {
    art: "Ticket",
    id,
  });
  return NextResponse.json({ ticket: updated });
}
