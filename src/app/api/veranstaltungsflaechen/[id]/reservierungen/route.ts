import { NextRequest, NextResponse } from "next/server";
import { veranstaltungsflaechenDb, reservierungenDb, logEvent } from "@/lib/db";
import { Reservierung } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

/** true, wenn sich [aBeginn, aEnde) und [bBeginn, bEnde) zeitlich überschneiden. */
function ueberschneidenSich(aBeginn: string, aEnde: string, bBeginn: string, bEnde: string): boolean {
  return new Date(aBeginn).getTime() < new Date(bEnde).getTime() && new Date(bBeginn).getTime() < new Date(aEnde).getTime();
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("veranstaltungen", "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const reservierungen = (
    await reservierungenDb.list({ veranstaltungsflaecheId: id } as Partial<Reservierung>)
  ).sort((a, b) => new Date(a.beginn).getTime() - new Date(b.beginn).getTime());
  return NextResponse.json({ reservierungen });
}

/**
 * Legt eine Reservierung an — mit verpflichtender Belegungs-/Konfliktprüfung
 * (VER-004/005): überschneidet sich der gewünschte Zeitraum mit einer
 * bereits bestehenden, nicht-stornierten Reservierung derselben Fläche,
 * wird die Anfrage mit 409 abgelehnt und die kollidierenden Reservierungen
 * werden mitgeliefert, statt sie stillschweigend zu überbuchen. Ein
 * bewusstes Überschreiben (Doppelbelegung z.B. für unterschiedliche Räume
 * derselben großen Fläche) ist NICHT vorgesehen — dafür müsste die
 * bestehende Reservierung zuerst storniert werden.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("veranstaltungen", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const flaeche = await veranstaltungsflaechenDb.get(id);
  if (!flaeche) return NextResponse.json({ error: "Veranstaltungsfläche nicht gefunden" }, { status: 404 });
  if (flaeche.status === "Gesperrt") {
    return NextResponse.json({ error: "Diese Fläche ist aktuell gesperrt und nicht buchbar." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.titel || !body.mieter || !body.beginn || !body.ende) {
    return NextResponse.json({ error: "titel, mieter, beginn und ende sind erforderlich" }, { status: 400 });
  }
  if (new Date(body.beginn).getTime() >= new Date(body.ende).getTime()) {
    return NextResponse.json({ error: "ende muss nach beginn liegen" }, { status: 400 });
  }

  const bestehende = (
    await reservierungenDb.list({ veranstaltungsflaecheId: id } as Partial<Reservierung>)
  ).filter((r) => r.status !== "Storniert");
  const konflikte = bestehende.filter((r) => ueberschneidenSich(body.beginn, body.ende, r.beginn, r.ende));

  if (konflikte.length > 0) {
    return NextResponse.json(
      {
        error: `Zeitraum kollidiert mit ${konflikte.length} bestehende(r) Reservierung(en).`,
        konflikte: konflikte.map((k) => ({ id: k.id, titel: k.titel, beginn: k.beginn, ende: k.ende, status: k.status })),
      },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const reservierung: Reservierung = {
    id: uid(),
    veranstaltungsflaecheId: id,
    titel: body.titel,
    mieter: body.mieter,
    kontakt: body.kontakt || undefined,
    beginn: body.beginn,
    ende: body.ende,
    status: body.status === "Angefragt" ? "Angefragt" : "Bestätigt",
    preis: typeof body.preis === "number" ? body.preis : flaeche.preisProTag,
    notizen: body.notizen || undefined,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await reservierungenDb.create(reservierung);
  await logEvent(
    "anlage",
    `Reservierung „${saved.titel}" für „${flaeche.bezeichnung}" angelegt (${saved.status}).`,
    { art: "Reservierung", id: saved.id }
  );
  await logAudit({ table: "reservierungen", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ reservierung: saved });
}
