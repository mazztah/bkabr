import { NextRequest, NextResponse } from "next/server";
import { berechneAbrechnungskreisSplit } from "@/lib/db";
import { requirePermission } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await requirePermission("finanzen", "read");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const { abrechnungskreisId, liegenschaftId, betrag } = body;
  if (!abrechnungskreisId || !liegenschaftId || typeof betrag !== "number") {
    return NextResponse.json(
      { error: "abrechnungskreisId, liegenschaftId und betrag (Zahl) sind erforderlich" },
      { status: 400 }
    );
  }
  const split = await berechneAbrechnungskreisSplit(abrechnungskreisId, liegenschaftId, betrag);
  return NextResponse.json({ split });
}
