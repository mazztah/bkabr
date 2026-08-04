import { NextResponse } from "next/server";
import { getDashboardVerlauf } from "@/lib/db";

export async function GET() {
  const verlauf = await getDashboardVerlauf();
  return NextResponse.json({ verlauf });
}
