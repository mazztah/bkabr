import { NextRequest, NextResponse } from "next/server";
import { abrechnungskreiseDb, logEvent, seedStandardAbrechnungskreise } from "@/lib/db";
import { Abrechnungskreis } from "@/lib/types";
import { uid } from "@/lib/utils";

export async function GET() {
  const kreise = await abrechnungskreiseDb.list();
  return NextResponse.json({ kreise });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (body.seed === true) {
    const kreise = await seedStandardAbrechnungskreise();
    return NextResponse.json({ kreise });
  }

  if (!body.name || !body.umlageschluessel) {
    return NextResponse.json(
      { error: "name und umlageschluessel sind erforderlich" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const kreis: Abrechnungskreis = {
    id: uid(),
    name: body.name,
    beschreibung: body.beschreibung || undefined,
    umlageschluessel: body.umlageschluessel,
    liegenschaftId: body.liegenschaftId || undefined,
    wohnungIds: Array.isArray(body.wohnungIds) ? body.wohnungIds : undefined,
    istStandard: false,
    createdAt: now,
    updatedAt: now,
  };

  const saved = await abrechnungskreiseDb.create(kreis);
  await logEvent("anlage", `Abrechnungskreis „${saved.name}" angelegt.`, {
    art: "Abrechnungskreis",
    id: saved.id,
  });
  return NextResponse.json({ kreis: saved });
}
