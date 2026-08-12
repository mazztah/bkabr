import { NextRequest, NextResponse } from "next/server";
import { investorAnschreibenDb, logEvent } from "@/lib/db";
import { buildSchriftverkehrPdf } from "@/lib/pdf";
import { storeFile } from "@/lib/storage";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const doc = await investorAnschreibenDb.get(id);
    if (!doc) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

    const pdfBytes = await buildSchriftverkehrPdf(doc);
    const dateiName = `Anschreiben_${doc.investorFirma.replace(/[^\wäöüÄÖÜß \-]+/g, "").replace(/\s+/g, "_")}_${
      doc.nummer || doc.id.slice(0, 8)
    }.pdf`;
    const storedFileName = await storeFile(doc.id, dateiName, Buffer.from(pdfBytes));

    const updated = await investorAnschreibenDb.update(id, {
      status: "Versandbereit",
      finalStoredFileName: storedFileName,
      finalDateiName: dateiName,
      finalisiertAm: new Date().toISOString(),
    });

    await logEvent("anlage", `Anschreiben an „${doc.investorFirma}" als PDF fertiggestellt.`, {
      art: "InvestorAnschreiben",
      id,
    });

    return NextResponse.json({ anschreiben: updated });
  } catch (e: any) {
    console.error("Fertigstellen investor anschreiben error:", e);
    return NextResponse.json({ error: e.message || "Fertigstellen fehlgeschlagen" }, { status: 500 });
  }
}
