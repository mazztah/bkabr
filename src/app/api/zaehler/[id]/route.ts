import { NextRequest, NextResponse } from "next/server";
import { zaehlerDb, zaehlerAblesungenDb, logEvent } from "@/lib/db";
import { ZaehlerAblesung } from "@/lib/types";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("zaehler", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const zaehler = await zaehlerDb.get(id);
  if (!zaehler) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ zaehler });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("zaehler", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await zaehlerDb.get(id);
  const patch = await req.json().catch(() => ({}));
  const zaehler = await zaehlerDb.update(id, patch);
  if (!zaehler) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "zaehler", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: zaehler });
  return NextResponse.json({ zaehler });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("zaehler", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await zaehlerDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const ablesungen = await zaehlerAblesungenDb.list({ zaehlerId: id } as Partial<ZaehlerAblesung>);
  for (const a of ablesungen) await zaehlerAblesungenDb.remove(a.id);

  const success = await zaehlerDb.remove(id);
  if (success) {
    await logEvent("loeschung", `Zähler „${bestehend.zaehlernummer}" gelöscht.`, { art: "Zaehler", id });
    await logAudit({ table: "zaehler", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });
  }
  return NextResponse.json({ success });
}
