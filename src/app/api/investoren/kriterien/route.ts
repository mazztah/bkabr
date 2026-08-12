import { NextResponse } from "next/server";
import { INVESTOR_KRITERIEN } from "@/lib/investoren";

export async function GET() {
  return NextResponse.json({ kriterien: INVESTOR_KRITERIEN });
}
