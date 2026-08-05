import { NextRequest, NextResponse } from "next/server";
import { getNewsArtikel } from "@/lib/news";

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "true";
  const { artikel, ausCache, stand } = await getNewsArtikel(force);
  return NextResponse.json({ artikel, ausCache, stand });
}
