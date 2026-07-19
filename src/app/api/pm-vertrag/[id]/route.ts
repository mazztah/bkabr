import { NextRequest, NextResponse } from "next/server";
import { pmVertraegeDb } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pmVertrag = await pmVertraegeDb.get(id);
  if (!pmVertrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ pmVertrag });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json();
  const pmVertrag = await pmVertraegeDb.update(id, patch);
  if (!pmVertrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ pmVertrag });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const success = await pmVertraegeDb.remove(id);
  return NextResponse.json({ success });
}
