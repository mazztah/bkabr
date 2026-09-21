import { NextResponse } from "next/server";
import { getAgentHinweise } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const hinweise = await getAgentHinweise();
  return NextResponse.json({ hinweise });
}
