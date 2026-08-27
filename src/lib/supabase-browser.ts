// Browser-Client (Client Components) für Login/Logout. NUR der ANON key
// darf hier je landen — niemals SUPABASE_SERVICE_ROLE_KEY ins Frontend-Bundle.

import { createBrowserClient } from "@supabase/ssr";

export function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY fehlen — Login ist ohne diese Variablen nicht möglich."
    );
  }
  return createBrowserClient(url, anonKey);
}
