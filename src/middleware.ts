// ============================================================================
// Middleware: Login-Pflicht + Session-Refresh (Phase 0, Durchgang 14)
// ============================================================================
// Solange NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY nicht gesetzt sind, tut diese
// Middleware NICHTS (kein Redirect) — identisch zum Fallback-Verhalten in
// auth.ts. Das Team schaltet Login-Pflicht bewusst ein, indem es die
// Env-Variablen setzt, nicht durch einen Code-Deploy. Siehe
// supabase/AUTH_AND_RBAC.md, Abschnitt "Rollout-Plan".

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/marketing", "/api/health"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Auth (noch) nicht konfiguriert → App verhält sich wie vor dieser Migration.
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Next.js 15.5 hat die Node.js-Middleware-Runtime stabilisiert (statt der
  // restriktiven Edge-Runtime). Wichtig für dieses Projekt: Ohne diese Zeile
  // zwingt allein die EXISTENZ von middleware.ts Next.js dazu, auch
  // src/instrumentation.ts für die Edge-Runtime zu kompilieren (Instrumentation
  // muss in Middleware-Runtime-Umgebungen mitlaufen können) — und die dort
  // dynamisch importierte Kette (scheduler.ts → db.ts/agent.ts → fs/path,
  // fly-logs.ts → nats → crypto) bricht den Build, weil Node-Builtins in der
  // Edge-Runtime nicht auflösbar sind. Mit runtime: "nodejs" bleibt die App
  // durchgehend im Node-Kontext, genau wie vor Einführung dieser Middleware.
  runtime: "nodejs",
  matcher: [
    // Alles außer statischen Assets und Next-internem Kram.
    "/((?!_next/static|_next/image|favicon|apple-touch-icon|site.webmanifest).*)",
  ],
};
