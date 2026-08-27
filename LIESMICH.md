# Durchgang 16 – RBAC/Audit-Log Rollout: Ticket- und Mietvertrags-Restposten

Enthält NUR die in diesem Durchlauf geänderten Dateien.

## Enthalten

- `src/app/api/tickets/[id]/ablehnen/route.ts`
- `src/app/api/tickets/[id]/freigeben/route.ts`
- `src/app/api/tickets/[id]/zuweisen/route.ts`
- `src/app/api/tickets/[id]/nachrichten/route.ts`
- `src/app/api/mietvertraege/[id]/nachtrag/route.ts`
- `src/app/api/mietvertraege/analyze/route.ts`

Alle sechs: Modul `ticketsystem` bzw. `vertraege`, `write`-Recht
erforderlich (die beiden Mietvertrags-Routen sind reine KI-Analyse-
Endpunkte, die nichts persistieren, deswegen kein `logAudit()` nötig —
analog zu den bereits abgesicherten `analyze`-Routen in eigentuemer/
pm-vertrag).

## Einspielen

Dateien 1:1 an gleicher Stelle ersetzen, dann `npm run build` zur Kontrolle.

## Verifiziert vor Paketierung

- `npx tsc --noEmit` — sauber
- `npm run lint` — keine neuen Fehler (verbleibende `any`-Meldungen sind
  vorbestehend, an unveränderten Zeilen — geprüft)
- `npm run build` — vollständig erfolgreich

## Stand nach diesem Durchlauf

**Damit sind alle "kleineren Restposten" abgeschlossen.** Ticketsystem und
Mietverträge sind jetzt vollständig abgesichert (Basis-CRUD + alle
Unterrouten). 19 von ~35 API-Routen-Dateien insgesamt abgesichert.

## Noch offen (größere Blöcke)

- **Finanzen-Block**: Buchhaltung (9 Dateien), Abrechnungen (2), Kontoauszug
  (1) — größter verbleibender zusammenhängender Block, inhaltlicher Kern
  der ursprünglichen App
- **Investoren** (10 Dateien) — kein Pflichtenheft-Modul, niedrige Priorität
- **Dashboard/Export/Generate/Agent/Chat/Smart-Upload** — aggregierende/
  interne Endpunkte, brauchen ggf. nur `requireUser()` statt granularer
  Modul-Rechte
- RLS-Policies für alle neu abgesicherten Tabellen (bisher nur
  liegenschaften/gebaeude)
- Nutzerverwaltungs-UI
