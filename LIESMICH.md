# Durchgang 18 – Nutzerverwaltungs-UI (§3 Systemadministration)

## ⚠️ Wichtig: DB-Migration erneut ausführen (Bugfix)

`supabase/schema_auth.sql` ist enthalten und hat sich geändert — die
`systemadministration`-Rolle hatte im ursprünglichen Seed KEIN Recht auf
das Modul `systemadministration` selbst. Ohne diesen Fix hätten selbst
echte Admins einen 403-Fehler in der neuen Nutzerverwaltung bekommen. Die
Datei ist idempotent (`on conflict do nothing`) — **einfach im Supabase
SQL Editor komplett erneut ausführen**, das ist gefahrlos und ergänzt nur
die fehlende Zeile.

## Was ist neu

Endlich eine echte Oberfläche statt SQL Editor, um Nutzer einzuladen und
Rollen zuzuweisen — direkt umgesetzt aus Pflichtenheft §3
("Systemadministration: Benutzer, Rollen, ...").

**Neue Seite:** `/systemadministration/nutzer` (auch in der linken
Navigation verlinkt, neue Gruppe „Systemadministration")

- Liste aller Nutzer mit E-Mail, Rollen-Badges, Aktiv/Deaktiviert-Status
- „Nutzer einladen": versendet einen Supabase-Auth-Magic-Link (kein
  Passwort-Vergeben durch den Admin — der Nutzer setzt sein Passwort selbst
  beim ersten Login)
- Rollen direkt in der Liste zuweisen/entfernen (Dropdown „+ Rolle" /
  ✕-Button auf jedem Badge)
- Nutzer deaktivieren/reaktivieren (Klick auf den Status-Badge) — ein
  deaktivierter Nutzer kann sich laut `getCurrentUser()` in `auth.ts` nicht
  mehr einloggen

**Neue API-Routen** (alle `requirePermission("systemadministration", "admin")`,
außer GET-Liste = `"read"`):
- `GET/POST /api/systemadministration/nutzer`
- `PATCH /api/systemadministration/nutzer/[id]`
- `POST /api/systemadministration/nutzer/[id]/rollen`
- `DELETE /api/systemadministration/nutzer/[id]/rollen/[roleId]`

**Eingebauter Schutz:** Die letzte verbleibende
`systemadministration`-Rollenzuweisung im gesamten System kann nicht
entfernt werden — sonst könnte sich niemand mehr einloggen, um den Fehler
zu reparieren.

## Einspielen

1. `supabase/schema_auth.sql` im Supabase SQL Editor erneut ausführen
   (Bugfix, siehe oben).
2. Restliche Dateien 1:1 an gleicher Stelle im Repo ersetzen/ergänzen.
3. `npm run build` zur Kontrolle.

## Verifiziert vor Paketierung

- `npx tsc --noEmit` — sauber
- `npm run lint` — 5 Fehler in der neuen Seite gefunden UND behoben (any-
  Typen in catch-Blöcken, ein escapetes Anführungszeichen) — sauber danach
- `npm run build` — vollständig erfolgreich, `/systemadministration/nutzer`
  korrekt als statische Seite gebaut

## Stand nach diesem Durchlauf

Alle Kernanforderungen aus §3 (Rollen, Rechte, Nutzerverwaltung) sind jetzt
sowohl im Backend (RBAC-Durchsetzung in 31 API-Routen) als auch im Frontend
(bedienbare Oberfläche für Admins) umgesetzt.

## Noch offen

- Investoren-Modul (10 Dateien, kein Pflichtenheft-Bezug)
- Interne/aggregierende Endpunkte (Dashboard, Export, Agent-Chat) — eher
  `requireUser()` als granulare Rechte
- RLS-Policies für die meisten Tabellen (nur "defense in depth", da
  Durchsetzung ohnehin app-seitig passiert)
- Objekt-Scope-Zuweisung (`user_object_scope`, welche Liegenschaften ein
  Nutzer sehen darf) hat noch keine UI — nur die Rollen-Ebene ist bedienbar,
  nicht die feinere Liegenschafts-Einschränkung
- Damit ist Phase 0 aus der ursprünglichen Gap-Analyse
  (`bkabr_Pflichtenheft_Analyse_und_Angebot.md`) inhaltlich abgeschlossen —
  nächster sinnvoller Schritt wäre laut damaligem Plan **Phase 1**
  (Flurstücksverwaltung, Grundbuch, generisches Vertragsmodul)
