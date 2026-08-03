import { NextRequest, NextResponse } from "next/server";
import { logEvent, mieterDb } from "@/lib/db";
import { cascadeDeleteMieter } from "@/lib/cascade-delete";

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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cascade =
    req.nextUrl.searchParams.get("cascade") === "1" ||
    req.nextUrl.searchParams.get("cascade") === "true";
  const withVertraege = req.nextUrl.searchParams.get("vertraege") !== "0";

  if (cascade || withVertraege) {
    const result = await cascadeDeleteMieter(id, withVertraege);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, success: false }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      cascade: true,
      report: result.report,
      name: result.name,
    });
  }

  const bestehend = await mieterDb.get(id);
  if (!bestehend) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const success = await mieterDb.remove(id);
  if (success) {
    await logEvent("loeschung", `Mieter „${bestehend.name}" gelöscht.`, { art: "Mieter", id });
  }
  return NextResponse.json({ success });
}
