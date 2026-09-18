import { NextRequest, NextResponse } from "next/server";
import { raeumeDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("immobilien", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await raeumeDb.get(id);
  if (!vorher) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  // Nur fachliche Felder zulassen; IDs und Zeitstempel bleiben unangetastet.
  const erlaubt = [
    "etage",
    "laufendeNr",
    "bezeichnung",
    "nutzung",
    "dinGruppe",
    "flaeche",
    "veranstaltungsflaeche",
    "zusammenhangGruppe",
    "notizen",
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const k of erlaubt) if (k in body) patch[k] = body[k];
  if ("flaeche" in patch) {
    const f = Number(patch.flaeche);
    if (!Number.isFinite(f) || f < 0) return NextResponse.json({ error: "flaeche ungültig" }, { status: 400 });
    patch.flaeche = f;
  }
  const raum = await raeumeDb.update(id, patch);
  await logAudit({ table: "raeume", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: raum });
  return NextResponse.json({ raum });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("immobilien", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await raeumeDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await raeumeDb.remove(id);
  if (success) await logAudit({ table: "raeume", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });
  return NextResponse.json({ success });
}
