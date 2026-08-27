import { NextRequest, NextResponse } from "next/server";
import { flurstueckeDb, logEvent } from "@/lib/db";
import { Flurstueck } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("liegenschaften", "read");
  if (auth instanceof NextResponse) return auth;

  const liegenschaftId = req.nextUrl.searchParams.get("liegenschaftId") || undefined;
  const flurstuecke = await flurstueckeDb.list(liegenschaftId ? { liegenschaftId } : undefined);
  return NextResponse.json({ flurstuecke });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("liegenschaften", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  if (!body.liegenschaftId || !body.gemarkung || !body.flur || !body.flurstueckNummer) {
    return NextResponse.json(
      { error: "liegenschaftId, gemarkung, flur und flurstueckNummer sind erforderlich" },
      { status: 400 }
    );
  }
  const now = new Date().toISOString();
  const flurstueck: Flurstueck = {
    id: uid(),
    liegenschaftId: body.liegenschaftId,
    gemarkung: body.gemarkung,
    flur: body.flur,
    flurstueckNummer: body.flurstueckNummer,
    wirtschaftsart: body.wirtschaftsart || "Gebäude- und Freifläche",
    flaecheQm: typeof body.flaecheQm === "number" ? body.flaecheQm : undefined,
    grundbuchblatt: body.grundbuchblatt || undefined,
    grundbuchamt: body.grundbuchamt || undefined,
    notizen: body.notizen || undefined,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await flurstueckeDb.create(flurstueck);
  await logEvent(
    "anlage",
    `Flurstück „${saved.gemarkung} Flur ${saved.flur} Nr. ${saved.flurstueckNummer}" angelegt.`,
    { art: "Flurstueck", id: saved.id }
  );
  await logAudit({ table: "flurstuecke", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ flurstueck: saved });
}
