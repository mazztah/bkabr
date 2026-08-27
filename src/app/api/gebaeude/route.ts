import { NextRequest, NextResponse } from "next/server";
import { gebaeudeDb } from "@/lib/db";
import { Gebaeude } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("immobilien", "read");
  if (auth instanceof NextResponse) return auth;

  const liegenschaftId = req.nextUrl.searchParams.get("liegenschaftId") || undefined;
  const gebaeude = await gebaeudeDb.list(liegenschaftId ? { liegenschaftId } : undefined);
  return NextResponse.json({ gebaeude });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("immobilien", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  if (!body.liegenschaftId) {
    return NextResponse.json({ error: "liegenschaftId erforderlich" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const gebaeude: Gebaeude = {
    id: uid(),
    liegenschaftId: body.liegenschaftId,
    name: body.name || "Neues Gebäude",
    baujahr: body.baujahr,
    anzahlEinheiten: body.anzahlEinheiten,
    heizungsart: body.heizungsart,
    notizen: body.notizen,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await gebaeudeDb.create(gebaeude);
  await logAudit({ table: "gebaeude", recordId: saved.id, aktion: "insert", changedBy: auth.id, newData: saved });
  return NextResponse.json({ gebaeude: saved });
}
