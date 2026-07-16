import { NextRequest, NextResponse } from "next/server";
import { liegenschaftenDb } from "@/lib/db";
import { Liegenschaft } from "@/lib/types";
import { uid } from "@/lib/utils";

export async function GET() {
  const liegenschaften = await liegenschaftenDb.list();
  return NextResponse.json({ liegenschaften });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const liegenschaft: Liegenschaft = {
    id: uid(),
    name: body.name || "Neue Liegenschaft",
    strasse: body.strasse || "",
    hausnummer: body.hausnummer || "",
    plz: body.plz || "",
    ort: body.ort || "",
    grundstuecksflaeche: body.grundstuecksflaeche,
    flurstueck: body.flurstueck,
    notizen: body.notizen,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await liegenschaftenDb.create(liegenschaft);
  return NextResponse.json({ liegenschaft: saved });
}
