import { NextRequest, NextResponse } from "next/server";
import { logEvent, mietvertraegeDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("vertraege", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const mietvertrag = await mietvertraegeDb.get(id);
  if (!mietvertrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ mietvertrag });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("vertraege", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await mietvertraegeDb.get(id);
  const patch = await req.json();
  const mietvertrag = await mietvertraegeDb.update(id, patch);
  if (!mietvertrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "mietvertraege", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: mietvertrag });
  return NextResponse.json({ mietvertrag });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("vertraege", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await mietvertraegeDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await mietvertraegeDb.remove(id);
  if (success) {
    await logEvent(
      "loeschung",
      `Mietvertrag „${bestehend.dateiName}" gelöscht.`,
      { art: "Mietvertrag", id }
    );
    await logAudit({ table: "mietvertraege", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });
  }
  return NextResponse.json({ success });
}
