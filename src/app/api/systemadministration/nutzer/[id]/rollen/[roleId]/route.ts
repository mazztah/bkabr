import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  const auth = await requirePermission("systemadministration", "admin");
  if (auth instanceof NextResponse) return auth;

  const sb = getSupabaseClient();
  if (!sb) return NextResponse.json({ error: "Supabase nicht konfiguriert." }, { status: 503 });

  const { id, roleId } = await params;

  // Schutz gegen versehentliches Selbst-Aussperren: die letzte
  // systemadministration-Rolle im gesamten System darf nicht entfernt
  // werden, sonst kann sich niemand mehr einloggen, um es zu reparieren.
  if (roleId === "systemadministration") {
    const { count } = await sb
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role_id", "systemadministration");
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Die letzte Systemadministration-Rolle kann nicht entfernt werden." },
        { status: 400 }
      );
    }
  }

  const { error } = await sb.from("user_roles").delete().eq("user_id", id).eq("role_id", roleId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({ table: "user_roles", recordId: id, aktion: "delete", changedBy: auth.id, oldData: { roleId } });
  return NextResponse.json({ ok: true });
}
