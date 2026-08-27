# Durchgang 19 – Phase 1: Flurstücksverwaltung (LIE-001 bis LIE-005)

Erster Baustein von Phase 1 aus dem ursprünglichen Umsetzungsplan — bisher
0 % Erfüllungsgrad, jetzt Basis-CRUD vollständig funktionsfähig.

## Was ist neu

- **Neuer Datentyp `Flurstueck`** (`src/lib/types.ts`): Gemarkung, Flur,
  Flurstücksnummer, Wirtschaftsart (10 Kategorien nach ALKIS-Kataster +
  Pflichtenheft-Nutzungsformen: Jagd, Fischerei, Kleingarten), Fläche in m²,
  Grundbuchblatt/-amt als Freitextfeld (echte Grundbuchverwaltung mit
  Abteilung I/II/III folgt in einem späteren Durchgang), Notizen.
- **`flurstueckeDb`** in `src/lib/db.ts`, über den bestehenden
  `makeCrud<T>()`-Factory angebunden — folgt demselben Muster wie
  `eigentuemerDb`, `handwerkerDb` etc. (JSON-Datei-Backend, kein
  Postgres-Umbau nötig für diesen Schritt).
- **API:** `GET/POST /api/flurstuecke` (mit `liegenschaftId`-Filter),
  `GET/PATCH/DELETE /api/flurstuecke/[id]` — Modul `liegenschaften`,
  inkl. `logAudit()`.
- **UI:** neue Seite `/flurstuecke` (Navigation: „Objekte" →
  „Flurstücke", zwischen Liegenschaften und Gebäude einsortiert) — Liste
  mit Liegenschafts-Filter, Anlegen/Bearbeiten-Formular, Löschen.

## Einspielen

Dateien 1:1 ersetzen (`types.ts` und `db.ts` sind vollständige Dateien,
keine Patches — bitte komplett überschreiben, nicht manuell mergen), dann
`npm run build` zur Kontrolle. Keine SQL-Migration nötig für diesen
Durchgang (JSON-Backend).

## Verifiziert vor Paketierung

- `npx tsc --noEmit` — sauber (ein Syntaxfehler beim ersten Einfügen des
  neuen Typs selbst gefunden und korrigiert)
- `npm run lint` — eine Warnung (ungenutzter Import) gefunden und behoben,
  danach sauber
- `npm run build` — vollständig erfolgreich, `/flurstuecke` korrekt gebaut

## Anforderungsstatus (siehe eigene Übersicht in der separaten Nachricht)

LIE-001 bis LIE-005 (Flurstück anlegen/bearbeiten/löschen, Wirtschaftsart,
Flächenangabe, Grundbuchbezug als Feld) jetzt erfüllt. LIE-006/007
(vollständige Grundbuchverwaltung mit Abteilung I/II/III und
Historisierung) sowie LIE-008 (Kartendarstellung/GIS) sind noch offen —
nächster Baustein in Phase 1.
