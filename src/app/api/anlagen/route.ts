import { NextRequest, NextResponse } from "next/server";
import { anlagenDb, logEvent } from "@/lib/db";
import { Anlage } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("anlagen", "read");
  if (auth instanceof NextResponse) return auth;

  const liegenschaftId = req.nextUrl.searchParams.get("liegenschaftId") || undefined;
  const gebaeudeId = req.nextUrl.searchParams.get("gebaeudeId") || undefined;
  const filter: Partial<Anlage> = {};
  if (liegenschaftId) filter.liegenschaftId = liegenschaftId;
  if (gebaeudeId) filter.gebaeudeId = gebaeudeId;
  const anlagen = await anlagenDb.list(Object.keys(filter).length ? filter : undefined);
  return NextResponse.json({ anlagen });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("anlagen", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  if (!body.typ || !body.bezeichnung || !body.liegenschaftId) {
    return NextResponse.json(
      { error: "typ, bezeichnung und liegenschaftId sind erforderlich" },
      { status: 400 }
    );
  }
  const now = new Date().toISOString();
  const anlage: Anlage = {
    id: uid(),
    typ: body.typ,
    bezeichnung: body.bezeichnung,
    liegenschaftId: body.liegenschaftId,
    gebaeudeId: body.gebaeudeId || undefined,
    standortDetail: body.standortDetail || undefined,
    hersteller: body.hersteller || undefined,
    modell: body.modell || undefined,
    seriennummer: body.seriennummer || undefined,
    baujahr: typeof body.baujahr === "number" ? body.baujahr : undefined,
    wartungsfirma: body.wartungsfirma || undefined,
    naechstePruefung: body.naechstePruefung || undefined,
    pruefintervallMonate: typeof body.pruefintervallMonate === "number" ? body.pruefintervallMonate : undefined,
    status: body.status || "In Betrieb",
    notizen: body.notizen || undefined,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await anlagenDb.create(anlage);
  await logEvent("anlage", `Anlage (${saved.typ}) „${saved.bezeichnung}" angelegt.`, {
    art: "Anlage",
    id: saved.id,
  });
  await logAudit({ table: "anlagen", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ anlage: saved });
}
