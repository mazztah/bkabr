import { NextRequest, NextResponse } from "next/server";
import { createAbrechnung, listAbrechnungen } from "@/lib/db";
import { Abrechnung } from "@/lib/types";
import { uid } from "@/lib/utils";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const auth = await requirePermission("finanzen", "read");
  if (auth instanceof NextResponse) return auth;

  const abrechnungen = await listAbrechnungen();
  return NextResponse.json({ abrechnungen });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("finanzen", "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const abrechnung: Abrechnung = {
    id: uid(),
    name: body.name || "Neue Abrechnung",
    adresse: body.adresse || "",
    objektTyp: body.objektTyp || "Wohnung",
    zeitraum: body.zeitraum || "",
    gesamtSumme: body.gesamtSumme || 0,
    status: "Rohdaten",
    dokumente: [],
    workspace: { positionen: [], mieteinnahmen: 0, nebenkosten: 0 },
    chat: [],
    version: 1,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
  await createAbrechnung(abrechnung);
  await logAudit({ table: "abrechnungen", recordId: abrechnung.id, aktion: "insert", changedBy: auth.id, newData: abrechnung });
  return NextResponse.json({ abrechnung });
}
