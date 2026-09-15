import { NextRequest, NextResponse } from "next/server";
import { veranstaltungsflaechenDb, reservierungenDb, logEvent } from "@/lib/db";
import { Reservierung } from "@/lib/types";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("veranstaltungen", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const flaeche = await veranstaltungsflaechenDb.get(id);
  if (!flaeche) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ flaeche });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("veranstaltungen", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await veranstaltungsflaechenDb.get(id);
  const patch = await req.json().catch(() => ({}));
  const flaeche = await veranstaltungsflaechenDb.update(id, patch);
  if (!flaeche) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "veranstaltungsflaechen", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: flaeche });
  return NextResponse.json({ flaeche });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("veranstaltungen", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await veranstaltungsflaechenDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const reservierungen = await reservierungenDb.list({ veranstaltungsflaecheId: id } as Partial<Reservierung>);
  for (const r of reservierungen) await reservierungenDb.remove(r.id);

  const success = await veranstaltungsflaechenDb.remove(id);
  if (success) {
    await logEvent("loeschung", `Veranstaltungsfläche „${bestehend.bezeichnung}" gelöscht.`, {
      art: "Veranstaltungsflaeche",
      id,
    });
    await logAudit({ table: "veranstaltungsflaechen", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });
  }
  return NextResponse.json({ success });
}
