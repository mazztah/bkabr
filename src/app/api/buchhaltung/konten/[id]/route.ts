import { NextRequest, NextResponse } from "next/server";
import { kontenDb, logEvent } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("finanzen", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await kontenDb.get(id);
  const patch = await req.json().catch(() => ({}));
  const konto = await kontenDb.update(id, patch);
  if (!konto) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "konten", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: konto });
  return NextResponse.json({ konto });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("finanzen", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await kontenDb.get(id);
  const success = await kontenDb.remove(id);
  if (success) {
    await logEvent("loeschung", "Konto gelöscht.", { art: "Konto", id });
    await logAudit({ table: "konten", recordId: id, aktion: "delete", changedBy: auth.id, oldData: vorher });
  }
  return NextResponse.json({ success });
}
