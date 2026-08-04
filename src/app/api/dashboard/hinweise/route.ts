import { NextResponse } from "next/server";
import { getAgentHinweise } from "@/lib/db";

export async function GET() {
  const hinweise = await getAgentHinweise();
  return NextResponse.json({ hinweise });
}
