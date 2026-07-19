import { NextRequest, NextResponse } from "next/server";
import { eigentuemerDb } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eigentuemer = await eigentuemerDb.get(id);
  if (!eigentuemer) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ eigentuemer });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json();
  const eigentuemer = await eigentuemerDb.update(id, patch);
  if (!eigentuemer) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ eigentuemer });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const success = await eigentuemerDb.remove(id);
  return NextResponse.json({ success });
}
