"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface MeResponse {
  user: { email: string | null; displayName: string | null; rollen: string[]; isSystemFallback: boolean } | null;
}

export default function UserBadge() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse["user"]>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: MeResponse) => setMe(d.user))
      .finally(() => setLoaded(true));
  }, []);

  // Solange Auth nicht konfiguriert ist, liefert /api/auth/me den
  // System-Fallback-Nutzer (isSystemFallback) — dann kein Badge anzeigen,
  // damit die UI nicht behauptet, es gäbe einen echten Login.
  if (!loaded || !me || me.isSystemFallback) return null;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-sm">
      <span className="max-w-[12rem] truncate" title={me.email ?? undefined}>
        {me.displayName || me.email}
      </span>
      <button onClick={handleLogout} className="text-muted-foreground hover:text-foreground" title="Abmelden">
        ⏻
      </button>
    </div>
  );
}
