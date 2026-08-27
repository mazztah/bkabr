import { NextRequest, NextResponse } from "next/server";
import { buchungStornieren } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("finanzen", "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const result = await buchungStornieren(id, body.grund);
  if (!result.ok) return NextResponse.json({ error: result.fehler }, { status: 400 });
  await logAudit({ table: "buchungen", recordId: id, aktion: "update", changedBy: auth.id, newData: result.storno });
  return NextResponse.json({ storno: result.storno });
}
