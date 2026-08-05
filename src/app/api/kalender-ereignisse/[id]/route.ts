import { NextRequest, NextResponse } from "next/server";
import { kalenderEreignisseDb, logEvent } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json().catch(() => ({}));
  const ereignis = await kalenderEreignisseDb.update(id, patch);
  if (!ereignis) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ ereignis });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const success = await kalenderEreignisseDb.remove(id);
  if (success) {
    await logEvent("loeschung", "Kalendertermin gelöscht.", { art: "KalenderEreignis", id });
  }
  return NextResponse.json({ success });
}
