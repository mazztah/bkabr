import { NextRequest, NextResponse } from "next/server";
import { logEvent, ticketsDb } from "@/lib/db";
import { approveTicket } from "@/lib/tickets";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("ticketsystem", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const ticket = await ticketsDb.get(id);
  if (!ticket) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const von = body.von || "Verwaltung";
  const updated = await approveTicket(ticket, von, body.kommentar);
  await logEvent("aenderung", `Ticket „${updated.titel}" freigegeben von ${von}.`, {
    art: "Ticket",
    id,
  });
  await logAudit({ table: "tickets", recordId: id, aktion: "update", changedBy: auth.id, oldData: ticket, newData: updated });
  return NextResponse.json({ ticket: updated });
}
