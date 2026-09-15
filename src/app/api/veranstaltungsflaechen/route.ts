import { NextRequest, NextResponse } from "next/server";
import { veranstaltungsflaechenDb, logEvent } from "@/lib/db";
import { Veranstaltungsflaeche } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("veranstaltungen", "read");
  if (auth instanceof NextResponse) return auth;

  const liegenschaftId = req.nextUrl.searchParams.get("liegenschaftId") || undefined;
  const flaechen = await veranstaltungsflaechenDb.list(liegenschaftId ? { liegenschaftId } : undefined);
  return NextResponse.json({ flaechen });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("veranstaltungen", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  if (!body.bezeichnung || !body.liegenschaftId) {
    return NextResponse.json({ error: "bezeichnung und liegenschaftId sind erforderlich" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const flaeche: Veranstaltungsflaeche = {
    id: uid(),
    bezeichnung: body.bezeichnung,
    liegenschaftId: body.liegenschaftId,
    flaecheQm: typeof body.flaecheQm === "number" ? body.flaecheQm : undefined,
    kapazitaet: typeof body.kapazitaet === "number" ? body.kapazitaet : undefined,
    ausstattung: body.ausstattung || undefined,
    preisProTag: typeof body.preisProTag === "number" ? body.preisProTag : undefined,
    status: body.status || "Verfügbar",
    notizen: body.notizen || undefined,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await veranstaltungsflaechenDb.create(flaeche);
  await logEvent("anlage", `Veranstaltungsfläche „${saved.bezeichnung}" angelegt.`, {
    art: "Veranstaltungsflaeche",
    id: saved.id,
  });
  await logAudit({ table: "veranstaltungsflaechen", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ flaeche: saved });
}
