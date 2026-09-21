import { NextRequest, NextResponse } from "next/server";
import { getNewsArtikel } from "@/lib/news";
import { requireUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const force = req.nextUrl.searchParams.get("force") === "true";
  const { artikel, ausCache, stand } = await getNewsArtikel(force);
  return NextResponse.json({ artikel, ausCache, stand });
}
