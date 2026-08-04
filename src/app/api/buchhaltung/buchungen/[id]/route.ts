import { NextRequest, NextResponse } from "next/server";
import { buchungenDb, logEvent } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json().catch(() => ({}));
  const buchung = await buchungenDb.update(id, patch);
  if (!buchung) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ buchung });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const success = await buchungenDb.remove(id);
  if (success) {
    await logEvent("loeschung", "Buchung gelöscht.", { art: "Buchung", id });
  }
  return NextResponse.json({ success });
}
