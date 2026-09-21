import { NextResponse } from "next/server";
import { pruefLaufDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth";

export async function GET() {
  const auth = await requirePermission("finanzen", "read");
  if (auth instanceof NextResponse) return auth;

  const alle = await pruefLaufDb.list();
  const letzter = [...alle].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
  return NextResponse.json({ lauf: letzter || null });
}
