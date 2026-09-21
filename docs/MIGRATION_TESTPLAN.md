# Testmigration und Datenqualitätsabnahme (MIG-004)

Stand: 21.09.2026. Ablauf für jede Migration von Bestandsdaten (Smart-Upload, Import, Umstellung auf Supabase).

## Vor der Migration

1. Sicherung anlegen: `npm run backup` (siehe `docs/BACKUP_RESTORE.md`).
2. Ausgangszahlen festhalten: `npm run check:daten` (Zählwerte je Sammlung und Auffälligkeiten). Ausgabe speichern.

## Testmigration

1. Kopie der Produktivdaten in ein leeres Testverzeichnis wiederherstellen (`DATA_DIR=<test> node scripts/restore.mjs <Sicherung> --yes`).
2. Migration gegen die Kopie bzw. gegen ein Supabase-Testprojekt ausführen:
   - Stammdaten: `npm run migrate:supabase:dry-run`, danach `npm run migrate:supabase`
   - Fachmodule: `npm run migrate:fachmodule:dry-run`, danach `npm run migrate:fachmodule`
3. Fehlerberichte lesen (`migration-fachmodule-errors.json`): verwaiste Datensätze und Dubletten klären.

## Abnahmekriterien

| Prüfung | Sollwert | Wie |
|---|---|---|
| Datensatzzahlen je Sammlung | gleich wie vor der Migration (Abweichungen begründet) | `check:daten` vor/nach, Supabase: `select count(*)` |
| Verwaiste Referenzen | 0 | `npm run check:daten` (Fehler = Exit-Code 1) |
| Dubletten (Nummern, Flurstück, Zählernummer) | 0 | `npm run check:daten` |
| Zeiträume (Vertrag, Reservierung) | 0 Fehler | `npm run check:daten` |
| Zählerstände | Hinweise geprüft (Zählerwechsel oder Eingabefehler) | `npm run check:daten` |
| Dokumente | jede Datei aus `uploads/` öffnet | Stichprobe je Modul, mindestens 10 |
| Nummernkreise | nächste vergebene Nummer größer als jede vorhandene | je einen Datensatz anlegen und Nummer prüfen |
| Fachliche Stichprobe | je 5 Flurstücke, Verträge, Anlagen, Zähler stimmen mit der Quelle überein | Vergleich mit Original, Sachbearbeitung zeichnet ab |
| Berechtigungen | Testnutzer je Rolle sieht nur das Erlaubte | je Rolle Anmeldung und drei Aufrufe |

## Abnahme

| Datum | Migration | Ergebnis | Offene Punkte | Freigabe durch |
|---|---|---|---|---|
| | | | | |

Erst nach der Abnahme das Modul in `DB_SUPABASE_MODULES` aktivieren bzw. die Altdaten archivieren.

## Grenzen

- `check:daten` prüft `data/db.json`. Für Supabase gelten dieselben Kriterien, die Abfragen müssen dort als SQL geführt werden.
- Die Prüfliste ist ein Vorschlag und wurde mit Testdaten, nicht mit einer echten Migration erprobt.
