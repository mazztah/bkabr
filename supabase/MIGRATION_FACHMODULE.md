# Fachmodule auf Supabase umstellen (Slice 1: Flurstücke + Grundbuch)

Stand: 21.09.2026. Betrifft die Module `flurstuecke` und `grundbuch` (`DB_SUPABASE_MODULES`).
Die übrigen Fachmodule (Verträge, Anlagen, Zähler, Räume, Veranstaltungen, Tickets, Handwerker) laufen weiter über `data/db.json`.

## Reihenfolge

1. **Sicherung:** `data/db.json` kopieren (Fly: Volume-Snapshot oder `fly ssh sftp get /data/db.json`).
2. **Schema:** im Supabase SQL Editor nacheinander `schema.sql`, `schema_business.sql`, `schema_auth.sql`, `schema_fachmodule.sql` (wiederholbar).
3. **Stammdaten:** `npm run migrate:supabase` und `DB_SUPABASE_MODULES` um `liegenschaften` erweitern (Fremdschlüssel!).
4. **Fachmodul-Daten:**
   ```bash
   node --env-file=.env.local scripts/migrate-fachmodule.mjs --dry-run
   node --env-file=.env.local scripts/migrate-fachmodule.mjs
   ```
   (`npm run migrate:fachmodule[:dry-run]`). Der Bericht `migration-fachmodule-errors.json` nennt
   verwaiste Datensätze (Liegenschaft/Flurstück fehlt in Supabase) und Dubletten (UNIQUE Liegenschaft + Gemarkung + Flur + Nummer).
   Diese vor dem Umschalten bereinigen.
5. **Umschalten:** `DB_SUPABASE_MODULES=liegenschaften,gebaeude,wohnungen,mieter,mietvertraege,flurstuecke,grundbuch` und neu starten.
   Beim Start warnt die App, wenn `flurstuecke` ohne `liegenschaften` bzw. `grundbuch` ohne `flurstuecke` gesetzt ist.
6. **Prüfen:** Zeilenzahlen (`select count(*) from flurstuecke;` gegen `jq '.flurstuecke | length' data/db.json`), ein Flurstück öffnen, Grundbuch-Eintrag anlegen und rösten.

## Verhalten, das sich gegenüber db.json ändert

- **Löschen:** Ein Flurstück mit Grundbuch-Einträgen lässt sich nicht löschen (Historie, LIE-007). Die Meldung nennt die Anzahl.
- **Dubletten:** Das POST weist ein bereits vorhandenes Flurstück (gleiche Liegenschaft, Gemarkung, Flur, Nummer) mit 409 ab — auch im JSON-Betrieb.
- **Liegenschaft löschen:** `cascadeDeleteLiegenschaft` kennt Flurstücke nicht. Mit Supabase blockiert der Fremdschlüssel das Löschen, solange Flurstücke existieren.
- **Audit:** Der Postgres-Trigger schreibt zusätzlich zu `logAudit()` aus den Routen. Ergebnis sind zwei Einträge je Änderung (einer mit Akteur, einer ohne). Bereinigung steht aus.
- **Zurückschalten:** Modul aus `DB_SUPABASE_MODULES` entfernen. `db.json` enthält dann den Stand zum Zeitpunkt der Migration; Änderungen seit dem Umschalten stehen nur in Supabase.

## Bekannte Grenzen

- Die Adapter für Liegenschaft, Gebäude, Wohnung, Mieter und Mietvertrag (`db-supabase.ts`) lesen jetzt ebenfalls seitenweise und laden Kind-Datensätze (Mietkonto, Soll/Ist, Anhänge) blockweise. Vorher schnitt PostgREST bei 1.000 Zeilen still ab, und `.in()` mit tausenden IDs schlug fehl. Die Reihenfolge der Kind-Datensätze ist jetzt deterministisch (Mietkonto nach Datum, Soll/Ist nach Jahr, Anhänge nach Upload-Zeit).
- `db.json`-Betrieb: `readDb()` überschreibt bei defektem JSON nicht mehr die Datei, sondern wirft einen Fehler und legt einmalig `db.json.corrupt-<Zeitstempel>` an. Zusätzlich entsteht höchstens alle 10 Minuten eine Kopie `db.json.bak`. Ein Backup-Konzept ersetzt das nicht.
