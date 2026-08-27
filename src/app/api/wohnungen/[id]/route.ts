import { NextRequest, NextResponse } from "next/server";
import { logEvent, wohnungenDb } from "@/lib/db";
import { cascadeDeleteWohnung } from "@/lib/cascade-delete";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("immobilien", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const wohnung = await wohnungenDb.get(id);
  if (!wohnung) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ wohnung });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("immobilien", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await wohnungenDb.get(id);
  const patch = await req.json();
  const wohnung = await wohnungenDb.update(id, patch);
  if (!wohnung) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "wohnungen", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: wohnung });
  return NextResponse.json({ wohnung });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("immobilien", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const cascade =
    req.nextUrl.searchParams.get("cascade") === "1" ||
    req.nextUrl.searchParams.get("cascade") === "true";

  if (cascade) {
    const result = await cascadeDeleteWohnung(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, success: false }, { status: 404 });
    }
    await logAudit({ table: "wohnungen", recordId: id, aktion: "delete", changedBy: auth.id, oldData: { name: result.name, report: result.report } });
    return NextResponse.json({ success: true, cascade: true, report: result.report, name: result.name });
  }

  const bestehend = await wohnungenDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await wohnungenDb.remove(id);
  if (success) {
    await logEvent("loeschung", `Wohnung „${bestehend.bezeichnung}" gelöscht.`, {
      art: "Wohnung",
      id,
    });
    await logAudit({ table: "wohnungen", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });
  }
  return NextResponse.json({ success });
}
