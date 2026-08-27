import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Nutzerverwaltung (§3 Pflichtenheft: "Systemadministration: Benutzer,
// Rollen, ..."). Bewusst KEINE Selbstregistrierung — Nutzer werden hier
// von einem Systemadministrator eingeladen (Supabase Auth Magic-Link-
// Einladung), analog zu einem internen Verwaltungssystem.

interface NutzerListe {
  id: string;
  email: string;
  displayName: string | null;
  aktiv: boolean;
  createdAt: string;
  rollen: string[];
}

export async function GET() {
  const auth = await requirePermission("systemadministration", "read");
  if (auth instanceof NextResponse) return auth;

  const sb = getSupabaseClient();
  if (!sb) return NextResponse.json({ error: "Supabase nicht konfiguriert." }, { status: 503 });

  const [{ data: profile, error: profileErr }, { data: rollenRows, error: rollenErr }] = await Promise.all([
    sb.from("profiles").select("id, email, display_name, aktiv, created_at").order("created_at", { ascending: false }),
    sb.from("user_roles").select("user_id, role_id"),
  ]);
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });
  if (rollenErr) return NextResponse.json({ error: rollenErr.message }, { status: 500 });

  const rollenByUser = new Map<string, string[]>();
  for (const r of rollenRows || []) {
    const list = rollenByUser.get(r.user_id) || [];
    list.push(r.role_id);
    rollenByUser.set(r.user_id, list);
  }

  const nutzer: NutzerListe[] = (profile || []).map((p) => ({
    id: p.id,
    email: p.email,
    displayName: p.display_name,
    aktiv: p.aktiv,
    createdAt: p.created_at,
    rollen: rollenByUser.get(p.id) || [],
  }));

  return NextResponse.json({ nutzer });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("systemadministration", "admin");
  if (auth instanceof NextResponse) return auth;

  const sb = getSupabaseClient();
  if (!sb) return NextResponse.json({ error: "Supabase nicht konfiguriert." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const rolleId = typeof body.rolleId === "string" ? body.rolleId : null;
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Gültige E-Mail-Adresse erforderlich." }, { status: 400 });
  }

  // Lädt per Magic Link ein — der Nutzer setzt beim ersten Klick sein
  // eigenes Passwort, ein Systemadministrator vergibt keine Passwörter.
  const { data, error } = await sb.auth.admin.inviteUserByEmail(email, {
    data: { display_name: body.displayName || email },
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const userId = data.user.id;

  // handle_new_auth_user()-Trigger legt das profiles-Row zeitnah an; hier
  // zusätzlich sicherheitshalber upserten, falls der Trigger noch nicht
  // durchgelaufen ist (Replikationsverzögerung).
  await sb.from("profiles").upsert(
    { id: userId, email, display_name: body.displayName || email },
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (rolleId) {
    await sb.from("user_roles").insert({ user_id: userId, role_id: rolleId, zugewiesen_von: auth.id });
  }

  await logAudit({ table: "profiles", recordId: userId, aktion: "insert", changedBy: auth.id, newData: { email, rolleId } });

  return NextResponse.json({ userId, email });
}
