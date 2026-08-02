import { NextRequest, NextResponse } from "next/server";
import { ablageDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const alle = await ablageDb.list();
  const gefiltert = status ? alle.filter((a) => a.status === status) : alle;
  const sortiert = [...gefiltert].sort(
    (a, b) => new Date(b.hochgeladenAm).getTime() - new Date(a.hochgeladenAm).getTime()
  );
  return NextResponse.json({ ablage: sortiert });
}
