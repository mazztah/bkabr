import { NextRequest, NextResponse } from "next/server";
import { liegenschaftenDb } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const liegenschaft = await liegenschaftenDb.get(id);
  if (!liegenschaft) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ liegenschaft });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json();
  const liegenschaft = await liegenschaftenDb.update(id, patch);
  if (!liegenschaft) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ liegenschaft });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const success = await liegenschaftenDb.remove(id);
  return NextResponse.json({ success });
}
