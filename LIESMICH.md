# Durchgang 17 – RBAC/Audit-Log Rollout: Finanzen-Block

Enthält NUR die in diesem Durchlauf geänderten Dateien (12 Stück).

## Enthalten (alle Modul `finanzen`)

- `src/app/api/abrechnungen/route.ts` + `[id]/route.ts`
- `src/app/api/buchhaltung/konten/route.ts` + `[id]/route.ts`
- `src/app/api/buchhaltung/buchungen/route.ts` + `[id]/route.ts` +
  `[id]/stornieren/route.ts`
- `src/app/api/buchhaltung/abrechnungskreise/route.ts` + `[id]/route.ts` +
  `vorschau/route.ts` (reine Berechnung, kein Persistieren → nur `read`)
- `src/app/api/buchhaltung/uebersicht/route.ts` (Dashboard-Aggregation,
  nur `read`)
- `src/app/api/kontoauszug/analyze/route.ts` (persistiert tatsächlich einen
  `Kontoauszug`-Datensatz, deswegen `write` + `logAudit()`, anders als die
  meisten anderen `analyze`-Routen, die nichts speichern)

## Einspielen

Dateien 1:1 an gleicher Stelle ersetzen, dann `npm run build` zur Kontrolle.

## Verifiziert vor Paketierung

- `npx tsc --noEmit` — sauber
- `npm run lint` — keine neuen Fehler (eine vorbestehende `any`-Meldung in
  unverändertem Code, geprüft)
- `npm run build` — vollständig erfolgreich

## Stand nach diesem Durchlauf

**31 von ~35 API-Routen-Dateien abgesichert.** Der komplette Kernumfang des
ursprünglichen Betriebskostenabrechnungs-Tools (Buchhaltung, Abrechnungen,
Kontoauszüge) läuft jetzt durch `requirePermission("finanzen", ...)`.

## Noch offen

- **Investoren** (10 Dateien) — kein Pflichtenheft-Modul, bewusst niedrige
  Priorität, aber für Vollständigkeit irgendwann fällig
- **Dashboard/Export/Generate/Agent/Chat/Smart-Upload** — aggregierende/
  interne Endpunkte, meist nur `requireUser()` statt granularer Modul-Rechte
  sinnvoll
- RLS-Policies für alle jetzt abgesicherten Tabellen (bisher nur
  liegenschaften/gebaeude haben welche — reines "defense in depth", da die
  eigentliche Durchsetzung ohnehin in der App-Schicht via
  `requirePermission()` passiert, siehe AUTH_AND_RBAC.md)
- Nutzerverwaltungs-UI (aktuell nur per SQL Editor)
