// ============================================================================
// Auth-Helper für Route Handler (Phase 0, Durchgang 14)
// ============================================================================
// Zentrale Stelle, die "wer ist eingeloggt + was darf diese Person"
// beantwortet. API-Routen rufen requireUser() (oder requirePermission()) am
// Anfang der Funktion auf — Vorbild ist das bestehende Muster in
// db-supabase.ts (requireClient() wirft, statt still leere Daten
// zurückzugeben).
//
// WICHTIG für die Übergangsphase: Solange NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY
// nicht gesetzt sind (isAuthConfigured() === false), verhält sich
// requireUser() bewusst permissiv (gibt einen synthetischen "System"-Nutzer
// mit allen Rechten zurück) — genau wie die App vor dieser Migration lief.
// So bricht keine bestehende Umgebung, bis das Team Auth aktiv einschaltet.
// Sobald Auth konfiguriert ist, wird requireUser() strikt (401 bei fehlender
// Session). Diese Weiche ist zeitlich befristet gedacht — siehe
// AUTH_AND_RBAC.md, Abschnitt "Rollout-Plan".

import { NextResponse } from "next/server";
import { getServerSupabase, isAuthConfigured } from "./supabase-server";
import { getSupabaseClient } from "./supabase";

export type Modul =
  | "systemadministration"
  | "immobilien"
  | "liegenschaften"
  | "pacht_nutzung"
  | "veranstaltungen"
  | "vertraege"
  | "kalender"
  | "anlagen"
  | "ticketsystem"
  | "zaehler"
  | "dokumente"
  | "finanzen";

export type Aktion = "read" | "write" | "delete" | "admin";

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  rollen: string[];
  /** Set von "modul:aktion"-Strings, siehe hasPermission() in rbac.ts */
  rechte: Set<string>;
  /** null = unbeschränkt (kein Objekt-Scope hinterlegt), sonst erlaubte Liegenschaft-IDs */
  liegenschaftScope: string[] | null;
  /** true nur für den Übergangs-Systemnutzer, wenn Auth noch nicht konfiguriert ist */
  isSystemFallback: boolean;
}

let cachedFallbackUser: AuthUser | null = null;

function systemFallbackUser(): AuthUser {
  if (cachedFallbackUser) return cachedFallbackUser;
  const alleRechte = new Set<string>();
  const alleModule: Modul[] = [
    "systemadministration", "immobilien", "liegenschaften", "pacht_nutzung",
    "veranstaltungen", "vertraege", "kalender", "anlagen", "ticketsystem",
    "zaehler", "dokumente", "finanzen",
  ];
  for (const m of alleModule) for (const a of ["read", "write", "delete", "admin"] as Aktion[]) alleRechte.add(`${m}:${a}`);
  cachedFallbackUser = {
    id: "system",
    email: null,
    displayName: "System (Auth nicht konfiguriert)",
    rollen: ["systemadministration"],
    rechte: alleRechte,
    liegenschaftScope: null,
    isSystemFallback: true,
  };
  return cachedFallbackUser;
}

/** Liest die Session aus den Cookies. Gibt null zurück, wenn niemand eingeloggt ist. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isAuthConfigured()) return systemFallbackUser();

  const sb = await getServerSupabase();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  // Rollen/Rechte werden mit dem Service-Role-Client aufgelöst (nicht mit
  // dem Session-Client), weil RLS auf role_permissions zwar "authenticated
  // darf lesen" erlaubt, wir hier aber unabhängig von RLS-Details eine
  // verlässliche, vollständige Sicht brauchen — dasselbe Prinzip wie bei
  // den bestehenden Geschäftsdaten-CRUDs in db-supabase.ts.
  const admin = getSupabaseClient();
  if (!admin) return null;

  const [{ data: profile }, { data: rollenRows }, { data: scopeRows }] = await Promise.all([
    admin.from("profiles").select("display_name, aktiv").eq("id", user.id).maybeSingle(),
    admin.from("user_roles").select("role_id, role_permissions:role_id(modul,aktion)").eq("user_id", user.id),
    admin.from("user_object_scope").select("liegenschaft_id").eq("user_id", user.id),
  ]);

  if (profile && profile.aktiv === false) return null; // deaktivierter Nutzer

  const rollen = (rollenRows || []).map((r) => r.role_id as string);
  const rechte = new Set<string>();
  // role_permissions über den Join oben ist pro Rolle ein Array; robust
  // gegen unterschiedliche Supabase-Join-Rückgabeformen abfragen wir
  // stattdessen explizit nach, statt uns auf die Join-Form zu verlassen:
  if (rollen.length > 0) {
    const { data: permRows } = await admin
      .from("role_permissions")
      .select("modul, aktion")
      .in("role_id", rollen);
    for (const p of permRows || []) rechte.add(`${p.modul}:${p.aktion}`);
  }

  const liegenschaftScope = (scopeRows && scopeRows.length > 0)
    ? scopeRows.map((s) => s.liegenschaft_id as string)
    : null;

  return {
    id: user.id,
    email: user.email ?? null,
    displayName: profile?.display_name ?? user.email ?? null,
    rollen,
    rechte,
    liegenschaftScope,
    isSystemFallback: false,
  };
}

/**
 * Für API-Routen: liefert den Nutzer oder wirft eine NextResponse(401), die
 * die Route direkt zurückgeben kann:
 *
 *   const user = await requireUser();
 *   if (user instanceof NextResponse) return user;
 */
export async function requireUser(): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }
  return user;
}

/**
 * Für API-Routen: prüft Login UND ein konkretes Modul-Recht in einem
 * Aufruf. Gibt entweder den AuthUser oder eine fertige NextResponse
 * (401/403) zurück.
 *
 *   const auth = await requirePermission("liegenschaften", "write");
 *   if (auth instanceof NextResponse) return auth;
 */
export async function requirePermission(modul: Modul, aktion: Aktion): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  if (!user.rechte.has(`${modul}:${aktion}`) && !user.rechte.has(`${modul}:admin`)) {
    return NextResponse.json(
      { error: `Keine Berechtigung für ${modul}:${aktion}.` },
      { status: 403 }
    );
  }
  return user;
}
