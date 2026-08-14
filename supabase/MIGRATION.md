# Durchgang 13 – Geschäftsdaten-Migration nach Supabase (Phase 0+1)

Diese Migration ist **additiv und risikofrei**: `data/db.json` bleibt die
aktive Datenquelle der App, nichts wird gelöscht oder umgeschrieben. Am Ende
dieses Durchgangs liegen eure Daten zusätzlich in Supabase (Postgres) — der
eigentliche Umstieg von `src/lib/db.ts` auf Supabase als aktive Quelle ist
bewusst ein **eigener, separater Schritt** (Phase 2), der einzeln testbar
bleibt.

## 1. Schema anlegen

Im Supabase SQL Editor des Projekts, in dieser Reihenfolge:

1. `supabase/schema.sql` (falls noch nicht geschehen — Agent-Gedächtnis)
2. `supabase/schema_business.sql` (alle Geschäftsdaten-Tabellen)

Beides ist idempotent (`create table if not exists`), kann also gefahrlos
erneut ausgeführt werden.

## 2. Env-Variablen setzen

```bash
# .env.local
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Service-Role-Key, NICHT der anon key!
```

Der Service-Role-Key umgeht RLS — genau das wird hier gebraucht, weil die
Tabellen aktuell (noch ohne Auth/Workplace-Phase) keine Policies für den
`anon`-Key haben.

## 3. Trockenlauf

```bash
npm run migrate:supabase:dry-run
```

Zählt nur, schreibt nichts. Prüft, dass `data/db.json` lesbar ist und die
Verbindungsdaten stimmen.

## 4. Echte Migration

```bash
npm run migrate:supabase
```

- Läuft in Abhängigkeitsreihenfolge (Liegenschaft → Gebäude → Wohnung → …).
- Nutzt `upsert` auf `id` → **beliebig oft wiederholbar**, z.B. nachdem neue
  Daten in der JSON-Datei entstanden sind (kein Doppel-Import).
- Datensätze mit defekten/verwaisten Referenzen (z.B. Mietvertrag zeigt auf
  eine längst gelöschte Wohnung) werden übersprungen statt die ganze
  Migration abzubrechen. Am Ende steht eine Zusammenfassung; bei Fehlern
  zusätzlich `migration-errors.json` im Projektroot mit allen betroffenen
  Zeilen-IDs zur manuellen Prüfung.

## 5. Verifizieren

Stichprobenartig Zeilenzahlen vergleichen, z.B. im Supabase SQL Editor:

```sql
select count(*) from liegenschaften;
select count(*) from mieter;
select count(*) from buchungen;
```

… gegen die Array-Längen in `data/db.json` (z.B. `jq '.liegenschaften | length' data/db.json`).

## Was NOCH NICHT passiert

- `src/lib/db.ts` liest/schreibt weiterhin **ausschließlich** die JSON-Datei.
  Die App verhält sich nach diesem Durchgang unverändert.
- Es gibt noch keine RLS-Policies (nur Service-Role-Zugriff) — das kommt mit
  der Workplace-/Auth-Phase.
- `buchung_aufteilung` hat in der JSON-Struktur keine stabile `id` je
  Position — das Skript räumt die Tabelle vor jedem Lauf leer und schreibt
  sie neu (im Gegensatz zu allen anderen Tabellen also **kein** Upsert,
  sondern Replace).

## Nächster Schritt (Phase 2, separat)

`db.ts`-Funktionen einzeln (Read zuerst) hinter einem Feature-Flag
(`DB_BACKEND=supabase`) auf den Supabase-Client umstellen, Signaturen bleiben
identisch (Rückgabetypen aus `types.ts` ändern sich nicht). Erst wenn ein
Modul in Produktion stabil über Supabase läuft, das JSON-Schreiben für dieses
Modul abschalten.
