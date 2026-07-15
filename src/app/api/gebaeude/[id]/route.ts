import { NextRequest, NextResponse } from "next/server";
import { gebaeudeDb } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gebaeude = await gebaeudeDb.get(id);
  if (!gebaeude) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ gebaeude });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json();
  const gebaeude = await gebaeudeDb.update(id, patch);
  if (!gebaeude) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ gebaeude });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const success = await gebaeudeDb.remove(id);
  return NextResponse.json({ success });
}
