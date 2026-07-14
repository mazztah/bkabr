import { NextResponse } from "next/server";
import { listAbrechnungen } from "@/lib/db";

function csvEscape(value: string | number): string {
  const str = String(value ?? "");
  if (/[;"\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export async function GET() {
  const all = await listAbrechnungen();
  const header = [
    "Name",
    "Adresse",
    "Objekttyp",
    "Zeitraum",
    "Gesamtsumme",
    "Status",
    "Version",
    "Erstellt",
    "Aktualisiert",
  ];

  const rows = all.map((a) =>
    [
      a.name,
      a.adresse,
      a.objektTyp,
      a.zeitraum,
      a.gesamtSumme.toFixed(2).replace(".", ","),
      a.status,
      a.version,
      a.createdAt,
      a.updatedAt,
    ]
      .map(csvEscape)
      .join(";")
  );

  const csv = [header.join(";"), ...rows].join("\n");
  // BOM für Excel-Kompatibilität (Umlaute)
  const bom = "\uFEFF";

  return new NextResponse(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="betriebskostenabrechnungen.csv"`,
    },
  });
}
