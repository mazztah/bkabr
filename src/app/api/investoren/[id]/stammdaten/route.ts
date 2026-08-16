import { NextRequest, NextResponse } from "next/server";
import { investorenDb, logEvent } from "@/lib/db";
import { enrichInvestorStammdaten } from "@/lib/ai";
import { Investor } from "@/lib/types";

/**
 * Reichert die Stammdaten EINES Investors an (Websuche + strukturierter
 * Completion-Aufruf, siehe enrichInvestorStammdaten in ai.ts) und speichert
 * das Ergebnis. Bewusst pro Investor ein eigener Request statt eines
 * Sammel-Endpunkts: das UI (Investoren-Liste, "Stammdaten updaten"-Button)
 * ruft diese Route für jeden freigegebenen Investor einzeln nacheinander auf
 * und kann so den Fortschritt Investor für Investor anzeigen, statt auf einen
 * einzigen langen Batch-Request zu warten, der bei vielen Investoren leicht
 * in ein Server-Timeout laufen würde.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const investor = await investorenDb.get(id);
  if (!investor) return NextResponse.json({ error: "Investor nicht gefunden" }, { status: 404 });

  try {
    const { patch, kriterienErgebnis, score, quellen } = await enrichInvestorStammdaten(investor);
    const now = new Date().toISOString();
    const vollstaendigerPatch: Partial<Investor> = {
      ...patch,
      kriterienErgebnis,
      score,
      stammdatenAktualisiertAm: now,
      notizen: quellen.length
        ? [investor.notizen, `Stammdaten aktualisiert (${now.slice(0, 10)}) – Quellen: ${quellen.join(", ")}`]
            .filter(Boolean)
            .join("\n")
        : investor.notizen,
    };
    const updated = await investorenDb.update(id, vollstaendigerPatch);
    if (!updated) return NextResponse.json({ error: "Investor nicht gefunden" }, { status: 404 });

    await logEvent("aenderung", `Stammdaten für Investor „${updated.firma}" aktualisiert (Score ${score}/10).`, {
      art: "Investor",
      id,
    });
    return NextResponse.json({ investor: updated });
  } catch (e: any) {
    console.error("Investor Stammdaten-Update error:", e);
    return NextResponse.json({ error: e.message || "Stammdaten-Update fehlgeschlagen" }, { status: 500 });
  }
}
