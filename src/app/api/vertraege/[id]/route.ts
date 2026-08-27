import { NextRequest, NextResponse } from "next/server";
import { vertraegeDb, logEvent } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("vertraege", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vertrag = await vertraegeDb.get(id);
  if (!vertrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ vertrag });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("vertraege", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await vertraegeDb.get(id);
  const patch = await req.json().catch(() => ({}));
  if (patch.unbefristet === true) patch.ende = undefined;
  const vertrag = await vertraegeDb.update(id, patch);
  if (!vertrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "vertraege", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: vertrag });
  return NextResponse.json({ vertrag });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("vertraege", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await vertraegeDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await vertraegeDb.remove(id);
  if (success) {
    await logEvent("loeschung", `Vertrag „${bestehend.bezeichnung}" gelöscht.`, { art: "Vertrag", id });
    await logAudit({ table: "vertraege", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });
  }
  return NextResponse.json({ success });
}
