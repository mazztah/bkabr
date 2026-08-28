import { NextRequest, NextResponse } from "next/server";
import { anlagenDb, anlagenWartungenDb, logEvent } from "@/lib/db";
import { AnlagenWartung } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("anlagen", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const historie = await anlagenWartungenDb.list({ anlageId: id } as Partial<AnlagenWartung>);
  historie.sort((a, b) => new Date(b.durchgefuehrtAm).getTime() - new Date(a.durchgefuehrtAm).getTime());
  return NextResponse.json({ historie });
}

/**
 * Legt einen Wartungs-/Prüfeintrag an. Wird zusätzlich eine
 * `naechsteFaelligkeit` mitgegeben, schreibt dieser Endpunkt automatisch
 * `Anlage.naechstePruefung` fort — so bleibt die Kalender-Frist (siehe
 * getAbgeleiteteKalenderEreignisse) ohne manuellen Zusatzschritt aktuell.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("anlagen", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const anlage = await anlagenDb.get(id);
  if (!anlage) return NextResponse.json({ error: "Anlage nicht gefunden" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!body.durchgefuehrtAm || !body.art) {
    return NextResponse.json({ error: "durchgefuehrtAm und art sind erforderlich" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const eintrag: AnlagenWartung = {
    id: uid(),
    anlageId: id,
    durchgefuehrtAm: body.durchgefuehrtAm,
    durchgefuehrtVon: body.durchgefuehrtVon || undefined,
    art: body.art,
    ergebnis: body.ergebnis || undefined,
    beschreibung: body.beschreibung || undefined,
    naechsteFaelligkeit: body.naechsteFaelligkeit || undefined,
    kosten: typeof body.kosten === "number" ? body.kosten : undefined,
    notizen: body.notizen || undefined,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await anlagenWartungenDb.create(eintrag);

  if (body.naechsteFaelligkeit) {
    await anlagenDb.update(id, {
      naechstePruefung: body.naechsteFaelligkeit,
      status: anlage.status === "Wartung fällig" ? "In Betrieb" : anlage.status,
    });
  }

  await logEvent(
    "anlage",
    `${saved.art} an „${anlage.bezeichnung}" dokumentiert (${saved.ergebnis || "ohne Ergebnisangabe"}).`,
    { art: "AnlagenWartung", id: saved.id }
  );
  await logAudit({ table: "anlagen_wartungen", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ eintrag: saved });
}
