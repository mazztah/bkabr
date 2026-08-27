import { NextRequest, NextResponse } from "next/server";
import { grundbuchDb, logEvent } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("liegenschaften", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const eintrag = await grundbuchDb.get(id);
  if (!eintrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ eintrag });
}

/**
 * Korrektur eines Eintrags (z.B. Tippfehler im Namen). Bewusst OHNE
 * Möglichkeit, geloeschtAm zu setzen — das "Röten" eines Grundbuch-Eintrags
 * läuft ausschließlich über POST /[id]/roeten, damit dafür immer ein Grund
 * dokumentiert wird (siehe dort).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("liegenschaften", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await grundbuchDb.get(id);
  if (!vorher) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  delete body.geloeschtAm;
  delete body.geloeschtGrund;

  const eintrag = await grundbuchDb.update(id, body);
  if (!eintrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logAudit({ table: "grundbuch_eintraege", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: eintrag });
  return NextResponse.json({ eintrag });
}

/**
 * Harte Löschung — NUR für echte Fehleingaben gedacht (z.B. versehentlich
 * doppelt angelegt), nicht für den regulären Wegfall eines Rechts. Der
 * reguläre Fall ("Recht ist erloschen/abgelöst") läuft über
 * POST /[id]/roeten, damit die Historie erhalten bleibt.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("liegenschaften", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await grundbuchDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await grundbuchDb.remove(id);
  if (success) {
    await logEvent(
      "loeschung",
      `Grundbuch-Eintrag Abt. ${bestehend.abteilung} „${bestehend.art}" (Fehleingabe) hart gelöscht.`,
      { art: "GrundbuchEintrag", id }
    );
    await logAudit({ table: "grundbuch_eintraege", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });
  }
  return NextResponse.json({ success });
}
