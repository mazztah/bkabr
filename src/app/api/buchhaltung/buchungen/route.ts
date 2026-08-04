import { NextRequest, NextResponse } from "next/server";
import { buchungenDb, logEvent } from "@/lib/db";
import { Buchung } from "@/lib/types";
import { uid } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const typ = searchParams.get("typ");
  const buchungen = await buchungenDb.list(typ ? ({ typ } as Partial<Buchung>) : undefined);
  return NextResponse.json({
    buchungen: [...buchungen].sort((a, b) => (a.datum < b.datum ? 1 : -1)),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (body.typ !== "Einnahme" && body.typ !== "Ausgabe") {
    return NextResponse.json({ error: "typ muss 'Einnahme' oder 'Ausgabe' sein" }, { status: 400 });
  }
  if (!body.kategorie || typeof body.betrag !== "number" || body.betrag <= 0) {
    return NextResponse.json(
      { error: "kategorie und ein positiver betrag sind erforderlich" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const buchung: Buchung = {
    id: uid(),
    datum: body.datum || now,
    typ: body.typ,
    kategorie: body.kategorie,
    betrag: Math.abs(body.betrag),
    beschreibung: body.beschreibung || undefined,
    liegenschaftId: body.liegenschaftId || undefined,
    belegTyp: body.belegTyp || "Manuell",
    belegId: body.belegId || undefined,
    createdAt: now,
    updatedAt: now,
  };

  const saved = await buchungenDb.create(buchung);
  await logEvent(
    "anlage",
    `${saved.typ} „${saved.kategorie}" über ${saved.betrag.toFixed(2)} € gebucht.`,
    { art: "Buchung", id: saved.id }
  );
  return NextResponse.json({ buchung: saved });
}
