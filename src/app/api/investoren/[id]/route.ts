import { NextRequest, NextResponse } from "next/server";
import { investorenDb, logEvent } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const investor = await investorenDb.get(id);
  if (!investor) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ investor });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json();
  const investor = await investorenDb.update(id, patch);
  if (!investor) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  await logEvent("aenderung", `Investor „${investor.firma}" bearbeitet.`, { art: "Investor", id });
  return NextResponse.json({ investor });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const investor = await investorenDb.get(id);
  const success = await investorenDb.remove(id);
  if (success && investor) {
    await logEvent("loeschung", `Investor „${investor.firma}" gelöscht.`, { art: "Investor", id });
  }
  return NextResponse.json({ success });
}
