import { NextRequest, NextResponse } from "next/server";
import { getBuchhaltungsUebersicht } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const von = searchParams.get("von") || undefined;
  const bis = searchParams.get("bis") || undefined;
  const uebersicht = await getBuchhaltungsUebersicht({ von, bis });
  return NextResponse.json({ uebersicht });
}
