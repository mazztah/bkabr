# Durchgang 23 – Phase 2: Zählerwesen (ZAE-001 bis ZAE-010)

Letzter Baustein von Phase 2 — damit ist Phase 2 komplett.

## Was ist neu

- **Neuer Datentyp `Zaehler`**: Zählernummer, Art (Strom/Gas/Wasser kalt/
  Wasser warm/Wärme/Sonstige, mit automatischem Einheiten-Vorschlag kWh/m³),
  Zuordnung auf Liegenschafts-/Gebäude-/Wohnungsebene (für Haupt- und
  Unterzähler), Einbaudatum, Status.
- **Neuer Datentyp `ZaehlerAblesung`**: Zählerstände-Historie mit Datum,
  Stand, Ableser.
- **Verbrauchsauswertung (ZAE-008):** wird aus den Rohständen berechnet
  (Differenz + Zeitraum in Tagen zwischen aufeinanderfolgenden Ablesungen),
  nicht separat gespeichert — kann so nie mit der Historie auseinanderlaufen.
- **Plausibilitätsprüfung:** rückläufige Zählerstände werden nicht
  blockiert (kann bei Zählertausch legitim sein), aber mit Hinweis im
  Protokoll und in der UI markiert.
- **`zaehlerDb`/`zaehlerAblesungenDb`** in `src/lib/db.ts` (JSON-Backend).
- **API:** `GET/POST /api/zaehler`, `GET/PATCH/DELETE /api/zaehler/[id]`
  (Löschen räumt Ablesungen mit auf), `GET/POST /api/zaehler/[id]/ablesungen`
  — Modul `zaehler`, Rechte waren in der Matrix schon vorbereitet.
- **UI:** neue Seite `/zaehler` (Navigation: „Betrieb" → „Zählerwesen",
  neben Anlagenmanagement) — Liste mit Liegenschafts-Filter, Zählerstände-
  Modal mit Verbrauchstabelle.

## Einspielen

`types.ts` und `db.ts` sind vollständige Dateien — komplett überschreiben.
Restliche Dateien 1:1 ersetzen (`LeftNav.tsx` diesmal wieder mit dem neuen
Zählerwesen-Eintrag), dann `npm run build`. Keine SQL-Migration nötig.

## Verifiziert vor Paketierung

- `npx tsc --noEmit` — sauber
- `npm run lint` — keine Fehler
- `npm run build` — vollständig erfolgreich, alle neuen Routen korrekt
  gebaut

## Anforderungsstatus

ZAE-001 bis ZAE-010 (Zähler anlegen, Zuordnung, Ablesungen erfassen,
Verbrauchsauswertung) jetzt erfüllt. ZAE-Block von 0 % auf ca. **75 %**
(offen: automatisierter Import von Zählerständen aus Smart-Meter-
Schnittstellen — bewusst außerhalb des Pflichtenheft-Kernumfangs).

## 🎉 Phase 2 abgeschlossen

Anlagenmanagement (Durchgang 22) + Zählerwesen (dieser Durchgang) = Phase 2
komplett.

**Aktualisierte Gesamtübersicht folgt in der separaten Nachricht.**

## Nächste Phase (Phase 3)

Pacht-/Nutzungsflächen (Jagd, Fischerei, Kleingarten, Wiese — bisher 0 %,
aber jetzt mit dem generischen Vertragsmodul aus Phase 1 als Basis leicht
zu ergänzen), Kurzzeitvermietung/Veranstaltungsflächen mit
Belegungs-Konfliktprüfung, sowie Kalender-Ausbau (Filterung, echte
Konfliktanzeige statt nur Fristen-Ableitung).
