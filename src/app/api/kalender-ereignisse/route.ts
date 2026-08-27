import { NextRequest, NextResponse } from "next/server";
import { getAbgeleiteteKalenderEreignisse, kalenderEreignisseDb, logEvent } from "@/lib/db";
import { KalenderEreignis } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const auth = await requirePermission("kalender", "read");
  if (auth instanceof NextResponse) return auth;

  const [ereignisse, abgeleitet] = await Promise.all([
    kalenderEreignisseDb.list(),
    getAbgeleiteteKalenderEreignisse(),
  ]);
  return NextResponse.json({ ereignisse, abgeleitet });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("kalender", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  if (!body.titel || !body.datum) {
    return NextResponse.json({ error: "titel und datum sind erforderlich" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const ereignis: KalenderEreignis = {
    id: uid(),
    titel: body.titel,
    beschreibung: body.beschreibung || undefined,
    datum: body.datum,
    datumEnde: body.datumEnde || undefined,
    ganztaegig: Boolean(body.ganztaegig),
    kategorie: body.kategorie || "Termin",
    liegenschaftId: body.liegenschaftId || undefined,
    dokumentIds: Array.isArray(body.dokumentIds) ? body.dokumentIds : [],
    erstelltVon: body.erstelltVon || undefined,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await kalenderEreignisseDb.create(ereignis);
  await logEvent("anlage", `Kalendertermin „${saved.titel}" angelegt.`, { art: "KalenderEreignis", id: saved.id });
  await logAudit({ table: "kalender_ereignisse", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ ereignis: saved });
}
