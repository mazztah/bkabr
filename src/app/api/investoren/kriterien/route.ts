import { NextResponse } from "next/server";
import { INVESTOR_KRITERIEN } from "@/lib/investoren";
import { requirePermission } from "@/lib/auth";

export async function GET() {
  const auth = await requirePermission("finanzen", "read");
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({ kriterien: INVESTOR_KRITERIEN });
}
