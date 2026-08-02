import { NextRequest, NextResponse } from "next/server";
import { schriftverkehrDb } from "@/lib/db";
import { buildSchriftverkehrPdf } from "@/lib/pdf";
import { storeFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Erzeugt aus dem im Panel erstellten/editierten Anschreiben eine finale,
 * versandfertige PDF-Version inkl. Corporate-Design-Briefkopf (Logo etc., siehe
 * Vorlage) und legt diese dauerhaft ab. Der Entwurfstext bleibt unverändert
 * erhalten, sodass bei Bedarf erneut "fertiggestellt" werden kann (z.B. nach
 * einer manuellen Korrektur).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const doc = await schriftverkehrDb.get(id);
    if (!doc) {
      return NextResponse.json({ error: "Schreiben nicht gefunden" }, { status: 404 });
    }

    const pdfBytes = await buildSchriftverkehrPdf(doc);
    const safeName = (doc.betreff || doc.templateLabel || "Anschreiben")
      .replace(/[^\wäöüÄÖÜß \-]+/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 80);
    const fileName = `${safeName || "Anschreiben"}.pdf`;
    const storedFileName = await storeFile(doc.id, fileName, Buffer.from(pdfBytes));

    const updated = await schriftverkehrDb.update(id, {
      status: "Versandbereit",
      finalStoredFileName: storedFileName,
      finalDateiName: fileName,
      finalisiertAm: new Date().toISOString(),
    });

    return NextResponse.json({ dokument: updated });
  } catch (e: any) {
    console.error("Fertigstellen-Fehler:", e);
    return NextResponse.json({ error: e.message || "Fertigstellen fehlgeschlagen" }, { status: 500 });
  }
}
