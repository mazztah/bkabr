import { NextRequest, NextResponse } from "next/server";
import { wohnungenDb } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wohnung = await wohnungenDb.get(id);
  if (!wohnung) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ wohnung });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json();
  const wohnung = await wohnungenDb.update(id, patch);
  if (!wohnung) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ wohnung });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const success = await wohnungenDb.remove(id);
  return NextResponse.json({ success });
}
