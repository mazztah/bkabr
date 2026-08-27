import { NextRequest, NextResponse } from "next/server";
import { handwerkerDb, logEvent, ticketsDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("ticketsystem", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const handwerker = await handwerkerDb.get(id);
  if (!handwerker) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ handwerker });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("ticketsystem", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await handwerkerDb.get(id);
  const patch = await req.json().catch(() => ({}));
  const handwerker = await handwerkerDb.update(id, patch);
  if (!handwerker) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logEvent("aenderung", `Handwerker „${handwerker.name}" aktualisiert.`, {
    art: "Handwerker",
    id,
  });
  await logAudit({ table: "handwerker", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: handwerker });
  return NextResponse.json({ handwerker });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("ticketsystem", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await handwerkerDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  // Zugewiesene Tickets werden nicht gelöscht, aber von der Zuweisung befreit,
  // damit sie im Ticketsystem nicht "verwaist" mit toter Handwerker-ID stehen.
  const zugewiesen = await ticketsDb.list({ handwerkerId: id } as any);
  for (const t of zugewiesen) {
    await ticketsDb.update(t.id, { handwerkerId: undefined });
  }

  const success = await handwerkerDb.remove(id);
  if (success) {
    await logEvent("loeschung", `Handwerker „${bestehend.name}" gelöscht.`, {
      art: "Handwerker",
      id,
    });
    await logAudit({ table: "handwerker", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });
  }
  return NextResponse.json({ success });
}
