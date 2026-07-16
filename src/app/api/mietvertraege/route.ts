import { NextRequest, NextResponse } from "next/server";
import { mietvertraegeDb } from "@/lib/db";
import { Mietvertrag } from "@/lib/types";
import { uid } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const wohnungId = req.nextUrl.searchParams.get("wohnungId") || undefined;
  const mietvertraege = await mietvertraegeDb.list(wohnungId ? ({ wohnungId } as any) : undefined);
  return NextResponse.json({ mietvertraege });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.wohnungId) {
    return NextResponse.json({ error: "wohnungId erforderlich" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const mietvertrag: Mietvertrag = {
    id: uid(),
    wohnungId: body.wohnungId,
    mieterId: body.mieterId,
    dateiName: body.dateiName || "Mietvertrag",
    storedFileName: body.storedFileName,
    mimeType: body.mimeType || "application/pdf",
    hochgeladenAm: now,
    sollMiete: body.sollMiete,
    nebenkostenVorauszahlung: body.nebenkostenVorauszahlung,
    kaution: body.kaution,
    mietbeginn: body.mietbeginn,
    mietende: body.mietende,
    status: body.status || "Entwurf",
    extraktText: body.extraktText,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await mietvertraegeDb.create(mietvertrag);
  return NextResponse.json({ mietvertrag: saved });
}
