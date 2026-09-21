# Quick Wins (Stand 21.09.2026)

Matrix im Repo (`src/lib/pflichtenheft.ts`): 26 erfüllt / 66 teilweise / 12 offen (vorher 19 / 67 / 18).

## Neu erfüllt
VERTR-005, VERTR-009, ANL-006, WART-002, TKT-009, DOK-006, UX-008

## Von offen auf teilweise
VERTR-006, ANL-004, WART-004, KAL-002, SEC-005, MIG-004

## Was geändert ist
- **Verträge:** PDF/Nachtrag-Upload im Dialog „Bearbeiten“, Filter (Art, Status, Liegenschaft, Frist) und Suche, Anzeige der Dokumente im Flurstück-Reiter „Verträge“, Prüfung Ende ≥ Beginn (API).
- **Anlagen:** Gebäude wählbar, Dokumente (Wartungsnachweis, Prüfbericht, Vertrag) hochladbar. Beim Dokumentieren einer Wartung/Prüfung wird der nächste Termin aus dem Prüfintervall berechnet (Monatsende-sicher), wenn keiner genannt wird.
- **Zähler:** Zählernummer je Art eindeutig (409), PATCH nur für bekannte Felder.
- **Tickets:** Erledigungsdatum und -person automatisch, Arbeitszeit (Minuten), Historie auch für Priorität, Fälligkeit, Zuständigen, Kategorie und Kostenstelle, PATCH nur für bekannte Felder.
- **Kalender:** Filter nach Kategorie und Herkunft. **Fehlerkorrektur:** Termine wurden in Deutschland einen Tag zu früh angezeigt (UTC-Umrechnung), jetzt lokales Datum.
- **Suche:** Räume; **Ablage:** Suchfeld über Name, Typ, Metadaten und Inhalt.
- **Uploads:** Fehlermeldung des Servers (Größe, Dateityp, Berechtigung) wird angezeigt statt still zu scheitern.
- **Betrieb:** `scripts/backup.mjs`, `scripts/restore.mjs`, `scripts/datenqualitaet.mjs`, `docs/BACKUP_RESTORE.md`, `docs/MIGRATION_TESTPLAN.md`; npm-Skripte `backup`, `restore`, `check:daten`, `migrate:fachmodule` (die beiden letzten fehlten im Repo-Stand).

## Geprüft
- `tsc --noEmit` ohne Fehler, ESLint auf den geänderten Dateien ohne Befund.
- Server-Logik mit 32 automatischen Prüfungen (Handler direkt aufgerufen): Terminfortschreibung, Zählernummer, Vertragszeitraum, Ticket-Historie und -Erledigung, Whitelist, Suche.
- Skripte: Sicherung mit Rotation, Abweisung defekter `db.json`, Manipulationserkennung bei der Wiederherstellung, Datenqualitätsprüfung mit 8 eingebauten Fehlern.
- Kalenderfehler mit `TZ=Europe/Berlin` nachgewiesen und behoben.
- Nicht geprüft: die Oberfläche im Browser (Verträge, Anlagen, Kalender, Ablage, Ticket-Detail), nur Typprüfung.
