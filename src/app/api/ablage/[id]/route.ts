import { NextRequest, NextResponse } from "next/server";
import { ablageDb, logEvent } from "@/lib/db";
import { deleteStoredFile } from "@/lib/storage";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("dokumente", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const bestehend = await ablageDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (body.status) patch.status = body.status;
  if (body.zugeordnetAn !== undefined) patch.zugeordnetAn = body.zugeordnetAn;
  if (body.erkannterTyp !== undefined) patch.erkannterTyp = body.erkannterTyp;
  if (body.konfidenz !== undefined) patch.konfidenz = body.konfidenz;
  if (body.dateiName !== undefined && String(body.dateiName).trim()) {
    patch.dateiName = String(body.dateiName).trim();
  }

  const aktualisiert = await ablageDb.update(id, patch as any);
  await logAudit({ table: "ablage", recordId: id, aktion: "update", changedBy: auth.id, oldData: bestehend, newData: aktualisiert });

  if (body.status === "zugeordnet" && body.zugeordnetAn) {
    await logEvent(
      "zuordnung",
      `„${bestehend.dateiName}" zugeordnet zu: ${body.zugeordnetAn.label} (${body.zugeordnetAn.art}).`,
      { art: "Ablage", id }
    );
  } else if (body.status === "verworfen") {
    await logEvent("info", `„${bestehend.dateiName}" in der Ablage verworfen.`, { art: "Ablage", id });
  } else if (patch.dateiName && patch.dateiName !== bestehend.dateiName) {
    await logEvent(
      "aenderung",
      `„${bestehend.dateiName}" umbenannt in „${patch.dateiName}".`,
      { art: "Ablage", id }
    );
  }

  return NextResponse.json({ ablage: aktualisiert });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("dokumente", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await ablageDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  await deleteStoredFile(bestehend.storedFileName);
  await ablageDb.remove(id);
  await logEvent("loeschung", `„${bestehend.dateiName}" aus der Ablage gelöscht.`, { art: "Ablage", id });
  await logAudit({ table: "ablage", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });

  return NextResponse.json({ ok: true });
}
