import { NextResponse } from "next/server";
import { isSupabaseConfigured, listRecentAgentRuns } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const konfiguriert = isSupabaseConfigured();
  const laeufe = konfiguriert ? await listRecentAgentRuns(10) : [];
  return NextResponse.json({ konfiguriert, laeufe });
}
