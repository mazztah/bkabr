import { NextRequest, NextResponse } from "next/server";
import { investorAnschreibenDb, investorenDb, logEvent } from "@/lib/db";
import { generateInvestorAnschreiben } from "@/lib/ai";
import { buildInvestorBriefText } from "@/lib/investoren";
import { v4 as uuidv4 } from "uuid";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alle = await investorAnschreibenDb.list({ investorId: id });
  const sortiert = [...alle].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return NextResponse.json({ anschreiben: sortiert });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const investor = await investorenDb.get(id);
  if (!investor) return NextResponse.json({ error: "Investor nicht gefunden" }, { status: 404 });

  try {
    const body = await req.json().catch(() => ({}));
    const { betreff, body: text } = await generateInvestorAnschreiben(investor, {
      absenderName: body.absenderName || undefined,
      philosophie: body.philosophie || undefined,
      anlass: body.anlass || undefined,
    });
    const vollstaendigerText = buildInvestorBriefText(investor, betreff, text);
    const now = new Date().toISOString();
    const doc = await investorAnschreibenDb.create({
      id: uuidv4(),
      investorId: investor.id,
      investorFirma: investor.firma,
      betreff,
      text: vollstaendigerText,
      status: "Entwurf",
      quelle: "manuell",
      createdAt: now,
      updatedAt: now,
    });
    await logEvent("anlage", `Anschreiben-Entwurf für „${investor.firma}" erstellt.`, {
      art: "InvestorAnschreiben",
      id: doc.id,
    });
    return NextResponse.json({ anschreiben: doc }, { status: 201 });
  } catch (e: any) {
    console.error("Generate investor anschreiben error:", e);
    return NextResponse.json({ error: e.message || "Generierung fehlgeschlagen" }, { status: 500 });
  }
}
