import { NextRequest, NextResponse } from "next/server";
import { gebaeudeDb, logEvent } from "@/lib/db";
import { cascadeDeleteGebaeude } from "@/lib/cascade-delete";

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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cascade =
    req.nextUrl.searchParams.get("cascade") === "1" ||
    req.nextUrl.searchParams.get("cascade") === "true";

  if (cascade) {
    const result = await cascadeDeleteGebaeude(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, success: false }, { status: 404 });
    }
    return NextResponse.json({ success: true, cascade: true, report: result.report, name: result.name });
  }

  const bestehend = await gebaeudeDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await gebaeudeDb.remove(id);
  if (success) {
    await logEvent("loeschung", `Gebäude „${bestehend.name}" gelöscht.`, { art: "Gebäude", id });
  }
  return NextResponse.json({ success });
}
