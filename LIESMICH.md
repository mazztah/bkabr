# Durchgang 21 – Phase 1: Generisches Vertragsmodul (VERTR-001 bis VERTR-006)

Dritter und letzter Baustein von Phase 1 — damit ist Phase 1 komplett.

## Was ist neu

- **Neuer Datentyp `Vertrag`** (`src/lib/types.ts`): Art (Pacht,
  Dienstleistung, Wartung, Versicherung, Erbbaurecht, Sonstige),
  Vertragspartner, optionale Liegenschafts-/Flurstücksverknüpfung, Beginn/
  Ende (oder unbefristet), Kündigungsfrist, Betrag/Zahlungsintervall,
  Status.
- **Bewusste Abgrenzung:** Mietvertrag und PM-Vertrag bleiben unangetastet
  eigene Module (haben KI-Extraktion, PDF-Handling etc.) — dieses neue
  Modul deckt ausschließlich die bisher komplett fehlenden Vertragsarten ab
  (Pacht, Dienstleistung, Wartung, ...).
- **Kalender-Integration (KAL-002):** Jeder befristete Vertrag mit
  Enddatum erzeugt automatisch eine Frist im Kalender — über den bereits
  bestehenden `getAbgeleiteteKalenderEreignisse()`-Mechanismus (gleiches
  Prinzip wie beim Mietende), kein Duplizieren von Daten.
- **`vertraegeDb`** in `src/lib/db.ts` (JSON-Backend, `makeCrud`-Muster).
- **API:** `GET/POST /api/vertraege` (Filter nach `liegenschaftId`/`art`),
  `GET/PATCH/DELETE /api/vertraege/[id]` — Modul `vertraege`, inkl.
  `logAudit()`.
- **UI:** neue Seite `/vertraege` (Navigation: „Objekte" → „Verträge",
  neben Mietverträge) — Liste mit Art-Filter, Anlegen/Bearbeiten-Formular
  inkl. Status-Badges.

## Einspielen

`types.ts` und `db.ts` sind vollständige Dateien — bitte komplett
überschreiben, nicht manuell mergen. Restliche Dateien 1:1 ersetzen, dann
`npm run build`. Keine SQL-Migration nötig (JSON-Backend).

## Verifiziert vor Paketierung

- `npx tsc --noEmit` — sauber
- `npm run lint` — keine neuen Fehler
- `npm run build` — vollständig erfolgreich, `/vertraege` korrekt gebaut

## Anforderungsstatus

VERTR-001 bis VERTR-006 (Vertrag erfassen, Vertragsarten, Laufzeit/
Kündigung, automatische Fristenübernahme) jetzt erfüllt. VERTR-Block von
25 % auf ca. **65 %**. KAL-Block profitiert mit (von 20 % auf ca. **30 %**,
da die automatische Frist-Übernahme — bisher nur für Mietverträge — jetzt
auch für das neue Vertragsmodul greift).

## 🎉 Phase 1 abgeschlossen

Mit Flurstücksverwaltung (Durchgang 19), Grundbuchverwaltung (Durchgang 20)
und dem generischen Vertragsmodul (dieser Durchgang) sind alle drei
Bausteine aus dem ursprünglichen Phase-1-Plan umgesetzt.

**Aktualisierte Gesamtübersicht folgt in der separaten Nachricht.**

## Nächste Phase (Phase 2)

Anlagenmanagement (technischer 50-Positionen-Katalog: BMA, EMA, GLT, RLT,
Aufzug, Klimaanlage etc.), Wartungs-/Prüfmanagement mit Zyklen, und
Zählerwesen (Gas/Wasser/Strom, Zählerstände-Historie) — alle drei bisher
bei 0 %.
