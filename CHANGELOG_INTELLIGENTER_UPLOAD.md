# Erweiterung: Zusatzunterlagen, Sammel-Upload & Fertigstellen-PDF

Diese Änderungen erweitern den bestehenden Workflow, ohne bisheriges Verhalten zu brechen.
`npx tsc --noEmit` und `npm run build` laufen fehlerfrei durch (geprüft).

## 1. Zusatzunterlagen ("Anhänge")
- **PM-Vertrag**: Liegenschaftskarte, Objektbeschreibung, Mieterliste, Sonstiges –
  Upload-Button direkt unter jedem PM-Vertrag im Menü „PM-Vertrag“.
- **Eigentümer**: Grundbuchauszug, Kaufvertrag, Vollmacht, Eigentümerbeschluss, Sonstiges –
  Upload-Button direkt unter jedem Eigentümer im Menü „Eigentümer“.
- **Mietvertrag**: Nachtrag / Übergabeprotokoll – eigener Upload-Button je Mietvertrag im
  Menü „Mietverträge“. Nach dem Hochladen zeigt ein Dialog die erkannten Änderungen
  (z.B. Mieterwechsel, neue Miete) und lässt wählen:
  - **„Nur ablegen“**: Datei wird archiviert, Stammdaten bleiben unverändert (manuell prüfen)
  - **„Automatisch übernehmen“**: erkannte Werte (Mietbeginn/-ende, Miete, NK, Kaution)
    werden direkt in den Mietvertrag übernommen

Technisch: neuer `Anhang`-Typ in `lib/types.ts`, generischer Speicher-Endpunkt
`POST /api/upload`, wiederverwendbare UI-Komponente `components/Anhaenge.tsx`.

## 2. Intelligenter Sammel-Upload (`/smart-upload`, im Menü ganz oben)
Ermöglicht das gleichzeitige Hochladen vieler unterschiedlicher Dokumente (z.B. 20 PDFs
eines Übergabepakets). Jede Datei wird einzeln per KI klassifiziert:
Rechnung, Mietvertrag, Nachtrag, Übergabeprotokoll, PM-Vertrag, Eigentümer-Dokument,
Grundbuchauszug, Kaufvertrag, Liegenschaftskarte/Objektbeschreibung/Mieterliste,
Kontoauszug.

- Rechnungen und Kontoauszüge werden wie gewohnt automatisch abgelegt (kein
  zusätzlicher Bestätigungsschritt, wie im übrigen Produkt üblich).
- Alle anderen Typen (neue Liegenschaften/Gebäude/Wohnungen/Mieter/Mietverträge/
  PM-Verträge) erscheinen als Warteschlangen-Karte mit vorausgefüllten, editierbaren
  Feldern und Vorschlägen (automatischer Adress-/Namensabgleich gegen bestehende
  Stammdaten). **Nichts wird übernommen, bevor der User „Übernehmen & ablegen“
  bestätigt.**

Technisch: `POST /api/smart-upload`, Klassifizierung via `classifyDocument()` in
`lib/ai.ts`, Verarbeitung mit Concurrency-Limit (3 gleichzeitig, für 40 Dateien geeignet).

## 3. Rechnungen: Sortierung & Excel-Export
- Sortierbuttons oberhalb der Liste (Hochgeladen/Liegenschaft/Name/Firma/Betrag),
  Klick wechselt Auf-/Absteigend.
- Button „📊 Als Excel exportieren“ lädt `GET /api/export/xlsx` – eine .xlsx-Datei mit
  einer Zeile je Rechnung/Abrechnung inkl. Liegenschaft, Gebäude, Wohnung, Zeitraum,
  Summe, Status.
- Der XLSX-Export ist bewusst ohne zusätzliche npm-Abhängigkeit umgesetzt
  (`lib/xlsx.ts`, minimaler eigener ZIP/XLSX-Writer, gegen `openpyxl` verifiziert).

## 4. Anschreiben „Fertigstellen“
Im Schriftverkehr-Panel erscheint bei jedem gespeicherten Brief ein Button
„✓ Fertigstellen“. Dieser erzeugt eine finale, versandfertige PDF-Version mit
grafischem Briefkopf (Logo + Corporate Design, analog zur mitgelieferten Vorlage
„Mieterbegrüßung nach Eigentümerwechsel“) und legt sie dauerhaft ab
(`POST /api/schriftverkehr/[id]/fertigstellen`, `lib/pdf.ts: buildSchriftverkehrPdf`).
Danach erscheint statt des Buttons ein Link „📄 Finale PDF ansehen“.

## 5. Sonstiges
- `Kontoauszug` ist jetzt ein eigener Stammdatentyp – hochgeladene Kontoauszüge werden
  dauerhaft archiviert (`lib/db.ts: kontoauszuegeDb`), nicht mehr nur zwischengespeichert.
- `/api/analyze` (Einzel-Rechnungs-Upload) wurde auf die gemeinsame Logik
  `lib/rechnung-intake.ts` umgestellt – Verhalten unverändert, aber jetzt auch vom
  Sammel-Upload nutzbar.

## Getestet mit
Die mitgelieferten Testunterlagen (`SHG4_Komplettpaket_Spannhagengartenstr4.zip`)
decken alle neuen Klassifizierungs-Kategorien ab: Rechnungen, Mietverträge,
Grundbuchauszug, Kaufvertrag, Liegenschafts-/Flurstückskarte, Objektbeschreibung,
Gebäude-/Mieterliste, PM-Vertrag, Kontoauszüge.
