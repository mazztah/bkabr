import { NextRequest, NextResponse } from "next/server";
import { logEvent, mieterDb } from "@/lib/db";
import { Mieter } from "@/lib/types";
import { uid } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const wohnungId = req.nextUrl.searchParams.get("wohnungId") || undefined;
  const mieter = await mieterDb.list(wohnungId ? { wohnungId } : undefined);
  return NextResponse.json({ mieter });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.wohnungId) {
    return NextResponse.json({ error: "wohnungId erforderlich" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const mieter: Mieter = {
    id: uid(),
    wohnungId: body.wohnungId,
    name: body.name || "Neuer Mieter",
    email: body.email,
    telefon: body.telefon,
    mietbeginn: body.mietbeginn,
    mietende: body.mietende,
    kaltmiete: body.kaltmiete,
    nebenkostenVorauszahlung: body.nebenkostenVorauszahlung,
    notizen: body.notizen,
    sollIst: body.sollIst || [],
    createdAt: now,
    updatedAt: now,
  };
  const saved = await mieterDb.create(mieter);
  await logEvent("anlage", `Mieter „${saved.name}" angelegt.`, { art: "Mieter", id: saved.id });
  return NextResponse.json({ mieter: saved });
}
