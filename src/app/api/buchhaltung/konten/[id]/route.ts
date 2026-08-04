import { NextRequest, NextResponse } from "next/server";
import { kontenDb, logEvent } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = await req.json().catch(() => ({}));
  const konto = await kontenDb.update(id, patch);
  if (!konto) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ konto });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const success = await kontenDb.remove(id);
  if (success) {
    await logEvent("loeschung", "Konto gelöscht.", { art: "Konto", id });
  }
  return NextResponse.json({ success });
}
