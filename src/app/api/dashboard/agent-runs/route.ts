import { NextResponse } from "next/server";
import { isSupabaseConfigured, listRecentAgentRuns } from "@/lib/supabase";

export async function GET() {
  const konfiguriert = isSupabaseConfigured();
  const laeufe = konfiguriert ? await listRecentAgentRuns(10) : [];
  return NextResponse.json({ konfiguriert, laeufe });
}
