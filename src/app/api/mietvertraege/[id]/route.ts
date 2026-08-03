import { NextRequest, NextResponse } from "next/server";
import { logEvent, mietvertraegeDb } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mietvertrag = await mietvertraegeDb.get(id);
  if (!mietvertrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ mietvertrag });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json();
  const mietvertrag = await mietvertraegeDb.update(id, patch);
  if (!mietvertrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ mietvertrag });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bestehend = await mietvertraegeDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await mietvertraegeDb.remove(id);
  if (success) {
    await logEvent(
      "loeschung",
      `Mietvertrag „${bestehend.dateiName}" gelöscht.`,
      { art: "Mietvertrag", id }
    );
  }
  return NextResponse.json({ success });
}
