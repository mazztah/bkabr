import { NextRequest, NextResponse } from "next/server";
import { abrechnungskreiseDb, logEvent } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("finanzen", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await abrechnungskreiseDb.get(id);
  const patch = await req.json().catch(() => ({}));
  const kreis = await abrechnungskreiseDb.update(id, patch);
  if (!kreis) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "abrechnungskreise", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: kreis });
  return NextResponse.json({ kreis });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("finanzen", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await abrechnungskreiseDb.get(id);
  const success = await abrechnungskreiseDb.remove(id);
  if (success) {
    await logEvent("loeschung", "Abrechnungskreis gelöscht.", { art: "Abrechnungskreis", id });
    await logAudit({ table: "abrechnungskreise", recordId: id, aktion: "delete", changedBy: auth.id, oldData: vorher });
  }
  return NextResponse.json({ success });
}
