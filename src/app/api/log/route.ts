import { NextRequest, NextResponse } from "next/server";
import { listLog } from "@/lib/db";

export async function GET(req: NextRequest) {
  const suche = req.nextUrl.searchParams.get("q") || undefined;
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 200;
  const log = await listLog({ suche, limit });
  return NextResponse.json({ log });
}
