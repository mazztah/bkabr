import { NextRequest, NextResponse } from "next/server";
import { logEvent, pmVertraegeDb } from "@/lib/db";
import { PmVertrag } from "@/lib/types";
import { uid } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const liegenschaftId = req.nextUrl.searchParams.get("liegenschaftId") || undefined;
  const pmVertraege = await pmVertraegeDb.list(
    liegenschaftId ? ({ liegenschaftId } as any) : undefined
  );
  return NextResponse.json({ pmVertraege });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.liegenschaftId) {
    return NextResponse.json({ error: "liegenschaftId erforderlich" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const pmVertrag: PmVertrag = {
    id: uid(),
    liegenschaftId: body.liegenschaftId,
    dateiName: body.dateiName || "PM-Vertrag",
    storedFileName: body.storedFileName,
    mimeType: body.mimeType || "application/pdf",
    hochgeladenAm: now,
    verwalterName: body.verwalterName,
    auftraggeberName: body.auftraggeberName,
    honorarModell: body.honorarModell,
    honorarSatz: body.honorarSatz,
    leistungsumfang: body.leistungsumfang,
    laufzeitBeginn: body.laufzeitBeginn,
    laufzeitEnde: body.laufzeitEnde,
    kuendigungsfrist: body.kuendigungsfrist,
    status: body.status || "Entwurf",
    extraktText: body.extraktText,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await pmVertraegeDb.create(pmVertrag);
  await logEvent("anlage", `PM-Vertrag „${saved.dateiName}" angelegt.`, { art: "PM-Vertrag", id: saved.id });
  return NextResponse.json({ pmVertrag: saved });
}
