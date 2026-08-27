import { NextRequest, NextResponse } from "next/server";
import { schriftverkehrDb } from "@/lib/db";
import { SchriftverkehrStatus } from "@/lib/types";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("dokumente", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const doc = await schriftverkehrDb.get(id);
  if (!doc) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ dokument: doc });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("dokumente", "write");
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const vorher = await schriftverkehrDb.get(id);
    const body = await req.json();
    const allowed: Partial<{
      text: string;
      betreff: string;
      status: SchriftverkehrStatus;
      werte: Record<string, string>;
    }> = {};
    if (typeof body.text === "string") allowed.text = body.text;
    if (typeof body.betreff === "string") allowed.betreff = body.betreff;
    if (
      body.status === "Entwurf" ||
      body.status === "Versandbereit" ||
      body.status === "Versendet" ||
      body.status === "Archiviert"
    ) {
      allowed.status = body.status;
    }
    if (body.werte && typeof body.werte === "object") allowed.werte = body.werte;

    const updated = await schriftverkehrDb.update(id, allowed);
    if (!updated) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    await logAudit({ table: "schriftverkehr", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: updated });
    return NextResponse.json({ dokument: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("dokumente", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await schriftverkehrDb.get(id);
  const ok = await schriftverkehrDb.remove(id);
  if (!ok) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "schriftverkehr", recordId: id, aktion: "delete", changedBy: auth.id, oldData: vorher });
  return NextResponse.json({ ok: true });
}
