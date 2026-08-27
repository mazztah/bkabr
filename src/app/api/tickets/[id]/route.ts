import { NextRequest, NextResponse } from "next/server";
import { logEvent, ticketsDb } from "@/lib/db";
import { appendTicketHistorie, syncHandwerkerTrackrecord } from "@/lib/tickets";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("ticketsystem", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const ticket = await ticketsDb.get(id);
  if (!ticket) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ ticket });
}

/**
 * Generisches Update (Titel, Priorität, Fälligkeit, Kategorie, Objektbezug, ...).
 * Statuswechsel und Handwerker-Zuweisung laufen zwar auch hier durch (patch.status
 * / patch.handwerkerId), erzeugen aber – anders als /freigeben, /ablehnen und
 * /zuweisen – KEINEN eigenen Historien-Eintrag mit Begründung. Für den vollen
 * Workflow (Freigabe-Kommentar, Ablehnungsgrund, Zuweisung mit Protokoll) bitte
 * die dedizierten Endpunkte verwenden.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("ticketsystem", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const patch = await req.json().catch(() => ({}));
  const bestehend = await ticketsDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const statusChanged = patch.status && patch.status !== bestehend.status;
  let ticket = (await ticketsDb.update(id, patch)) || bestehend;

  if (statusChanged) {
    ticket = await appendTicketHistorie(ticket, `Status geändert auf „${patch.status}".`, {
      status: patch.status,
      von: patch.von,
    });
    await syncHandwerkerTrackrecord(ticket);
  }

  await logEvent("aenderung", `Ticket „${ticket.titel}" aktualisiert.`, { art: "Ticket", id });
  await logAudit({ table: "tickets", recordId: id, aktion: "update", changedBy: auth.id, oldData: bestehend, newData: ticket });
  return NextResponse.json({ ticket });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("ticketsystem", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await ticketsDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await ticketsDb.remove(id);
  if (success) {
    await logEvent("loeschung", `Ticket „${bestehend.titel}" gelöscht.`, { art: "Ticket", id });
    await logAudit({ table: "tickets", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });
  }
  return NextResponse.json({ success });
}
