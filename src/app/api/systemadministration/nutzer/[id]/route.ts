import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("systemadministration", "admin");
  if (auth instanceof NextResponse) return auth;

  const sb = getSupabaseClient();
  if (!sb) return NextResponse.json({ error: "Supabase nicht konfiguriert." }, { status: 503 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.aktiv === "boolean") patch.aktiv = body.aktiv;
  if (typeof body.displayName === "string") patch.display_name = body.displayName;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Keine gültigen Felder übergeben." }, { status: 400 });
  }

  const { data: vorher } = await sb.from("profiles").select("*").eq("id", id).maybeSingle();
  const { data, error } = await sb.from("profiles").update(patch).eq("id", id).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  await logAudit({ table: "profiles", recordId: id, aktion: "update", changedBy: auth.id, oldData: vorher, newData: data });
  return NextResponse.json({ nutzer: data });
}
