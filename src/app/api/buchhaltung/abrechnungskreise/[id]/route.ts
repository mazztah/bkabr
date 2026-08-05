import { NextRequest, NextResponse } from "next/server";
import { abrechnungskreiseDb, logEvent } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json().catch(() => ({}));
  const kreis = await abrechnungskreiseDb.update(id, patch);
  if (!kreis) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ kreis });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const success = await abrechnungskreiseDb.remove(id);
  if (success) {
    await logEvent("loeschung", "Abrechnungskreis gelöscht.", { art: "Abrechnungskreis", id });
  }
  return NextResponse.json({ success });
}
