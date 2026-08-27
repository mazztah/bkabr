import { NextRequest, NextResponse } from "next/server";
import { getBuchhaltungsUebersicht } from "@/lib/db";
import { requirePermission } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("finanzen", "read");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const von = searchParams.get("von") || undefined;
  const bis = searchParams.get("bis") || undefined;
  const uebersicht = await getBuchhaltungsUebersicht({ von, bis });
  return NextResponse.json({ uebersicht });
}
