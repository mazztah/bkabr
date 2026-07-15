import { NextRequest, NextResponse } from "next/server";
import { mieterDb } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mieter = await mieterDb.get(id);
  if (!mieter) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ mieter });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json();
  const mieter = await mieterDb.update(id, patch);
  if (!mieter) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ mieter });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const success = await mieterDb.remove(id);
  return NextResponse.json({ success });
}
