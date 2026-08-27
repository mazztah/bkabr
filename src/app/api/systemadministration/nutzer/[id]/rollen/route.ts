import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("systemadministration", "admin");
  if (auth instanceof NextResponse) return auth;

  const sb = getSupabaseClient();
  if (!sb) return NextResponse.json({ error: "Supabase nicht konfiguriert." }, { status: 503 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const roleId = typeof body.roleId === "string" ? body.roleId : null;
  if (!roleId) return NextResponse.json({ error: "roleId erforderlich." }, { status: 400 });

  const { error } = await sb
    .from("user_roles")
    .insert({ user_id: id, role_id: roleId, zugewiesen_von: auth.id });
  // Doppelzuweisung (Primary-Key-Konflikt) ist kein Fehlerfall, sondern
  // schlicht "hat die Rolle schon" — idempotent behandeln.
  if (error && !error.message.includes("duplicate key")) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({ table: "user_roles", recordId: id, aktion: "insert", changedBy: auth.id, newData: { roleId } });
  return NextResponse.json({ ok: true });
}
