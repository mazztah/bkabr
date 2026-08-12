import { NextRequest, NextResponse } from "next/server";
import { investorenDb, investorStrategieBerichteDb, logEvent } from "@/lib/db";
import { generateInvestorStrategieBericht } from "@/lib/ai";
import { v4 as uuidv4 } from "uuid";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alle = await investorStrategieBerichteDb.list({ investorId: id });
  const sortiert = [...alle].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return NextResponse.json({ berichte: sortiert });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const investor = await investorenDb.get(id);
  if (!investor) return NextResponse.json({ error: "Investor nicht gefunden" }, { status: 404 });

  try {
    const body = await req.json().catch(() => ({}));
    const wirtschaftlicheZiele: string | undefined = body.wirtschaftlicheZiele || undefined;

    const { zusammenfassung, punkte } = await generateInvestorStrategieBericht(investor, wirtschaftlicheZiele);
    const now = new Date().toISOString();
    const bericht = await investorStrategieBerichteDb.create({
      id: uuidv4(),
      investorId: investor.id,
      investorFirma: investor.firma,
      wirtschaftlicheZiele,
      zusammenfassung,
      punkte,
      createdAt: now,
      updatedAt: now,
    });
    await logEvent("anlage", `Strategie-Bericht für „${investor.firma}" erstellt (${punkte.length} Punkte).`, {
      art: "InvestorStrategieBericht",
      id: bericht.id,
    });
    return NextResponse.json({ bericht }, { status: 201 });
  } catch (e: any) {
    console.error("Generate investor strategy error:", e);
    return NextResponse.json({ error: e.message || "Generierung fehlgeschlagen" }, { status: 500 });
  }
}
