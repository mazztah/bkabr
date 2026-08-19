import { NextRequest, NextResponse } from "next/server";
import { logEvent, ticketsDb } from "@/lib/db";
import { rejectTicket } from "@/lib/tickets";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await ticketsDb.get(id);
  if (!ticket) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const von = body.von || "Verwaltung";
  if (!body.grund?.trim()) {
    return NextResponse.json({ error: "grund ist erforderlich" }, { status: 400 });
  }
  const updated = await rejectTicket(ticket, von, body.grund);
  await logEvent("aenderung", `Ticket „${updated.titel}" abgelehnt von ${von}: ${body.grund}`, {
    art: "Ticket",
    id,
  });
  return NextResponse.json({ ticket: updated });
}
