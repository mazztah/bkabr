# Durchgang 22 – Phase 2: Anlagenmanagement (ANL-001 bis ANL-006)

Erster Baustein von Phase 2.

## ⚠️ Diesmal WICHTIG: LeftNav.tsx ist wieder dabei

Wie im letzten Hotfix erwähnt — bitte sicherstellen, dass ihr wirklich
DIESE Version von `LeftNav.tsx` einspielt (überschreibt den Hotfix von
eben zusätzlich um den neuen „Anlagenmanagement"-Eintrag). Am sichersten:
diese eine Datei ist der aktuell vollständige Stand, einfach direkt
verwenden.

## Was ist neu

- **Neuer Datentyp `Anlage`** (`src/lib/types.ts`): 16 Anlagentypen-Katalog
  (BMA, EMA, GLT, RLT, Aufzug, Klimaanlage, Heizungsanlage, u.a.),
  Standortzuordnung (Liegenschaft/Gebäude/Detail), Hersteller/Modell/
  Baujahr, Wartungsfirma, Prüftermin + Intervall, Status.
- **Neuer Datentyp `AnlagenWartung`**: Wartungshistorie je Anlage
  (WART-003) — Datum, Art (Wartung/Prüfung/Reparatur), Ergebnis, Kosten.
  Beim Anlegen eines Eintrags mit „nächste Fälligkeit" wird
  `Anlage.naechstePruefung` automatisch fortgeschrieben.
- **Kalender-Integration:** Fällige Prüftermine erscheinen automatisch als
  Frist im Kalender (gleicher Mechanismus wie bei Vertragsenden aus
  Durchgang 21).
- **`anlagenDb`/`anlagenWartungenDb`** in `src/lib/db.ts` (JSON-Backend).
- **API:**
  - `GET/POST /api/anlagen` (Filter nach `liegenschaftId`/`gebaeudeId`)
  - `GET/PATCH/DELETE /api/anlagen/[id]` (Löschen räumt auch die
    Wartungshistorie mit auf)
  - `GET/POST /api/anlagen/[id]/wartungen`
  - Modul `anlagen` — war in der Rechtematrix bereits für Haustechnik/
    Systemadministration vorgesehen, keine SQL-Änderung nötig.
- **UI:** neue Seite `/anlagen` (Navigation: „Betrieb" → „Anlagenmanagement",
  neben Ticketsystem) — Liste mit Liegenschafts-Filter, Anlegen/Bearbeiten,
  Wartungshistorie-Modal mit eigenem Dokumentations-Formular.

## Einspielen

`types.ts` und `db.ts` sind vollständige Dateien — komplett überschreiben.
Restliche Dateien 1:1 ersetzen, dann `npm run build`. Keine SQL-Migration
nötig (JSON-Backend, Modul-Rechte waren schon vorbereitet).

## Verifiziert vor Paketierung

- `npx tsc --noEmit` — sauber
- `npm run lint` — 2 Fehler in eigenem Code gefunden (any-Typen bei
  Filter-Objekten) und behoben, danach sauber
- `npm run build` — vollständig erfolgreich, alle neuen Routen korrekt
  gebaut

## Anforderungsstatus

ANL-001 bis ANL-006 (Anlage anlegen, Typenkatalog, Standortzuordnung,
Wartungsfirma) sowie WART-001 (Prüftermine, jetzt auch im Kalender) und
WART-003 (Wartungshistorie dokumentieren) jetzt erfüllt. ANL-Block von
0 % auf ca. **70 %**, WART-Block von 0 % auf ca. **35 %** (WART-002:
automatische Eskalation bei überfälliger Prüfung noch offen).

## Nächster Baustein in Phase 2

**Zählerwesen** (ZAE-001 bis ZAE-010) — Gas/Wasser/Strom-Zähler,
Zählerstände-Historie, Verbrauchsauswertung. Danach ist Phase 2
abgeschlossen.
