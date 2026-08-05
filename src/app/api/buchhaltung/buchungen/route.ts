import { NextRequest, NextResponse } from "next/server";
import { buchungenDb, buchungErstellen } from "@/lib/db";
import { Buchung } from "@/lib/types";

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

  const result = await buchungErstellen({
    typ: body.typ,
    kategorie: body.kategorie,
    betrag: body.betrag,
    datum: body.datum,
    beschreibung: body.beschreibung,
    liegenschaftId: body.liegenschaftId,
    belegTyp: body.belegTyp,
    belegId: body.belegId,
    belegFreitext: body.belegFreitext,
    rechnungsdaten: body.rechnungsdaten,
    abrechnungskreisId: body.abrechnungskreisId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.fehler }, { status: 400 });
  }
  return NextResponse.json({ buchung: result.buchung, split: result.split });
}
