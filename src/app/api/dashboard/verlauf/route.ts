import { NextResponse } from "next/server";
import { getDashboardVerlauf } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const verlauf = await getDashboardVerlauf();
  return NextResponse.json({ verlauf });
}
