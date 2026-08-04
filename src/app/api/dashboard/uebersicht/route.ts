import { NextResponse } from "next/server";
import { getDashboardUebersicht } from "@/lib/db";

export async function GET() {
  const uebersicht = await getDashboardUebersicht();
  return NextResponse.json({ uebersicht });
}
