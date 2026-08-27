import { NextRequest, NextResponse } from "next/server";
import { grundbuchDb, logEvent } from "@/lib/db";
import { GrundbuchEintrag } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("liegenschaften", "read");
  if (auth instanceof NextResponse) return auth;

  const flurstueckId = req.nextUrl.searchParams.get("flurstueckId") || undefined;
  const eintraege = await grundbuchDb.list(flurstueckId ? { flurstueckId } : undefined);
  // Chronologisch: älteste zuerst innerhalb einer Abteilung, damit die
  // Historie (inkl. geröteter Einträge) nachvollziehbar lesbar bleibt.
  eintraege.sort((a, b) => new Date(a.eingetragenAm).getTime() - new Date(b.eingetragenAm).getTime());
  return NextResponse.json({ eintraege });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("liegenschaften", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  if (
    !body.flurstueckId ||
    !["I", "II", "III"].includes(body.abteilung) ||
    !body.art ||
    !body.berechtigter ||
    !body.eingetragenAm
  ) {
    return NextResponse.json(
      { error: "flurstueckId, abteilung ('I'/'II'/'III'), art, berechtigter und eingetragenAm sind erforderlich" },
      { status: 400 }
    );
  }
  const now = new Date().toISOString();
  const eintrag: GrundbuchEintrag = {
    id: uid(),
    flurstueckId: body.flurstueckId,
    abteilung: body.abteilung,
    lfdNummer: body.lfdNummer || "",
    art: body.art,
    berechtigter: body.berechtigter,
    betrag: typeof body.betrag === "number" ? body.betrag : undefined,
    waehrung: body.waehrung || (typeof body.betrag === "number" ? "EUR" : undefined),
    beschreibung: body.beschreibung || undefined,
    eingetragenAm: body.eingetragenAm,
    notizen: body.notizen || undefined,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await grundbuchDb.create(eintrag);
  await logEvent(
    "anlage",
    `Grundbuch-Eintrag Abt. ${saved.abteilung} „${saved.art}" (${saved.berechtigter}) angelegt.`,
    { art: "GrundbuchEintrag", id: saved.id }
  );
  await logAudit({ table: "grundbuch_eintraege", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ eintrag: saved });
}
