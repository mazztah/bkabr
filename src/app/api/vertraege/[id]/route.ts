import { NextRequest, NextResponse } from "next/server";
import { vertraegeDb, logEvent } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { pickAllowed } from "@/lib/patch-whitelist";
import type { Vertrag } from "@/lib/types";
import { logAudit } from "@/lib/audit";
import { vertragZeitraumFehler } from "@/lib/validierung";


// Nicht überschreibbar: id, nummer, createdAt, updatedAt
const VERTRAG_PATCH_FELDER = [
  "art", "bezeichnung", "vertragspartner", "liegenschaftId", "flurstueckId", "nutzungsart", "beginn", "ende",
  "unbefristet", "kuendigungsfrist", "betrag", "zahlungsintervall", "status", "dateiName", "storedFileName",
  "mimeType", "notizen", "anhaenge",
] as const satisfies ReadonlyArray<keyof Vertrag>;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("vertraege", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vertrag = await vertraegeDb.get(id);
  if (!vertrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ vertrag });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("vertraege", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await vertraegeDb.get(id);
  const patch = pickAllowed<Vertrag>(await req.json().catch(() => ({})), VERTRAG_PATCH_FELDER);
  if (patch.unbefristet === true) patch.ende = undefined;
  if (vorher) {
    const zeitraumFehler = vertragZeitraumFehler(
      patch.beginn ?? vorher.beginn,
      "ende" in patch ? patch.ende : vorher.ende,
      patch.unbefristet ?? vorher.unbefristet
    );
    if (zeitraumFehler) return NextResponse.json({ error: zeitraumFehler }, { status: 400 });
  }
  const vertrag = await vertraegeDb.update(id, patch);
  if (!vertrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "vertraege", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: vertrag });
  return NextResponse.json({ vertrag });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("vertraege", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await vertraegeDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await vertraegeDb.remove(id);
  if (success) {
    await logEvent("loeschung", `Vertrag „${bestehend.bezeichnung}" gelöscht.`, { art: "Vertrag", id });
    await logAudit({ table: "vertraege", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });
  }
  return NextResponse.json({ success });
}
