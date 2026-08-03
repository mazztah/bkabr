import { NextRequest, NextResponse } from "next/server";
import { logEvent, pmVertraegeDb } from "@/lib/db";
import { beendePmVertrag } from "@/lib/cascade-delete";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pmVertrag = await pmVertraegeDb.get(id);
  if (!pmVertrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ pmVertrag });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json();

  if (patch.status === "Beendet" || patch.beenden === true) {
    const result = await beendePmVertrag(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    const pmVertrag = await pmVertraegeDb.get(id);
    return NextResponse.json({
      pmVertrag,
      liegenschaftInaktiv: result.liegenschaft,
      beendet: true,
    });
  }

  const { beenden: _b, ...rest } = patch;
  const pmVertrag = await pmVertraegeDb.update(id, rest);
  if (!pmVertrag) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ pmVertrag });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bestehend = await pmVertraegeDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await pmVertraegeDb.remove(id);
  if (success) {
    await logEvent(
      "loeschung",
      `PM-Vertrag „${bestehend.dateiName || bestehend.verwalterName}" gelöscht.`,
      { art: "PM-Vertrag", id }
    );
  }
  return NextResponse.json({ success });
}
