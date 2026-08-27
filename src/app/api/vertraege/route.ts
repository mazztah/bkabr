import { NextRequest, NextResponse } from "next/server";
import { vertraegeDb, logEvent } from "@/lib/db";
import { Vertrag } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("vertraege", "read");
  if (auth instanceof NextResponse) return auth;

  const liegenschaftId = req.nextUrl.searchParams.get("liegenschaftId") || undefined;
  const art = req.nextUrl.searchParams.get("art") || undefined;
  const filter: Partial<Vertrag> = {};
  if (liegenschaftId) filter.liegenschaftId = liegenschaftId;
  if (art) filter.art = art as Vertrag["art"];
  const vertraege = await vertraegeDb.list(Object.keys(filter).length ? filter : undefined);
  return NextResponse.json({
    vertraege: [...vertraege].sort((a, b) => (a.beginn < b.beginn ? 1 : -1)),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("vertraege", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  if (!body.art || !body.bezeichnung || !body.vertragspartner || !body.beginn) {
    return NextResponse.json(
      { error: "art, bezeichnung, vertragspartner und beginn sind erforderlich" },
      { status: 400 }
    );
  }
  const now = new Date().toISOString();
  const vertrag: Vertrag = {
    id: uid(),
    art: body.art,
    bezeichnung: body.bezeichnung,
    vertragspartner: body.vertragspartner,
    liegenschaftId: body.liegenschaftId || undefined,
    flurstueckId: body.flurstueckId || undefined,
    beginn: body.beginn,
    ende: body.unbefristet ? undefined : body.ende || undefined,
    unbefristet: Boolean(body.unbefristet),
    kuendigungsfrist: body.kuendigungsfrist || undefined,
    betrag: typeof body.betrag === "number" ? body.betrag : undefined,
    zahlungsintervall: body.zahlungsintervall || undefined,
    status: body.status || "Aktiv",
    notizen: body.notizen || undefined,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await vertraegeDb.create(vertrag);
  await logEvent("anlage", `Vertrag (${saved.art}) „${saved.bezeichnung}" angelegt.`, {
    art: "Vertrag",
    id: saved.id,
  });
  await logAudit({ table: "vertraege", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ vertrag: saved });
}
