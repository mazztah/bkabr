import { NextRequest, NextResponse } from "next/server";
import { listAbrechnungen, liegenschaftenDb, gebaeudeDb, wohnungenDb } from "@/lib/db";
import { buildXlsx } from "@/lib/xlsx";

export const runtime = "nodejs";

/**
 * Exportiert die Rechnungen/Abrechnungen-Liste als XLSX, sortier- und
 * filterbar wie in Excel gewohnt (eine Zeile je Abrechnung inkl. Liegenschaft,
 * Gebäude, Wohnung, Zeitraum, Summe und Status).
 */
export async function GET(_req: NextRequest) {
  try {
    const [abrechnungen, liegenschaften, gebaeude, wohnungen] = await Promise.all([
      listAbrechnungen(),
      liegenschaftenDb.list(),
      gebaeudeDb.list(),
      wohnungenDb.list(),
    ]);

    const lgMap = new Map(liegenschaften.map((l) => [l.id, l.name]));
    const gbMap = new Map(gebaeude.map((g) => [g.id, g.name]));
    const whMap = new Map(wohnungen.map((w) => [w.id, w.bezeichnung]));

    const headers = [
      "Nummer",
      "Name",
      "Adresse",
      "Liegenschaft",
      "Gebäude",
      "Wohnung",
      "Zeitraum",
      "Objekttyp",
      "Status",
      "Gesamtsumme (€)",
      "Anzahl Dokumente",
      "Zuletzt geändert",
    ];

    const rows = abrechnungen.map((a) => [
      a.nummer || "",
      a.name,
      a.adresse,
      a.liegenschaftId ? lgMap.get(a.liegenschaftId) || "" : "",
      a.gebaeudeId ? gbMap.get(a.gebaeudeId) || "" : "",
      a.wohnungId ? whMap.get(a.wohnungId) || "" : "",
      a.zeitraum,
      a.objektTyp,
      a.status,
      Number(a.gesamtSumme.toFixed(2)),
      a.dokumente.length,
      new Date(a.updatedAt).toLocaleDateString("de-DE"),
    ]);

    const buffer = buildXlsx("Rechnungen", headers, rows);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Rechnungen_${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx"`,
      },
    });
  } catch (e: any) {
    console.error("XLSX-Export-Fehler:", e);
    return NextResponse.json({ error: e.message || "Export fehlgeschlagen" }, { status: 500 });
  }
}
