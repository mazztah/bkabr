import { NextRequest, NextResponse } from "next/server";
import { deleteAbrechnung, getAbrechnung, updateAbrechnung } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const abrechnung = await getAbrechnung(id);
  if (!abrechnung) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ abrechnung });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json();
  const abrechnung = await updateAbrechnung(id, patch);
  if (!abrechnung) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ abrechnung });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await deleteAbrechnung(id);
  return NextResponse.json({ success: ok });
}
