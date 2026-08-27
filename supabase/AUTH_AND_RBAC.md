# Durchgang 14 – Auth, Rollen/Rechte & Audit-Log (Phase 0, Teil 2)

Bezug: `Pflichtenheft_Immobilien_und_Liegenschaftsmanagement.odt`, §3
(Rollen und Berechtigungen) und §20 (SEC-001 bis SEC-005).

Wie bei der Geschäftsdaten-Migration (siehe `MIGRATION.md`) ist auch dieser
Durchgang **additiv und risikofrei**: Ohne die neuen Env-Variablen verhält
sich die App exakt wie zuvor — kein Login-Zwang, `requireUser()`/
`requirePermission()` geben einen permissiven System-Fallback-Nutzer mit
allen Rechten zurück (siehe `src/lib/auth.ts`).

## 1. Schema anlegen

Im Supabase SQL Editor, nach `schema.sql` und `schema_business.sql`:

```
supabase/schema_auth.sql
```

Idempotent, kann gefahrlos erneut ausgeführt werden.

## 2. Env-Variablen setzen

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # ANON key, NICHT der Service-Role-Key!
```

`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` müssen bereits gesetzt sein
(siehe `MIGRATION.md`) — `auth.ts` nutzt den Service-Role-Client, um Rollen/
Rechte zuverlässig unabhängig von RLS aufzulösen.

**Ab hier ist Login Pflicht** (siehe `src/middleware.ts`) für alle Routen
außer `/login`, `/marketing`, `/api/health`.

## 3. Ersten Nutzer anlegen

Auth-Nutzer entstehen aktuell über die Supabase Auth-Verwaltung selbst
(Dashboard → Authentication → Add User, oder `supabase.auth.admin.createUser`
serverseitig) — es gibt bewusst noch **keine Selbstregistrierung** in der
App, das wäre für ein internes Verwaltungssystem falsch. Beim ersten Login
legt der `handle_new_auth_user()`-Trigger automatisch eine Zeile in
`profiles` an — aber **ohne Rolle**. Ohne Rolle = ohne Rechte (Prinzip:
geschlossen by default).

Rolle zuweisen (SQL Editor, oder später über eine Admin-UI, siehe unten):

```sql
insert into user_roles (user_id, role_id)
values ('<profiles.id des Nutzers>', 'systemadministration');
```

Die neun Rollen-Slugs stehen in `schema_auth.sql`, Abschnitt 2, und in
`src/lib/rbac.ts` (`ROLE_LABELS`) für die UI.

## 4. Verifizieren

```sql
select p.email, array_agg(ur.role_id) as rollen
from profiles p
left join user_roles ur on ur.user_id = p.id
group by p.email;
```

Und funktional: `/login` aufrufen, anmelden, prüfen dass `/api/auth/me` die
erwarteten Rollen liefert und die TopBar das Nutzer-Badge zeigt.

## Was in diesem Durchgang gebaut wurde

- `profiles`, `roles` (9 Rollen aus §3), `user_roles`, `role_permissions`
  (Default-Rechtematrix aus §3 abgeleitet), `user_object_scope`
  (Liegenschafts-Scope), `audit_log` — alles in `supabase/schema_auth.sql`.
- `log_audit_change()`-Trigger, angehängt an die fünf Tabellen, die bereits
  per `DB_SUPABASE_MODULES` auf Postgres laufen können (liegenschaften,
  gebaeude, wohnungen, mieter, mietvertraege).
- `has_permission()`/`has_object_access()` als SQL-Funktionen + RLS-Policies
  für `liegenschaften` und `gebaeude` als Referenzmuster.
- `src/lib/auth.ts` (`getCurrentUser`, `requireUser`, `requirePermission`),
  `src/lib/rbac.ts` (Objekt-Scope-Prüfung, UI-Labels), `src/lib/audit.ts`
  (`logAudit()` für noch nicht auf Postgres migrierte Module).
- `src/middleware.ts`: Login-Pflicht, sobald konfiguriert.
- `/login`-Seite + `LoginForm` (E-Mail/Passwort über Supabase Auth),
  Logout-Route, Nutzer-Badge in der TopBar.
- Referenzimplementierung in `src/app/api/liegenschaften/route.ts`:
  `requirePermission()` + `logAudit()` — Vorlage zum Kopieren für alle
  weiteren API-Routen.

## Was NOCH NICHT passiert (bewusst außerhalb dieses Durchgangs)

- **Nur 2 von ~35 API-Routen sind auf `requirePermission()` umgestellt**
  (`GET`/`POST /api/liegenschaften`). Jede weitere Route (Gebäude, Wohnungen,
  Mieter, Verträge, Tickets, Buchhaltung, …) braucht denselben Zweizeiler am
  Anfang der Funktion — siehe die Kommentare in
  `src/app/api/liegenschaften/route.ts` als Vorlage. Das ist mechanische,
  aber notwendige Fleißarbeit für Phase 1.
- **RLS-Policies existieren nur für `liegenschaften` und `gebaeude`.** Die
  übrigen bereits migrierten Tabellen (`wohnungen`, `mieter`,
  `mietvertraege`) brauchen Policies nach demselben Muster, aber mit
  Subquery-Join auf `gebaeude.liegenschaft_id` (bzw. `wohnungen.gebaeude_id`
  für Mieter), weil sie keine direkte `liegenschaft_id`-Spalte haben.
- **Ticketbearbeiter-Einschränkung auf "nur zugewiesene Tickets"** ist NICHT
  über RBAC abgebildet (RBAC kennt nur Modul-Ebene). Muss zusätzlich in der
  jeweiligen API-Route geprüft werden (`ticket.handwerkerId === user.id`
  o.ä.), sobald das Ticketsystem selbst auf Postgres läuft.
- **Keine Admin-UI** für Nutzer-/Rollenverwaltung — aktuell nur über SQL
  Editor. Für den produktiven Rollout (§3, "Systemadministration: Benutzer,
  Rollen, ...") ist eine Oberfläche unter `/systemadministration/nutzer`
  der naheliegende nächste Schritt, mit denselben `requirePermission()`-
  Mustern abgesichert.
- **`logAudit()`-Fehlerverhalten ("fail open", siehe Kommentar in
  `audit.ts`)** ist eine bewusste Übergangsentscheidung, aber für den
  SEC-003-Nachweis in der Abnahme sollte das Team vor Produktivsetzung
  festlegen, ob ein fehlgeschlagenes Audit-Log den Schreibvorgang blockieren
  soll (strenger, aber riskanter bei Supabase-Ausfällen) oder wie jetzt nur
  gewarnt wird.
- **Objekt-Scope (`user_object_scope`) ist nur auf Liegenschafts-Ebene**,
  keine Verfeinerung auf Gebäude-/Raum-Ebene (Phase-1-Erweiterung, gleiche
  Tabellenform mit zusätzlicher Spalte).

## Nächster Schritt (Phase 1)

1. `requirePermission()` in alle verbleibenden API-Routen einziehen
   (mechanisch, Modul pro Modul, siehe Liste in
   `bkabr_Pflichtenheft_Analyse_und_Angebot.md` Abschnitt 2).
2. RLS-Policies für die restlichen bereits-migrierten Tabellen ergänzen.
3. Erste einfache Nutzerverwaltungs-UI (`/systemadministration/nutzer`).
4. Sobald ein neues Fachmodul (Flurstücke, Anlagen, Zähler, …) sein
   Postgres-Schema bekommt: `log_audit_change()`-Trigger UND RLS-Policy
   direkt mit anlegen, nicht nachträglich — spart einen zweiten Durchgang.
