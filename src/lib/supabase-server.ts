// ============================================================================
// Supabase-Client für Server-Kontext (Route Handler, Server Components)
// ============================================================================
// Getrennt von src/lib/supabase.ts bewusst: Dort steht der SERVICE-ROLE-Client
// (umgeht RLS, für Agent-Gedächtnis und die bestehenden Geschäftsdaten-CRUDs
// gedacht). Hier steht der SESSION-gebundene Client (liest/schreibt die
// Supabase-Auth-Cookies), der weiß, WER gerade eingeloggt ist. Beide können
// parallel existieren und werden es auch dauerhaft: die API-Routen prüfen
// per requireUser()/hasPermission() (siehe auth.ts/rbac.ts) MIT diesem
// Client, WER etwas darf, und führen die eigentliche Datenoperation dann wie
// bisher über den Service-Role-Client aus (siehe schema_auth.sql-Kommentar
// zur RLS-Architektur).
//
// Läuft die App ohne NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY (z.B. weil die
// Auth-Phase in einer Umgebung noch nicht aktiviert ist), verhalten sich
// getServerSupabase()-Aufrufe wie "kein Nutzer eingeloggt" statt
// abzustürzen — genau wie bei fehlender Service-Role-Konfiguration in
// supabase.ts. So bleibt die App auch ohne Auth-Setup lauffähig, bis das
// Team bewusst auf "Login Pflicht" umschaltet (siehe AUTH_AND_RBAC.md).

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CookieOptions } from "@supabase/ssr";

export function isAuthConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Für Route Handler und Server Components (kann Cookies lesen UND schreiben). */
export async function getServerSupabase(): Promise<SupabaseClient | null> {
  if (!isAuthConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // In reinen Server Components (kein Route Handler/Action) darf
            // set() nicht aufgerufen werden — Middleware übernimmt in dem
            // Fall das Session-Refresh. Bewusst stiller no-op statt Crash.
          }
        },
      },
    }
  );
}
