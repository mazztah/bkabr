import { NextRequest, NextResponse } from "next/server";
import { handwerkerDb, logEvent } from "@/lib/db";
import { Handwerker } from "@/lib/types";
import { uid } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const gewerk = req.nextUrl.searchParams.get("gewerk") || undefined;
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const handwerker = await handwerkerDb.list(
    gewerk || status ? ({ ...(gewerk ? { gewerk } : {}), ...(status ? { status } : {}) } as any) : undefined
  );
  return NextResponse.json({ handwerker });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.name || !body.gewerk) {
    return NextResponse.json({ error: "name und gewerk sind erforderlich" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const handwerker: Handwerker = {
    id: uid(),
    name: body.name,
    firma: body.firma,
    gewerk: body.gewerk,
    email: body.email,
    telefon: body.telefon,
    adresse: body.adresse,
    stundensatz: body.stundensatz ? Number(body.stundensatz) : undefined,
    status: body.status || "aktiv",
    lebenslauf: body.lebenslauf,
    qualifikationen: body.qualifikationen || [],
    notizen: body.notizen,
    dokumente: [],
    trackrecord: [],
    createdAt: now,
    updatedAt: now,
  };
  const saved = await handwerkerDb.create(handwerker);
  await logEvent("anlage", `Handwerker „${saved.name}" (${saved.gewerk}) angelegt.`, {
    art: "Handwerker",
    id: saved.id,
  });
  return NextResponse.json({ handwerker: saved });
}
