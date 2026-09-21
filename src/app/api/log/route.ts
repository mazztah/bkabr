import { NextRequest, NextResponse } from "next/server";
import { listLog } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const suche = req.nextUrl.searchParams.get("q") || undefined;
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 200;
  const log = await listLog({ suche, limit });
  return NextResponse.json({ log });
}
