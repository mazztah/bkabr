import { NextRequest, NextResponse } from "next/server";
import { investorenDb, logEvent } from "@/lib/db";
import { Investor, InvestorStatus } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: NextRequest) {
  const alle = await investorenDb.list();
  const status = req.nextUrl.searchParams.get("status");
  const sektor = req.nextUrl.searchParams.get("sektor")?.toLowerCase();
  const land = req.nextUrl.searchParams.get("land")?.toLowerCase();
  const query = req.nextUrl.searchParams.get("query")?.toLowerCase();

  let gefiltert = alle;
  if (status) gefiltert = gefiltert.filter((i) => i.status === status);
  if (sektor) gefiltert = gefiltert.filter((i) => i.sektoren.some((s) => s.toLowerCase().includes(sektor)));
  if (land) gefiltert = gefiltert.filter((i) => i.land.toLowerCase().includes(land));
  if (query) {
    gefiltert = gefiltert.filter((i) =>
      `${i.firma} ${i.ansprechpartnerName || ""} ${i.kurzprofil || ""}`.toLowerCase().includes(query)
    );
  }

  const sortiert = [...gefiltert].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return NextResponse.json({ investoren: sortiert });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const firma = String(body.firma || "").trim();
    const land = String(body.land || "").trim();
    if (!firma || !land) {
      return NextResponse.json({ error: "firma und land sind erforderlich" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const investor: Investor = {
      id: uuidv4(),
      firma,
      ansprechpartnerName: body.ansprechpartnerName || undefined,
      ansprechpartnerRolle: body.ansprechpartnerRolle || undefined,
      email: body.email || undefined,
      telefon: body.telefon || undefined,
      webseite: body.webseite || undefined,
      linkedinUrl: body.linkedinUrl || undefined,
      xingUrl: body.xingUrl || undefined,
      land,
      hub: body.hub || undefined,
      sektoren: Array.isArray(body.sektoren) ? body.sektoren : [],
      kurzprofil: body.kurzprofil || undefined,
      tickeGroesse: body.tickeGroesse || undefined,
      sprache: body.sprache || undefined,
      quelle: body.quelle || "Manuell angelegt",
      quelleDatum: body.quelleDatum || now,
      status: (body.status as InvestorStatus) || "freigegeben",
      notizen: body.notizen || undefined,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await investorenDb.create(investor);
    await logEvent("anlage", `Investor „${saved.firma}" manuell angelegt.`, { art: "Investor", id: saved.id });
    return NextResponse.json({ investor: saved }, { status: 201 });
  } catch (e: any) {
    console.error("Create investor error:", e);
    return NextResponse.json({ error: e.message || "Anlegen fehlgeschlagen" }, { status: 500 });
  }
}
