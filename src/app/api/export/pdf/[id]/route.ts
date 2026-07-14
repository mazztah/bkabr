import { NextRequest, NextResponse } from "next/server";
import { getAbrechnung } from "@/lib/db";
import { buildAbrechnungPdf } from "@/lib/pdf";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const abr = await getAbrechnung(id);
  if (!abr) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const pdfBytes = await buildAbrechnungPdf(abr);
  const fileName = `${abr.name.replace(/[^a-z0-9äöüß_-]+/gi, "_")}.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
