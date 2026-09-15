import { NextRequest, NextResponse } from "next/server";
import { reservierungenDb, logEvent } from "@/lib/db";
import { Reservierung } from "@/lib/types";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

function ueberschneidenSich(aBeginn: string, aEnde: string, bBeginn: string, bEnde: string): boolean {
  return new Date(aBeginn).getTime() < new Date(bEnde).getTime() && new Date(bBeginn).getTime() < new Date(aEnde).getTime();
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("veranstaltungen", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const vorher = await reservierungenDb.get(id);
  if (!vorher) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const patch = await req.json().catch(() => ({}));

  // Nur wenn sich Zeitraum oder Fläche ändern UND die Reservierung nicht
  // storniert wird, erneut prüfen — Stornieren selbst darf nie an einer
  // Konfliktprüfung scheitern.
  const zeitraumAendertSich =
    (patch.beginn && patch.beginn !== vorher.beginn) || (patch.ende && patch.ende !== vorher.ende);
  if (zeitraumAendertSich && patch.status !== "Storniert") {
    const neuBeginn = patch.beginn || vorher.beginn;
    const neuEnde = patch.ende || vorher.ende;
    const andere = (
      await reservierungenDb.list({ veranstaltungsflaecheId: vorher.veranstaltungsflaecheId } as Partial<Reservierung>)
    ).filter((r) => r.id !== id && r.status !== "Storniert");
    const konflikte = andere.filter((r) => ueberschneidenSich(neuBeginn, neuEnde, r.beginn, r.ende));
    if (konflikte.length > 0) {
      return NextResponse.json(
        {
          error: `Neuer Zeitraum kollidiert mit ${konflikte.length} bestehende(r) Reservierung(en).`,
          konflikte: konflikte.map((k) => ({ id: k.id, titel: k.titel, beginn: k.beginn, ende: k.ende })),
        },
        { status: 409 }
      );
    }
  }

  const reservierung = await reservierungenDb.update(id, patch);
  if (!reservierung) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  if (patch.status === "Storniert" && vorher.status !== "Storniert") {
    await logEvent("aenderung", `Reservierung „${reservierung.titel}" storniert.`, {
      art: "Reservierung",
      id,
    });
  }
  await logAudit({ table: "reservierungen", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: reservierung });
  return NextResponse.json({ reservierung });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("veranstaltungen", "delete");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const bestehend = await reservierungenDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await reservierungenDb.remove(id);
  if (success) {
    await logEvent("loeschung", `Reservierung „${bestehend.titel}" gelöscht.`, { art: "Reservierung", id });
    await logAudit({ table: "reservierungen", recordId: id, aktion: "delete", changedBy: auth.id, oldData: bestehend });
  }
  return NextResponse.json({ success });
}
