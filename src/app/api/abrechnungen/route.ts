import { NextRequest, NextResponse } from "next/server";
import { createAbrechnung, listAbrechnungen } from "@/lib/db";
import { Abrechnung } from "@/lib/types";
import { uid } from "@/lib/utils";

export async function GET() {
  const abrechnungen = await listAbrechnungen();
  return NextResponse.json({ abrechnungen });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const abrechnung: Abrechnung = {
    id: uid(),
    name: body.name || "Neue Abrechnung",
    adresse: body.adresse || "",
    objektTyp: body.objektTyp || "Wohnung",
    zeitraum: body.zeitraum || "",
    gesamtSumme: body.gesamtSumme || 0,
    status: "Rohdaten",
    dokumente: [],
    workspace: { positionen: [], mieteinnahmen: 0, nebenkosten: 0 },
    chat: [],
    version: 1,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
  await createAbrechnung(abrechnung);
  return NextResponse.json({ abrechnung });
}
