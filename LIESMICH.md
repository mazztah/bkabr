# Durchgang 15 – RBAC/Audit-Log Rollout: Eigentümer, PM-Vertrag, Handwerker, Schriftverkehr

Enthält NUR die in diesem Durchlauf geänderten Dateien. Vorherige Durchläufe
(Fundament, erste 9 API-Routen) siehe die vorigen Zips.

## Enthalten

- `src/app/api/liegenschaften/[id]/route.ts` — **Lückenschluss**: war im
  vorigen Durchgang übersehen worden (nur die Liste-Route war abgesichert,
  nicht GET/PATCH/DELETE für eine einzelne Liegenschaft).
- `src/app/api/eigentuemer/route.ts` + `[id]/route.ts` + `analyze/route.ts`
  (Modul: immobilien)
- `src/app/api/pm-vertrag/route.ts` + `[id]/route.ts` + `analyze/route.ts`
  (Modul: vertraege)
- `src/app/api/handwerker/route.ts` + `[id]/route.ts` (Modul: ticketsystem —
  Handwerker-Stammdaten werden primär von dort verwendet)
- `src/app/api/schriftverkehr/route.ts` + `[id]/route.ts` +
  `[id]/fertigstellen/route.ts` (Modul: dokumente)
- `src/middleware.ts` — zur Vollständigkeit nochmal dabei (identisch zum
  Hotfix-Zip aus dem letzten Durchlauf, falls das noch nicht eingespielt ist)

## Einspielen

Dateien 1:1 an gleicher Stelle in eurem Repo ersetzen, dann:

```bash
npm run build   # zur Kontrolle
```

## Verifiziert vor Paketierung

- `npx tsc --noEmit` — sauber
- `npm run lint` — keine neuen Fehler (nur vorbestehende `any`-Meldungen in
  unverändertem Code drumherum)
- `npm run build` — vollständig erfolgreich (inkl. Middleware-Hotfix)

## Rechte-Matrix dieser Routen (zur Kontrolle)

| Route | Modul | GET | POST/PATCH | DELETE |
|---|---|---|---|---|
| eigentuemer | immobilien | read | write | delete |
| pm-vertrag | vertraege | read | write | delete |
| handwerker | ticketsystem | read | write | delete |
| schriftverkehr | dokumente | read | write | delete |

## Stand nach diesem Durchlauf

13 von ~35 API-Modulen abgesichert (liegenschaften, gebaeude, wohnungen,
mieter, mietvertraege, kalender-ereignisse, tickets, ablage, eigentuemer,
pm-vertrag, handwerker, schriftverkehr — jeweils Kern-CRUD).

## Noch offen

- **Buchhaltung** (9 Dateien), **Abrechnungen** (2), **Kontoauszug** (1) —
  alle Modul „finanzen", noch größerer zusammenhängender Block
- **Tickets-Unterrouten** (ablehnen, freigeben, zuweisen, nachrichten — 4
  Dateien, Basis-CRUD ist bereits abgesichert)
- **Mietverträge-Unterrouten** (nachtrag, analyze — 2 Dateien)
- **Investoren** (10 Dateien) — kein Pflichtenheft-Modul, gehört nicht zum
  Kernumfang, niedrige Priorität
- **Dashboard/Export/Generate/Agent/Chat** — aggregierende/interne Endpunkte,
  brauchen ggf. nur `requireUser()` statt granularer Modul-Rechte
- RLS-Policies für die neu abgesicherten Tabellen (bisher nur liegenschaften/
  gebaeude haben welche)
- Nutzerverwaltungs-UI weiterhin offen
