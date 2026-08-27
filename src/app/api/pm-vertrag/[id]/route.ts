import { NextRequest, NextResponse } from "next/server";
import { logEvent, pmVertraegeDb } from "@/lib/db";
import { beendePmVertrag } from "@/lib/cascade-delete";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("vertraege", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const pmVertrag = await pmVertraegeDb.get(id);
  if (!pmVertrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ pmVertrag });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("vertraege", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await pmVertraegeDb.get(id);
  const patch = await req.json();

  if (patch.status === "Beendet" || patch.beenden === true) {
    const result = await beendePmVertrag(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    const pmVertrag = await pmVertraegeDb.get(id);
    await logAudit({ table: "pm_vertraege", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: pmVertrag });
    return NextResponse.json({
      pmVertrag,
      liegenschaftInaktiv: result.liegenschaft,
      beendet: true,
    });
  }

  const { beenden: _b, ...rest } = patch;
  const pmVertrag = await pmVertraegeDb.update(id, rest);
  if (!pmVertrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "pm_vertraege", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: pmVertrag });
  return NextResponse.json({ pmVertrag });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("vertraege", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await pmVertraegeDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await pmVertraegeDb.remove(id);
  if (success) {
    await logEvent(
      "loeschung",
      `PM-Vertrag „${bestehend.dateiName || bestehend.verwalterName}" gelöscht.`,
      { art: "PM-Vertrag", id }
    );
    await logAudit({ table: "pm_vertraege", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });
  }
  return NextResponse.json({ success });
}
