import { NextRequest, NextResponse } from "next/server";
import { logEvent, wohnungenDb } from "@/lib/db";
import { cascadeDeleteWohnung } from "@/lib/cascade-delete";

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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cascade =
    req.nextUrl.searchParams.get("cascade") === "1" ||
    req.nextUrl.searchParams.get("cascade") === "true";

  if (cascade) {
    const result = await cascadeDeleteWohnung(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, success: false }, { status: 404 });
    }
    return NextResponse.json({ success: true, cascade: true, report: result.report, name: result.name });
  }

  const bestehend = await wohnungenDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await wohnungenDb.remove(id);
  if (success) {
    await logEvent("loeschung", `Wohnung „${bestehend.bezeichnung}" gelöscht.`, {
      art: "Wohnung",
      id,
    });
  }
  return NextResponse.json({ success });
}
