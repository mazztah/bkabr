import { NextRequest, NextResponse } from "next/server";
import { investorAnschreibenDb } from "@/lib/db";
import { InvestorAnschreibenStatus } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await investorAnschreibenDb.get(id);
  if (!doc) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ anschreiben: doc });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const allowed: Partial<{ text: string; betreff: string; status: InvestorAnschreibenStatus }> = {};
    if (typeof body.text === "string") allowed.text = body.text;
    if (typeof body.betreff === "string") allowed.betreff = body.betreff;
    if (["Entwurf", "Versandbereit", "Versendet", "Archiviert"].includes(body.status)) {
      allowed.status = body.status;
    }
    const updated = await investorAnschreibenDb.update(id, allowed);
    if (!updated) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    return NextResponse.json({ anschreiben: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await investorAnschreibenDb.remove(id);
  if (!ok) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
