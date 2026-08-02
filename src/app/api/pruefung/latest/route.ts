import { NextResponse } from "next/server";
import { pruefLaufDb } from "@/lib/db";

export async function GET() {
  const alle = await pruefLaufDb.list();
  const letzter = [...alle].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
  return NextResponse.json({ lauf: letzter || null });
}
