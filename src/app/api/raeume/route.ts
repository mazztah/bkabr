import { NextRequest, NextResponse } from "next/server";
import { gebaeudeDb, raeumeDb } from "@/lib/db";
import { Raum } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("immobilien", "read");
  if (auth instanceof NextResponse) return auth;

  const gebaeudeId = req.nextUrl.searchParams.get("gebaeudeId") || undefined;
  const nurVeranstaltung = req.nextUrl.searchParams.get("veranstaltung") === "1";
  let raeume = await raeumeDb.list(gebaeudeId ? { gebaeudeId } : undefined);
  if (nurVeranstaltung) raeume = raeume.filter((r) => r.veranstaltungsflaeche);
  return NextResponse.json({ raeume });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("immobilien", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  if (!body.gebaeudeId || !body.bezeichnung || !body.etage) {
    return NextResponse.json({ error: "gebaeudeId, etage und bezeichnung sind erforderlich" }, { status: 400 });
  }
  const flaeche = Number(body.flaeche);
  if (!Number.isFinite(flaeche) || flaeche < 0) {
    return NextResponse.json({ error: "flaeche muss eine Zahl ≥ 0 sein" }, { status: 400 });
  }
  const gebaeude = await gebaeudeDb.get(body.gebaeudeId);
  if (!gebaeude) return NextResponse.json({ error: "Gebäude nicht gefunden" }, { status: 404 });

  // Dublettenvermeidung: gleiche laufende Nr. je Gebäude + Etage nicht doppelt vergeben
  const bestehend = await raeumeDb.list({ gebaeudeId: body.gebaeudeId, etage: body.etage } as Partial<Raum>);
  const naechsteNr = bestehend.reduce((m, r) => Math.max(m, r.laufendeNr || 0), 0) + 1;
  const laufendeNr = Number(body.laufendeNr) || naechsteNr;
  if (bestehend.some((r) => r.laufendeNr === laufendeNr)) {
    return NextResponse.json(
      { error: `Laufende Nr. ${laufendeNr} ist auf Etage „${body.etage}“ bereits vergeben` },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const raum: Raum = {
    id: uid(),
    gebaeudeId: body.gebaeudeId,
    liegenschaftId: gebaeude.liegenschaftId,
    etage: String(body.etage).trim(),
    laufendeNr,
    bezeichnung: String(body.bezeichnung).trim(),
    nutzung: body.nutzung || "Sonstige Nutzfläche",
    dinGruppe: body.dinGruppe || undefined,
    flaeche,
    veranstaltungsflaeche: !!body.veranstaltungsflaeche,
    zusammenhangGruppe: body.zusammenhangGruppe || undefined,
    notizen: body.notizen || undefined,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await raeumeDb.create(raum);
  await logAudit({ table: "raeume", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ raum: saved });
}
