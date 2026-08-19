# Ticketsystem – Integration in bkabr (Stand v3)

Vollständiges Paket für den neuen Menüpunkt **„Ticketsystem“** plus die
KI-gestützte Erkennung von Handwerker-Stammdatenblättern und den
Plausibilitätsabgleich PM-Vertrag ↔ Stammdaten. Alles wurde gegen einen
Klon von `mazztah/bkabr` entwickelt, typgeprüft (`tsc --noEmit` ✅),
production-gebaut (`next build` ✅) und End-to-End über die echten
API-Routen getestet (inkl. Auto-Fix-Mechanismus).

## Einspielen

```bash
cd bkabr
git apply --index /pfad/zu/ticketsystem-v3.patch
git commit -m "Ticketsystem v3: Handwerker-KI-Upload, PM-Vertrag-Plausibilitaetspruefung"
git push
```

v3 ist der **vollständige, aktuelle Stand** alle drei Ausbaustufen (v1
Ticketsystem-Grundmodul, v2 Objektbezug/CV-Upload/SLA, v3 dieser Schritt)
– nicht mehrere Patches nacheinander anwenden, nur den neuesten.

Alternativ: Ordner `dateien/` 1:1 nach `bkabr/` kopieren
(`cp -r dateien/src/* bkabr/src/`). Sieben Dateien sind bei dir bereits
vorhanden (`db.ts`, `types.ts`, `ai.ts`, `pruefung.ts`, `LeftNav.tsx`,
`LiegenschaftDetail.tsx`, `smart-upload/page.tsx`, `pm-vertrag/route.ts`,
`pm-vertrag/analyze/route.ts`) und werden vollständig überschrieben –
bei eigenen Zwischenänderungen vorher `git diff` prüfen.

## Was in diesem Schritt (v3) dazugekommen ist

### 1. Intelligenter Upload erkennt Handwerker-Stammdatenblätter
- Neuer Dokumenttyp `handwerker_stammdatenblatt` im KI-Klassifikator
  (`src/lib/ai.ts`)
- `extractHandwerkerStammdaten()`: extrahiert Name, Firma, Gewerk,
  Kontakt, Stundensatz, Qualifikationen, Lebenslauf-Zusammenfassung
- `/api/smart-upload` gleicht den erkannten Namen/die E-Mail gegen die
  bestehende Handwerker-Datenbank ab (fuzzy Matching, analog zum
  bestehenden Mieter-/Eigentümer-Abgleich)
- Ist der Handwerker **bereits angelegt** → Dokument wird als Anhang dem
  bestehenden Datensatz hinzugefügt
- Ist er **neu** → Bestätigungskarte in `/smart-upload` mit editierbaren,
  vorausgefüllten Feldern und Gewerke-Zuordnungsvorschlag; ein Klick legt
  den Handwerker an und hinterlegt das Originaldokument direkt in seinen
  Stammdaten

### 2. PM-Vertrag: Soll-Struktur wird jetzt miterkannt
- `PmVertrag`/`PmVertragExtraktion` um `anzahlGebaeudeLtVertrag` und
  `einheitenLtVertrag: PmVertragEinheitAngabe[]` (Gebäudename,
  Wohnungsbezeichnung, m²) erweitert
- Sowohl der generische `/api/smart-upload`-Weg als auch der dedizierte
  Upload im **PM-Vertrag-Tab der Liegenschaft** (der bereits vor diesem
  Schritt existierte) rufen zusätzlich `extractWohnungsuebersicht()` auf
  demselben Dokument auf und speichern die erkannte Soll-Struktur direkt
  am PM-Vertrag-Datensatz

### 3. Plausibilitätsprüfung: PM-Vertrag ↔ Stammdaten (`src/lib/pruefung.ts`)
Neue Prüf-Logik im bestehenden Modul „PM-Verträge“, komplett in den
vorhandenen `runPlausibilitaetspruefung()`-Lauf integriert:
- **Verwaltervergütung nicht erfasst** – wenn weder Honorarmodell noch
  Honorarsatz im PM-Vertrag hinterlegt sind
- **Gebäudeanzahl weicht ab** – Soll (aus Vertrag) vs. Ist (tatsächlich
  angelegte Gebäude der Liegenschaft)
- **Einheit fehlt in den Stammdaten** – im Vertrag genannte Einheit
  konnte keiner erfassten Wohnung zugeordnet werden
- **Wohnfläche weicht ab / wurde nicht übernommen** – m²-Angabe aus dem
  Vertrag vs. m² der zugeordneten Wohnung; **dieser Befund ist
  automatisch korrigierbar**

### 4. Agent kann das jetzt selbstständig nachtragen – „wie bei den anderen Modulen“
- `PruefKorrekturVorschlag.entitaet.art` um `"pmVertrag"` und
  `"handwerker"` erweitert, `wendeBefundAn()` in `lib/pruefung.ts` kennt
  beide Entitäten jetzt generisch
- Dadurch funktioniert der **bereits bestehende** Agent-Mechanismus
  (`apply_pruef_befund` in `lib/agent.ts`, aufgerufen z.B. über
  `/api/pruefung/anwenden`) automatisch auch für die neuen
  PM-Vertrag-Befunde – es musste keine neue Agent-Fähigkeit gebaut
  werden, nur die Datenstruktur kompatibel gemacht
- Du kannst den Agenten also wie gewohnt bitten: *„Prüfe, ob alle Daten
  aus dem PM-Vertrag übernommen wurden, und trage fehlende nach“* – für
  automatisch korrigierbare Fälle (z.B. abweichende m²-Angabe bei
  vorhandener Wohnung) erledigt er das direkt; für Fälle, die eine
  echte Neuanlage erfordern (fehlendes Gebäude/fehlende Einheit), verweist
  er auf den intelligenten Upload, weil dort die vollständige
  Adress-/Zuordnungslogik (`liegenschaftskarte`-Import) bereits existiert
  und nicht blind dupliziert werden soll

## Getestet (End-to-End über echte API-Routen, nicht nur Unit-Ebene)

1. Liegenschaft mit 1 Gebäude + 1 Wohnung (34 m²) angelegt
2. PM-Vertrag mit Soll-Werten angelegt: 2 Gebäude, 2 Einheiten (davon eine
   mit abweichender Fläche 45 m² statt 34 m², eine komplett fehlend),
   keine Verwaltervergütung
3. Plausibilitätsprüfung ausgeführt → **alle 4 erwarteten Befunde**
   korrekt erzeugt (Verwaltervergütung fehlt, Gebäudeanzahl weicht ab,
   Wohnfläche weicht ab [mit Korrekturvorschlag], Einheit fehlt)
4. Korrekturvorschlag über `/api/pruefung/anwenden` angewendet (derselbe
   Endpunkt, den auch der Agent nutzt) → Wohnfläche wurde automatisch
   von 34 m² auf 45 m² korrigiert, per erneutem Abruf verifiziert

## Weiterhin bewusst offen

- Der Agent hat weiterhin keine automatische Handlungsanweisung, bei
  fehlenden Gebäuden/Einheiten **selbstständig** neue Gebäude/Wohnungen
  anzulegen – das bleibt bewusst ein manueller Schritt über den
  intelligenten Upload (Liegenschaftskarte/Objektübersicht), da dort
  bereits eine ausgereifte Adress-/Zuordnungsprüfung existiert und eine
  blinde Auto-Anlage Karteileichen erzeugen könnte
- Keine E-Mail-/Push-Benachrichtigung bei erkannten Abweichungen –
  Befunde erscheinen wie gewohnt im Prüfungs-Dashboard (`/pruefung`)
- Kein Handwerker-Login/-Portal (weiterhin rein verwaltungsseitig bedient)

## Lokal testen

```bash
npm install
npm run build   # oder: npm run dev
```

- `/smart-upload`: ein Handwerker-Stammdatenblatt (PDF) hochladen und die
  neue Bestätigungskarte prüfen
- Liegenschaft → Tab „PM-Vertrag“ → Vertrag mit Objektübersicht als
  Anlage hochladen
- `/pruefung` → Lauf starten → Modul „PM-Verträge“ auf neue Befunde prüfen
  und ggf. automatisch anwenden lassen
