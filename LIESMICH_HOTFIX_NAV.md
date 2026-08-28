# Hotfix: Fehlende Menüpunkte (Flurstücke, Verträge, Systemadministration)

## Ursache

`src/components/LeftNav.tsx` wurde in mehreren Durchgängen (14, 18, 19, 21)
jeweils als VOLLSTÄNDIGE Datei mitgeliefert (nicht als Patch). Falls einer
dieser Zips übersprungen, in falscher Reihenfolge eingespielt, oder eine
ältere Version versehentlich zuletzt kopiert wurde, fehlen die neueren
Nav-Einträge — das ist der wahrscheinlichste Grund.

## Fix

Diese Datei enthält den AKTUELLEN, vollständigen Stand von `LeftNav.tsx`
mit allen Einträgen:
- „Flurstücke" (Durchgang 19)
- „Verträge" (Durchgang 21)
- „Systemadministration" → „Nutzerverwaltung" (Durchgang 18)

Einfach diese eine Datei 1:1 in eurem Repo ersetzen — unabhängig davon,
welchen Stand ihr vorher hattet.

## Falls das Menü danach immer noch nicht aktualisiert aussieht

Das ist typischerweise Browser- oder Build-Cache, kein Code-Problem:
1. Harter Browser-Reload (Strg+Shift+R / Cmd+Shift+R)
2. Prüfen, ob der Fly.io-Build nach dem Einspielen wirklich neu gelaufen
   ist (Deployment-Log ansehen)
3. Falls ihr lokal `npm run build && npm start` testet: `.next`-Ordner
   löschen und neu bauen (`rm -rf .next && npm run build`)
