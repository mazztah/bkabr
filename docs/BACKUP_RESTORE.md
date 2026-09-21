# Backup und Wiederherstellung (SEC-005, TECH-008)

Stand: 21.09.2026. Gilt für den Betrieb auf Fly.io mit dem Volume `betriebskosten_data` unter `/data` (`fly.toml`).

## Was gesichert werden muss

| Was | Wo | Inhalt |
|---|---|---|
| Datenbank-Datei | `/data/db.json` | alle Fachmodule, die noch nicht auf Supabase laufen (Flurstücke, Verträge, Anlagen, Zähler, Räume, Veranstaltungen, Tickets, Handwerker, Ablage-Metadaten, Zähler/Nummernkreise) |
| Dokumente | `/data/uploads/` | hochgeladene PDFs, Bilder, Anhänge, Ablage |
| Supabase (falls aktiv) | Supabase-Projekt | Tabellen der zugeschalteten Module (`DB_SUPABASE_MODULES`), Nutzer, Rollen, Audit-Log |
| Konfiguration | Fly-Secrets, `.env.local` | Schlüssel und URLs; nicht im Repo, separat und verschlüsselt ablegen |

## Vorgaben (bitte an eure Anforderungen anpassen)

- Sicherungsziel: höchstens 24 Stunden Datenverlust, Wiederherstellung innerhalb eines Arbeitstags.
- Aufbewahrung: 14 tägliche Sicherungen, dazu eine Monatssicherung außerhalb von Fly.
- Wiederherstellungstest: mindestens einmal je Quartal (siehe unten).

## 1. Sicherung der Datei-Ablage

Das Skript `scripts/backup.mjs` kopiert `db.json` und `uploads/` in ein Zeitstempel-Verzeichnis, prüft vorher, dass `db.json` gültiges JSON ist,
und schreibt `MANIFEST.json` mit SHA-256 und Datensatzzahlen je Sammlung.

```bash
# auf dem Server (Fly): fly ssh console
DATA_DIR=/data node scripts/backup.mjs --dir=/data/backups --keep=14

# lokal (Entwicklung)
npm run backup
```

Wichtig: Sicherungen auf demselben Volume schützen nicht vor dem Verlust des Volumes. Deshalb zusätzlich:

1. **Fly-Volume-Snapshots** nutzen: `fly volumes list`, `fly volumes snapshots list <volume-id>`, manuell `fly volumes snapshots create <volume-id>`.
   Fly legt Snapshots regelmäßig automatisch an; Aufbewahrungsdauer und Häufigkeit bitte in der aktuellen Fly-Dokumentation prüfen und bei Bedarf verlängern.
2. **Kopie außerhalb**: den Ordner `/data/backups` regelmäßig herunterladen (`fly ssh sftp get /data/backups/<Ordner> -R`) oder per Aufgabenplaner auf ein
   Ziel in einer anderen Umgebung kopieren.

## 2. Sicherung Supabase

- Im Supabase-Dashboard unter *Database → Backups* die automatischen Sicherungen prüfen; Point-in-Time-Recovery ist je nach Tarif verfügbar.
- Zusätzlich ein logisches Backup: `pg_dump` mit der Verbindungszeichenfolge aus dem Dashboard (Format `custom`), Ablage außerhalb von Supabase.
- Das Audit-Log (`audit_log`) gehört zu diesem Backup und darf nicht gekürzt werden, solange Aufbewahrungsregeln nicht beschlossen sind (SEC-004).

## 3. Wiederherstellung der Datei-Ablage

1. App anhalten (`fly scale count 0`), damit während der Wiederherstellung nicht geschrieben wird.
2. Sicherung prüfen (Trockenlauf, ändert nichts):
   ```bash
   DATA_DIR=/data node scripts/restore.mjs /data/backups/bkabr-2026-09-21_18-53-59
   ```
   Das Skript vergleicht alle Prüfsummen mit `MANIFEST.json` und bricht bei jeder Abweichung ab.
3. Wiederherstellen:
   ```bash
   DATA_DIR=/data node scripts/restore.mjs /data/backups/bkabr-2026-09-21_18-53-59 --yes
   ```
   Der bisherige Stand wird vorher nach `/data.pre-restore-<Zeitstempel>` kopiert.
4. App starten (`fly scale count 1`), Stichproben prüfen: Anzahl Datensätze gegen die Ausgabe des Trockenlaufs, je ein Flurstück, Vertrag, Ticket und Dokument öffnen.
5. `node scripts/datenqualitaet.mjs` ausführen (siehe `docs/MIGRATION_TESTPLAN.md`).

Zusätzlich legt die App selbst höchstens alle 10 Minuten eine Kopie `db.json.bak` an und überschreibt eine defekte `db.json` nicht mehr
(bei defektem JSON entsteht `db.json.corrupt-<Zeitstempel>` und die App meldet einen Fehler). Das ersetzt keine Sicherung.

## 4. Wiederherstellungstest (quartalsweise)

1. Aktuelle Sicherung auf einen Testrechner kopieren.
2. Mit `DATA_DIR` auf ein leeres Testverzeichnis wiederherstellen (`--yes`).
3. `npm run dev` mit diesem `DATA_DIR` starten und drei Stichproben durchführen.
4. Ergebnis (Datum, Sicherung, Dauer, Auffälligkeiten) hier unten eintragen.

| Datum | Sicherung | Dauer | Ergebnis | Durch |
|---|---|---|---|---|
| | | | | |

## Grenzen

- Sicherung und Wiederherstellung der Datei-Ablage sind mit Testdaten geprüft, nicht mit dem Produktivbestand.
- Die Dokumente auf dem Volume sind nicht verschlüsselt (TECH-005).
- Für Supabase gilt der Stand des jeweiligen Tarifs; hier ist nichts automatisiert.
