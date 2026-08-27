import { NextRequest, NextResponse } from "next/server";
import { grundbuchDb, logEvent } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

/**
 * "Röten" eines Grundbuch-Eintrags — der reguläre Weg, ein erloschenes oder
 * abgelöstes Recht zu beenden. Der Eintrag bleibt vollständig erhalten und
 * sichtbar (geloeschtAm + geloeschtGrund werden gesetzt), verschwindet aber
 * NICHT aus der Liste — genau das ist die geforderte Historisierung (LIE-007).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("liegenschaften", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await grundbuchDb.get(id);
  if (!vorher) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  if (vorher.geloeschtAm) {
    return NextResponse.json({ error: "Eintrag ist bereits gerötet." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const geloeschtAm = body.geloeschtAm || new Date().toISOString().slice(0, 10);

  const eintrag = await grundbuchDb.update(id, {
    geloeschtAm,
    geloeschtGrund: body.grund || undefined,
  });
  if (!eintrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  await logEvent(
    "aenderung",
    `Grundbuch-Eintrag Abt. ${eintrag.abteilung} „${eintrag.art}" (${eintrag.berechtigter}) gerötet.`,
    { art: "GrundbuchEintrag", id }
  );
  await logAudit({ table: "grundbuch_eintraege", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: eintrag });
  return NextResponse.json({ eintrag });
}
