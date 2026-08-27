import { NextRequest, NextResponse } from "next/server";
import { logEvent, mietvertraegeDb } from "@/lib/db";
import { Mietvertrag } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("vertraege", "read");
  if (auth instanceof NextResponse) return auth;

  const wohnungId = req.nextUrl.searchParams.get("wohnungId") || undefined;
  const mietvertraege = await mietvertraegeDb.list(wohnungId ? ({ wohnungId } as any) : undefined);
  return NextResponse.json({ mietvertraege });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("vertraege", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  if (!body.wohnungId) {
    return NextResponse.json({ error: "wohnungId erforderlich" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const mietvertrag: Mietvertrag = {
    id: uid(),
    wohnungId: body.wohnungId,
    mieterId: body.mieterId,
    dateiName: body.dateiName || "Mietvertrag",
    storedFileName: body.storedFileName,
    mimeType: body.mimeType || "application/pdf",
    hochgeladenAm: now,
    sollMiete: body.sollMiete,
    nebenkostenVorauszahlung: body.nebenkostenVorauszahlung,
    bkVorauszahlung: body.bkVorauszahlung,
    hkVorauszahlung: body.hkVorauszahlung,
    warmmiete: body.warmmiete,
    kaution: body.kaution,
    mietbeginn: body.mietbeginn,
    mietende: body.mietende,
    flaeche: body.flaeche,
    zimmer: body.zimmer,
    status: body.status || "Entwurf",
    extraktText: body.extraktText,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await mietvertraegeDb.create(mietvertrag);
  await logEvent("anlage", `Mietvertrag „${saved.dateiName}" angelegt.`, { art: "Mietvertrag", id: saved.id });
  await logAudit({ table: "mietvertraege", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ mietvertrag: saved });
}
