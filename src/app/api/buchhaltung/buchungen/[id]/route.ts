import { NextRequest, NextResponse } from "next/server";
import { buchungenDb, logEvent } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("finanzen", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await buchungenDb.get(id);
  const patch = await req.json().catch(() => ({}));
  const buchung = await buchungenDb.update(id, patch);
  if (!buchung) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "buchungen", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: buchung });
  return NextResponse.json({ buchung });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("finanzen", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await buchungenDb.get(id);
  const success = await buchungenDb.remove(id);
  if (success) {
    await logEvent("loeschung", "Buchung gelöscht.", { art: "Buchung", id });
    await logAudit({ table: "buchungen", recordId: id, aktion: "delete", changedBy: auth.id, oldData: vorher });
  }
  return NextResponse.json({ success });
}
