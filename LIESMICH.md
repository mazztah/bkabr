# Durchgang 14 – Auth, Rollen/Rechte & Audit-Log (Phase 0, Teil 2)

Dieses Paket enthält alle in diesem Durchlauf neuen/geänderten Dateien,
mit Ordnerstruktur relativ zum Repo-Root von `mazztah/bkabr`.

## Einspielen

Entpacken und die Ordner direkt in dein lokales Repo kopieren/überschreiben
(z.B. `cp -r durchgang14/* /pfad/zu/bkabr/`), dann:

```bash
npm install          # zieht @supabase/ssr (in package.json ergänzt)
```

Anschließend `supabase/schema_auth.sql` im Supabase SQL Editor ausführen
und die neuen Env-Variablen aus `.env.example` setzen — Details in
`supabase/AUTH_AND_RBAC.md`.

## Enthalten

**Neu:**
- `supabase/schema_auth.sql`, `supabase/AUTH_AND_RBAC.md`
- `src/lib/auth.ts`, `rbac.ts`, `audit.ts`, `supabase-server.ts`, `supabase-browser.ts`
- `src/middleware.ts`
- `src/app/login/page.tsx`, `src/components/LoginForm.tsx`, `src/components/UserBadge.tsx`
- `src/app/api/auth/logout/route.ts`, `src/app/api/auth/me/route.ts`

**Geändert (Rechteprüfung + Audit-Log eingezogen):**
- `src/app/api/liegenschaften/route.ts` (Referenzmuster)
- `src/app/api/gebaeude/route.ts` + `[id]/route.ts`
- `src/app/api/wohnungen/route.ts` + `[id]/route.ts`
- `src/app/api/mieter/route.ts` + `[id]/route.ts`
- `src/app/api/mietvertraege/route.ts` + `[id]/route.ts`
- `src/app/api/kalender-ereignisse/route.ts` + `[id]/route.ts`
- `src/app/api/tickets/route.ts` + `[id]/route.ts`
- `src/app/api/ablage/route.ts` + `[id]/route.ts`
- `src/components/LeftNav.tsx`, `GlobalTopBar.tsx`, `AppContentFrame.tsx`,
  `MobileNavToggle.tsx`, `ChatWindow.tsx` (blenden Nav/TopBar/Chat auf
  `/login` aus, TopBar zeigt Nutzer-Badge)
- `package.json`, `.env.example`

**Nicht enthalten** (unverändert von diesem Durchlauf, aber Build-Artefakte,
die nicht kopiert werden sollten): `package-lock.json`,
`tsconfig.tsbuildinfo` — bitte lokal `npm install` laufen lassen, statt die
Lockfile zu überschreiben, falls dein lokaler Stand seitdem abweicht.

## Verifiziert vor Paketierung

- `npx tsc --noEmit` — sauber
- `npm run lint` — keine neuen Fehler (alle verbleibenden Meldungen sind
  vorbestehender Code, unangetastet)
- Bekannter, vorbestehender Build-Fehler (nats/instrumentation.ts) besteht
  unabhängig von diesen Änderungen weiter — siehe AUTH_AND_RBAC.md.

## Offen für den nächsten Durchlauf

Siehe „Nächster Schritt" in `supabase/AUTH_AND_RBAC.md`: verbleibende
API-Routen (Eigentümer, PM-Verträge, Schriftverkehr, Buchhaltung,
Abrechnungen, Handwerker, …) brauchen dasselbe `requirePermission()`-Muster,
plus RLS-Policies für die restlichen migrierten Tabellen und eine einfache
Nutzerverwaltungs-UI.
