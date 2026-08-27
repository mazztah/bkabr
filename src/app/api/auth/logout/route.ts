import { NextResponse } from "next/server";
import { getServerSupabase, isAuthConfigured } from "@/lib/supabase-server";

export async function POST() {
  if (!isAuthConfigured()) return NextResponse.json({ ok: true });
  const sb = await getServerSupabase();
  await sb?.auth.signOut();
  return NextResponse.json({ ok: true });
}
