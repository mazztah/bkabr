import { NextRequest, NextResponse } from "next/server";
import { ticketNachrichtenDb, ticketsDb } from "@/lib/db";
import { TicketNachricht } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("ticketsystem", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const nachrichten = await ticketNachrichtenDb.list({ ticketId: id } as any);
  nachrichten.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return NextResponse.json({ nachrichten });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("ticketsystem", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const ticket = await ticketsDb.get(id);
  if (!ticket) return NextResponse.json({ error: "Ticket nicht gefunden" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!body.text?.trim()) {
    return NextResponse.json({ error: "text ist erforderlich" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const nachricht: TicketNachricht = {
    id: uid(),
    ticketId: id,
    von: body.von || "Verwaltung",
    text: body.text,
    intern: body.intern !== false,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await ticketNachrichtenDb.create(nachricht);
  await logAudit({ table: "ticket_nachrichten", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ nachricht: saved });
}
