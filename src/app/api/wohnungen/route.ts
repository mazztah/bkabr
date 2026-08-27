import { NextRequest, NextResponse } from "next/server";
import { wohnungenDb } from "@/lib/db";
import { Wohnung } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("immobilien", "read");
  if (auth instanceof NextResponse) return auth;

  const gebaeudeId = req.nextUrl.searchParams.get("gebaeudeId") || undefined;
  const wohnungen = await wohnungenDb.list(gebaeudeId ? { gebaeudeId } : undefined);
  return NextResponse.json({ wohnungen });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("immobilien", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  if (!body.gebaeudeId) {
    return NextResponse.json({ error: "gebaeudeId erforderlich" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const wohnung: Wohnung = {
    id: uid(),
    gebaeudeId: body.gebaeudeId,
    bezeichnung: body.bezeichnung || "Neue Einheit",
    typ: body.typ || "Wohnung",
    flaeche: body.flaeche,
    zimmer: body.zimmer,
    miteigentumsanteil: body.miteigentumsanteil,
    notizen: body.notizen,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await wohnungenDb.create(wohnung);
  await logAudit({ table: "wohnungen", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ wohnung: saved });
}
