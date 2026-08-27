# Durchgang 20 – Phase 1: Grundbuchverwaltung (LIE-006/007)

Zweiter Baustein von Phase 1 — vervollständigt die Liegenschaftsverwaltung
um Abteilung I/II/III mit echter Historisierung.

## Was ist neu

- **Neuer Datentyp `GrundbuchEintrag`** (`src/lib/types.ts`): Abteilung
  (I/II/III), laufende Nummer, Art, Berechtigter, Betrag (v.a. Abt. III),
  Eintragungsdatum, sowie `geloeschtAm`/`geloeschtGrund` für die
  Historisierung.
- **Historisierungskonzept — wichtig:** Ein Grundbuch-Eintrag wird bei
  Wegfall NICHT gelöscht, sondern „gerötet" (klassischer Grundbuch-Begriff):
  `geloeschtAm` wird gesetzt, der Eintrag bleibt sichtbar und nachvollziehbar.
  Echtes hartes Löschen (`DELETE`) ist nur für Fehleingaben gedacht.
- **`grundbuchDb`** in `src/lib/db.ts`, über `makeCrud<T>()` (JSON-Backend,
  gleiches Muster wie Flurstücke).
- **API:**
  - `GET/POST /api/grundbuch` (mit `flurstueckId`-Filter)
  - `GET/PATCH/DELETE /api/grundbuch/[id]` (PATCH blockt bewusst
    `geloeschtAm`/`geloeschtGrund` — dafür gibt es den eigenen Endpunkt)
  - `POST /api/grundbuch/[id]/roeten` — der reguläre Weg, ein Recht zu
    beenden, mit optionalem Grund
- **UI:** In die bestehende Flurstücke-Seite integriert — neuer
  „Grundbuch"-Button (Buch-Icon) pro Zeile öffnet ein Modal mit den drei
  Abteilungen, Einträge anlegen/röten direkt dort.

## Einspielen

`types.ts` und `db.ts` sind vollständige Dateien — bitte komplett
überschreiben, nicht manuell mergen. Restliche Dateien 1:1 ersetzen, dann
`npm run build`. Keine SQL-Migration nötig (JSON-Backend).

## Verifiziert vor Paketierung

- `npx tsc --noEmit` — sauber
- `npm run lint` — keine neuen Fehler (zwei vorbestehende `any`-Meldungen
  im generischen `makeCrud`, unverändert)
- `npm run build` — vollständig erfolgreich

## Anforderungsstatus

LIE-006 (Grundbuch-Abteilungen erfassen) und LIE-007 (Historisierung)
jetzt erfüllt. Damit ist LIE (Liegenschaftsverwaltung) bei ca. **65 %**
(vorher 45 %). Offen bleibt LIE-008 (Kartendarstellung/GIS) — der wird
bewusst zurückgestellt (siehe frühere Gap-Analyse: hoher Aufwand, hängt
stark von der gewünschten GIS-Tiefe ab).

## Nächster Baustein in Phase 1

Das **generische Vertragsmodul** (VERTR-001 bis VERTR-006) — aktuell gibt
es nur die Spezialfälle Mietvertrag und PM-Vertrag, kein einheitliches
Vertragsobjekt für Pacht-, Dienstleistungs- oder sonstige Verträge.
