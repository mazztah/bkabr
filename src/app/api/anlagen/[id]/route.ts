import { NextRequest, NextResponse } from "next/server";
import { anlagenDb, anlagenWartungenDb, logEvent } from "@/lib/db";
import { AnlagenWartung } from "@/lib/types";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("anlagen", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const anlage = await anlagenDb.get(id);
  if (!anlage) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ anlage });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("anlagen", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await anlagenDb.get(id);
  const patch = await req.json().catch(() => ({}));
  const anlage = await anlagenDb.update(id, patch);
  if (!anlage) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "anlagen", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: anlage });
  return NextResponse.json({ anlage });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("anlagen", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await anlagenDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  // Zugehörige Wartungshistorie mitlöschen, damit keine verwaisten
  // Datensätze übrig bleiben.
  const historie = await anlagenWartungenDb.list({ anlageId: id } as Partial<AnlagenWartung>);
  for (const h of historie) await anlagenWartungenDb.remove(h.id);

  const success = await anlagenDb.remove(id);
  if (success) {
    await logEvent("loeschung", `Anlage „${bestehend.bezeichnung}" gelöscht.`, { art: "Anlage", id });
    await logAudit({ table: "anlagen", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });
  }
  return NextResponse.json({ success });
}
