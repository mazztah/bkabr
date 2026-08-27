import { NextRequest, NextResponse } from "next/server";
import { kalenderEreignisseDb, logEvent } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("kalender", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await kalenderEreignisseDb.get(id);
  const patch = await req.json().catch(() => ({}));
  const ereignis = await kalenderEreignisseDb.update(id, patch);
  if (!ereignis) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "kalender_ereignisse", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: ereignis });
  return NextResponse.json({ ereignis });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("kalender", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await kalenderEreignisseDb.get(id);
  const success = await kalenderEreignisseDb.remove(id);
  if (success) {
    await logEvent("loeschung", "Kalendertermin gelöscht.", { art: "KalenderEreignis", id });
    await logAudit({ table: "kalender_ereignisse", recordId: id, aktion: "delete", changedBy: auth.id, oldData: vorher });
  }
  return NextResponse.json({ success });
}
