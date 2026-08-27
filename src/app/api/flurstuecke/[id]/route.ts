import { NextRequest, NextResponse } from "next/server";
import { flurstueckeDb, logEvent } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("liegenschaften", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const flurstueck = await flurstueckeDb.get(id);
  if (!flurstueck) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ flurstueck });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("liegenschaften", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await flurstueckeDb.get(id);
  const patch = await req.json().catch(() => ({}));
  const flurstueck = await flurstueckeDb.update(id, patch);
  if (!flurstueck) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "flurstuecke", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: flurstueck });
  return NextResponse.json({ flurstueck });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("liegenschaften", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await flurstueckeDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await flurstueckeDb.remove(id);
  if (success) {
    await logEvent(
      "loeschung",
      `Flurstück „${bestehend.gemarkung} Flur ${bestehend.flur} Nr. ${bestehend.flurstueckNummer}" gelöscht.`,
      { art: "Flurstueck", id }
    );
    await logAudit({ table: "flurstuecke", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });
  }
  return NextResponse.json({ success });
}
