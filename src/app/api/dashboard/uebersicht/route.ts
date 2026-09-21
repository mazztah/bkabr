import { NextResponse } from "next/server";
import { getDashboardUebersicht } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const uebersicht = await getDashboardUebersicht();
  return NextResponse.json({ uebersicht });
}
