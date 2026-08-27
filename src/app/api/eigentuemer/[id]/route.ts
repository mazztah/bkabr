import { NextRequest, NextResponse } from "next/server";
import { eigentuemerDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("immobilien", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const eigentuemer = await eigentuemerDb.get(id);
  if (!eigentuemer) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ eigentuemer });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("immobilien", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await eigentuemerDb.get(id);
  const patch = await req.json();
  const eigentuemer = await eigentuemerDb.update(id, patch);
  if (!eigentuemer) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "eigentuemer", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: eigentuemer });
  return NextResponse.json({ eigentuemer });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("immobilien", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await eigentuemerDb.get(id);
  const success = await eigentuemerDb.remove(id);
  if (success) {
    await logAudit({ table: "eigentuemer", recordId: id, aktion: "delete", changedBy: auth.id, oldData: vorher });
  }
  return NextResponse.json({ success });
}
