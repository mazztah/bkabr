import { NextRequest, NextResponse } from "next/server";
import { pruefLaufDb } from "@/lib/db";
import { wendeBefundAn } from "@/lib/pruefung";

/**
 * Wendet die vom Nutzer freigegebenen Befunde eines Prüflaufs an (Häkchen im
 * Dashboard – komplett oder nur einzelne). Body: { laufId, befundIds: string[] }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const laufId: string = body.laufId;
  const befundIds: string[] = body.befundIds || [];

  const lauf = await pruefLaufDb.get(laufId);
  if (!lauf) return NextResponse.json({ error: "Prüflauf nicht gefunden" }, { status: 404 });

  const ergebnisse: { befundId: string; ok: boolean; meldung: string }[] = [];

  for (const befundId of befundIds) {
    const befund = lauf.befunde.find((b) => b.id === befundId);
    if (!befund) continue;
    if (befund.status === "uebernommen") {
      ergebnisse.push({ befundId, ok: true, meldung: "Bereits übernommen." });
      continue;
    }
    if (!befund.vorschlag) {
      ergebnisse.push({
        befundId,
        ok: false,
        meldung:
          "Kein Auto-Patch. Chat: „Stammdaten nachtragen“ (Agent) oder Deep-Link nutzen.",
      });
      continue;
    }
    const { ok, meldung } = await wendeBefundAn(befund);
    befund.status = ok ? "uebernommen" : "offen";
    ergebnisse.push({ befundId, ok, meldung });
  }

  const aktualisiert = await pruefLaufDb.update(laufId, { befunde: lauf.befunde });

  return NextResponse.json({ lauf: aktualisiert, ergebnisse });
}
