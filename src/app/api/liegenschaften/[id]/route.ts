import { NextRequest, NextResponse } from "next/server";
import { liegenschaftenDb, logEvent } from "@/lib/db";
import { cascadeDeleteLiegenschaft, aktiviereLiegenschaft } from "@/lib/cascade-delete";

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
  if (patch.status === "aktiv") {
    await aktiviereLiegenschaft(id).catch(() => null);
  }
  return NextResponse.json({ liegenschaft });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cascade =
    req.nextUrl.searchParams.get("cascade") === "1" ||
    req.nextUrl.searchParams.get("cascade") === "true";

  if (cascade) {
    const result = await cascadeDeleteLiegenschaft(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, success: false }, { status: 404 });
    }
    return NextResponse.json({ success: true, cascade: true, report: result.report, name: result.name });
  }

  const bestehend = await liegenschaftenDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await liegenschaftenDb.remove(id);
  if (success) {
    await logEvent("loeschung", `Liegenschaft „${bestehend.name}" gelöscht (ohne Kaskade).`, {
      art: "Liegenschaft",
      id,
    });
  }
  return NextResponse.json({ success });
}
