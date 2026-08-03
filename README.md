<div align="center">

# 🧾 BetriebsKostenBot AI

### Die Open-Source-KI für Betriebskostenabrechnungen, die sich von selbst erledigen

**Rechnungen, Mietverträge & Übergabepakete hochladen → KI erkennt, ordnet zu, prüft und schreibt fertige Abrechnungen.**  
Wohnen · Gewerbe · Hausverwaltung · Property Management

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Groq](https://img.shields.io/badge/Groq-Vision%20%26%20Text-orange)](https://groq.com/)
[![License](https://img.shields.io/badge/License-frei%20nutzbar-green)](#lizenz)
[![Budget](https://img.shields.io/badge/Bisherige%20Kosten-0%20€-brightgreen)](#warum-0--und-trotzdem-viel-m%C3%B6glich)

[Features](#-was-kann-die-app) · [Schnellstart](#-schnellstart) · [Agentic Assistant](#-agentic-assistant-system--der-ki-agent-mit-23-tools) · [Module](#-alle-module-im-detail) · [Tech](#-technik-stack) · [Mitmachen](#-mitmachen--developer-community)

</div>

---

## Warum dieses Projekt?

Betriebskostenabrechnungen sind in der Praxis oft: **PDF-Chaos, Excel-Kopieren, manuelle Zuordnung, rechtliche Unsicherheit.**  
Dieses Projekt zeigt, dass man mit moderner Open-Source-Technik und **kostenlosen Developer-APIs** (Groq Free Tier, JSON-Persistenz, Next.js) schon heute einen echten Arbeitsablauf automatisieren kann – **ohne Cloud-Rechnung, ohne Vendor-Lock-in, ohne 5-stellige SaaS-Lizenz.**

> **Bisherige Projektkosten: 0 €.**  
> Kein bezahlter API-Plan, kein Managed-Database-Abo, kein Marketing-Budget.  
> Skalierung hängt nicht automatisch an höheren Kosten – oft an smarter Architektur, Caching und klaren Grenzen.

Mit mehr Budget ginge noch mehr (bessere Modelle, echte Multi-User-DB, OCR-Hardware, Agenten-Workflows).  
**Aber hier ist schon viel möglich – und es macht Spaß, es auszuprobieren.**

---

## ✨ Was kann die App?

| Bereich | Was passiert |
|--------|----------------|
| 🧠 **Intelligenter Sammel-Upload** | 20 PDFs eines Übergabepakets auf einmal → KI klassifiziert jede Datei (Rechnung, Mietvertrag, Grundbuch, Kontoauszug …) |
| 🧾 **Rechnungen & Abrechnungen** | OCR + Vision, Merkmalsprüfung (§14-nahe), Zuordnung zu Liegenschaft/Wohnung, editierbare Positionen |
| 📄 **Mietverträge & Nachträge** | Extraktion von Miete, NK, Kaution, Laufzeit – Nachträge können optional automatisiert übernommen werden |
| 🏠 **Stammdaten-Hierarchie** | Eigentümer → Liegenschaft → Gebäude → Wohnung → Mieter – mit Anhängen (Grundbuch, PM-Vertrag, …) |
| 🔍 **Plausibilitätsprüfung** | Modulweise Checks mit Befunden (ok / Hinweise / Fehler) und optionaler Übernahme von Korrekturen |
| ✉️ **Schriftverkehr** | KI-Anschreiben, Vorschau, **„Fertigstellen“** → versandfertige PDF mit Briefkopf & Logo |
| 💬 **Kontext-Chat** | Bot kennt die aktuelle Abrechnung *und* den Rest – Vorschläge, fehlende Positionen, Rechtshinweise |
| 🤖 **Agentic Assistant** | Derselbe Bot führt auf natürlichsprachlichen Auftrag hin **mehrstufige Workflows selbstständig aus** – 23 Tools, bis zu 20 verkettete Schritte, siehe [eigener Abschnitt](#-agentic-assistant-system--der-ki-agent-mit-23-tools) |
| ⚖️ **Recht-Check** | Einschätzung auf Basis BetrKV, HeizkostenV, § 556 BGB inkl. Quellen |
| 📊 **Export** | PDF (pdf-lib), CSV, Excel (xlsx) – ohne Extra-Cloud |

---

## 🚀 Schnellstart

```bash
# 1. Abhängigkeiten
npm install

# 2. API-Key (kostenlos bei Groq)
cp .env.example .env.local
# GROQ_API_KEY=gsk_...   →  https://console.groq.com/keys

# 3. Los
npm run dev
```

App: **http://localhost:3000**  
Marketing-Landing: **http://localhost:3000/marketing**

### Docker (optional)

```bash
docker build -t betriebskosten-ki .
docker run -p 3000:3000 \
  -e GROQ_API_KEY=gsk_... \
  -v $(pwd)/data:/data \
  betriebskosten-ki
```

> **Hinweis:** Die Persistenz liegt in JSON-Dateien unter `DATA_DIR` (Standard `./data`, in Docker/Fly `/data`).  
> Kein Postgres nötig zum Starten. Für echte Mehrbenutzer-Last kann `src/lib/db.ts` 1:1 gegen einen Postgres-/Supabase-Client getauscht werden – die Signaturen bleiben gleich.

---

## 📦 Alle Module im Detail

Die Navigation ist in vier Gruppen organisiert. Einige Module sind **voll nutzbar**, andere sind bewusst als **Coming Soon** markiert – Platzhalter für Community-Beiträge und nächste Iterationen.

### 1. Struktur

#### 🧠 Intelligenter Upload (`/smart-upload`)

**Das Herzstück für den „Übergabe-Tag“.**

- Beliebig viele Dateien gleichzeitig (PDF, JPG, PNG, …).
- Jede Datei wird per KI klassifiziert, u. a.:
  - Rechnung / Betriebskostenabrechnung  
  - Mietvertrag, Nachtrag, Übergabeprotokoll  
  - PM-Vertrag, Eigentümer-Dokument, Grundbuch, Kaufvertrag  
  - Liegenschaftskarte / Objektbeschreibung / Mieterliste  
  - Kontoauszug  
- **Rechnungen & Kontoauszüge** werden wie gewohnt direkt abgelegt (kein Extra-Schritt).  
- **Alles andere** erscheint als Warteschlangen-Karte mit vorausgefüllten, **editierbaren** Feldern und Vorschlägen (Adress-/Namensabgleich gegen bestehende Stammdaten).  
- **Nichts wird übernommen, bevor du „Übernehmen & ablegen“ bestätigst.**

**Beispiel:** Du bekommst 18 PDFs vom Notar/Verwalter-Wechsel. Statt 2 Stunden Sortieren: Ordner reinziehen → Kaffee → Karten prüfen → bestätigen. Fertig.

#### 📥 Ablage (`/ablage`)

Zentrale Übersicht hochgeladener / noch nicht final zugeordneter Dokumente – die „Poststelle“ der App.

#### 🔍 Plausibilitätsprüfung (`/pruefung`)

Modulweise Prüfung der Datenlage (Status: ok / Hinweise / Fehler / ausstehend).  
Befunde mit Schweregrad, optional gezielte Übernahme von Korrekturen. Ideal vor dem finalen Versand der Abrechnung.

#### 👤 Eigentümer (`/eigentuemer`)

Stammdaten der Eigentümer inkl. **Anhänge**: Grundbuchauszug, Kaufvertrag, Vollmacht, Eigentümerbeschluss, Sonstiges.

#### 💼 Investoren · 🏦 Finanzierung · 📃 PM-Vertrag

- **PM-Vertrag** ist ausgearbeitet: Upload, KI-Extraktion, Zuordnung, Anhänge (Liegenschaftskarte, Objektbeschreibung, Mieterliste).  
- **Investoren** und **Finanzierung** sind aktuell Coming-Soon-Platzhalter – bewusst offen für Beiträge aus der Community (Cashflow-Modelle, Darlehenspläne, Reporting).

---

### 2. Objekte

#### 🏠 Liegenschaften · 🏢 Gebäude · 🏢 Wohnungen · 🧑 Mieter

Hierarchische Stammdaten:

```
Eigentümer
  └── Liegenschaft (Adresse, Flurstück, …)
        └── Gebäude
              └── Wohnung (Fläche, Typ Wohnen/Gewerbe, …)
                    └── Mieter
```

Manuell anlegbar oder über Smart-Upload / Dokument-Extraktion befüllt.  
Quick-Create-Dialoge für schnelles Anlegen ohne den großen Workflow.

#### ✉️ Schriftverkehr (`/schriftverkehr`)

- KI generiert formelle Anschreiben (z. B. Mieterbegrüßung nach Eigentümerwechsel, Abrechnungsanschreiben).  
- Live-Vorschau, Bearbeitung, Speichern.  
- Button **„✓ Fertigstellen“** erzeugt eine **versandfertige PDF** mit grafischem Briefkopf (Logo + Corporate Design) und legt sie dauerhaft ab.  
- Danach: Link „📄 Finale PDF ansehen“.

#### 📊 Auswertung

Auswertungsansicht über Bestände und Abrechnungen (Erweiterung willkommen).

---

### 3. Kaufmännisch

#### 🧾 Abrechnungen (Dashboard `/`)

- Live-Workspace: Kachel- und Detailansicht.  
- Jede Abrechnung ist **sofort editierbar** (Positionen, Beträge, Umlageschlüssel, Status).  
- Status-Pipeline: `Rohdaten` → `Validierung` → `Fertig`.  
- Versionierung: jede Änderung erhöht die Version und speichert einen Snapshot.  
- Filter nach Objekttyp, Status, Jahr + Volltextsuche.  
- CSV-Export aller Abrechnungen.  
- KI-generierter Abrechnungstext und Anschreiben auf Knopfdruck.  
- Immer sichtbarer **Chat** mit Kontext zur aktuellen und zu allen anderen Abrechnungen.

**Beispiel-Position:**

| Position | Gesamtkosten | Umlage | Mieteranteil |
|----------|--------------|--------|--------------|
| Hausmeister | 4.800 € | Wohnfläche 80/400 m² (20 %) | 960 € |
| Straßenreinigung | 1.200 € | … | … |

#### 💳 Kontoauszüge

Eigener Stammdatentyp – Upload, KI-Extraktion, dauerhafte Archivierung (nicht nur Zwischenpuffer).

#### 💶 Vorauszahlungen

Verwaltung von NK-/HK-Vorauszahlungen je Mietverhältnis (Basis für die Abrechnung).

#### 📄 Mietverträge

- Upload + KI-Extraktion (Miete, NK, Kaution, Laufzeit, Parteien).  
- **Nachtrag / Übergabeprotokoll** je Vertrag: Dialog mit erkannten Änderungen  
  - **„Nur ablegen“** → archivieren, Stammdaten unangetastet  
  - **„Automatisch übernehmen“** → Werte direkt in den Mietvertrag schreiben  

#### 📥 Rechnungen

- Liste mit Sortierung (Hochgeladen, Liegenschaft, Name, Firma, Betrag – auf/ab).  
- Merkmalsprüfung (Rechnungsnummer, Datum, Auftraggeber/-nehmer, Betrag, …) mit Score und Akzeptanzschwelle.  
- **Excel-Export** (`GET /api/export/xlsx`) – eine Zeile je Rechnung/Abrechnung.

#### 🤝 Dienstleistungsverträge

Coming Soon – Verträge mit Hausmeister, Gartenpflege, Aufzug etc. als Stammdaten + Kostenbasis.

---

### 4. Betrieb

| Modul | Status | Idee |
|-------|--------|------|
| 🔧 Instandhaltung | Coming Soon | Tickets, Gewerke, Fristen |
| 📋 Aufträge | Coming Soon | Vergabe & Nachverfolgung |
| 📊 Assetmanagement | Coming Soon | Kennzahlen, Portfolio |
| 📈 Budgetierung | Coming Soon | Jahresplanung vs. Ist |

Diese Module sind **bewusst** als Einstiegspunkte angelegt – ideale Stellen, um als Contributor sichtbar zu werden.

---

## 🧩 Typischer Tagesablauf (Beispiel)

1. **Morgen:** 12 Rechnungen per Drag & Drop in `/smart-upload` oder Einzel-Upload.  
2. KI erkennt Beträge, Lieferanten, Leistungszeiträume; Zuordnung zu Liegenschaft vorschlagen.  
3. Du bestätigst / korrigierst in 2 Minuten.  
4. **Nachmittag:** Neuer Mietvertrag + Nachtrag → „Automatisch übernehmen“ für neue Miete und NK.  
5. **Vor Versand:** Plausibilitätsprüfung starten → Hinweise abarbeiten.  
6. Abrechnungstext + Anschreiben generieren → **Fertigstellen** → PDF an Mieter.  
7. Zwischendurch: Chat fragen *„Fehlt bei Spannhagengarten 4 noch die Gebäudeversicherung?“*

---

## 🤖 Agentic Assistant System – der KI-Agent mit 23 Tools

Der Chat-Button unten rechts ist mehr als ein Q&A-Bot. Erkennt die App einen **Auftrag** statt einer Frage (z. B. *„Erstelle alle Mahnungen für die Spannhagengartenstraße“* oder *„Räume die Ablage auf und lege fehlende Gebäude an“*), übernimmt ein **echter Tool-Calling-Agent** (`src/lib/agent.ts`, `runAgent()`): Er plant selbst, ruft nacheinander die passenden Funktionen auf, wertet deren Ergebnisse aus und entscheidet, ob noch ein weiterer Schritt nötig ist – bis zu **20 verkettete Tool-Aufrufe pro Auftrag**, bevor er eine Zusammenfassung an den Nutzer zurückgibt.

```
Nutzer-Auftrag (natürliche Sprache)
        │
        ▼
isAgentIntent()  ──  erkennt Ausführungs-Absicht vs. reine Frage
        │
        ▼
runAgent()  ──  Groq Function-Calling-Loop (max. 20 Schritte)
        │
        ├─▶ Tool 1: z. B. find_mieter          (lesen)
        ├─▶ Tool 2: z. B. get_mietrueckstaende (lesen)
        ├─▶ Tool 3: z. B. create_briefe_batch  (schreiben)
        └─▶ …bis Auftrag erledigt oder Bestätigung nötig
        │
        ▼
Antwort inkl. ausgeführter Schritte + erzeugter Dokumente
```

### Die 23 Tools im Überblick

| Kategorie | Tool | Was es tut |
|-----------|------|------------|
| **Lesen & Recherche** | `list_liegenschaften` | Alle Liegenschaften (Name, Adresse, ID) auflisten – Basis für Adresszuordnung |
| | `find_mieter` | Mieter nach Liegenschaft, Straße, Adresse oder Name finden, optional nur mit Rückstand |
| | `get_mietrueckstaende` | Alle Mieter mit offenem Mietrückstand, optional gefiltert nach Objekt |
| | `list_brief_vorlagen` | Verfügbare Schriftverkehr-Vorlagen auflisten (Mahnung, Kündigung, BK-Abrechnung …) |
| | `list_gespeicherte_briefe` | Bereits erzeugte Schreiben durchsuchen (nach Mieter/Liegenschaft) |
| | `get_pruef_befunde` | Letzten Plausibilitäts-Prüflauf lesen – offene Befunde über alle Module hinweg |
| | `list_unpassende_dokumente` | Dokumente ohne Zuordnung / mit unplausibler Zuordnung finden |
| **Schriftverkehr erzeugen** | `create_brief` | Ein Anschreiben/eine Mahnung für einen Mieter aus Vorlage generieren & ablegen |
| | `create_briefe_batch` | Denselben Brieftyp für **mehrere Mieter gleichzeitig** erzeugen (z. B. alle Mahnungen einer Straße) |
| **Prüfung** | `run_pruefung` | Einen neuen vollständigen Plausibilitäts-Prüflauf über alle Module starten |
| | `apply_pruef_befund` | Automatischen Korrekturvorschlag eines Befunds anwenden |
| | `mark_befund_status` | Befund als „übernommen“ oder „abgelehnt“ markieren |
| **Stammdaten pflegen** | `create_gebaeude` | Gebäude unter einer Liegenschaft anlegen |
| | `update_liegenschaft` | Stammdaten einer Liegenschaft korrigieren (Adresse, Flurstück, Notizen …) |
| | `update_wohnung` | Wohnungsdaten ergänzen/korrigieren (Fläche, Typ, Zimmer …) |
| | `update_abrechnung` | Abrechnung korrigieren (z. B. Status zurücksetzen bei 0-€-Summe) |
| | `update_ablage_zuordnung` | Falsch zugeordnetes Dokument der richtigen Liegenschaft/Objekt zuweisen |
| | `sync_mieter_from_mietvertraege` | Mietbeginn, Kaltmiete & NK-Vorauszahlung aus Mietverträgen in Mieter-Stammdaten übernehmen |
| **Aufräumen (mit Sicherheitsnetz)** | `merge_liegenschaften` | Duplikate zusammenführen (z. B. zwei Einträge „Spannhagengartenstraße“) |
| | `delete_liegenschaft` | Liegenschaft löschen – **nur ohne Abhängigkeiten oder mit `force` + `user_confirmed`** |
| | `delete_abrechnung` | Leere/fehlerhafte Abrechnung löschen – **erfordert `user_confirmed=true`** |
| | `analyze_and_plan_cleanup` | Erstellt aus allen offenen Befunden einen strukturierten Plan (`auto_fix` / `fragen` / `manuell`) – **verändert nichts, nur Analyse** |
| | `execute_safe_cleanup` | Führt **ausschließlich zweifelsfreie** Korrekturen automatisch aus; alles Riskante (Neuanlagen, Löschungen) nur nach expliziter Nutzerfreigabe |

### Eingebaute Sicherheitsmechanismen

Der Agent ist bewusst **nicht** blind autonom – jedes destruktive oder mehrdeutige Tool verlangt ausdrücklich `user_confirmed`/`force`-Flags, und `analyze_and_plan_cleanup` trennt sauber zwischen *sofort sicher ausführbar*, *Nutzer muss entscheiden* und *manuell nötig*. Das Ergebnis: Routineaufgaben laufen vollautomatisch durch, während irreversible Aktionen (Löschen, Zusammenführen) immer einen Menschen im Loop behalten – ein Design-Muster, keine Notlösung.

### Beispiel-Aufträge, die der Agent in einem Rutsch erledigt

- *„Erstelle Mahnungen für alle Mieter mit Rückstand in der Spannhagengartenstraße“* → `find_mieter` → `get_mietrueckstaende` → `create_briefe_batch`
- *„Prüfe alles und behebe, was eindeutig ist“* → `run_pruefung` → `analyze_and_plan_cleanup` → `execute_safe_cleanup`
- *„Führe die doppelte Liegenschaft Musterstraße 5 zusammen“* → `list_liegenschaften` → `merge_liegenschaften` (mit Rückfrage vor dem Löschen der leeren Quelle)
- *„Übernimm die neuen Mieten aus den Mietverträgen in die Mieter-Stammdaten“* → `sync_mieter_from_mietvertraege`

### Wie nah ist das an einer vollautomatisierten Hausverwaltung?

Wenn man sich ansieht, was diese 23 Tools zusammen abdecken – **lesen, prüfen, korrigieren, Schriftverkehr erzeugen, Duplikate bereinigen, Stammdaten synchronisieren, alles über eine einzige natürlichsprachliche Anweisung verkettet** – wird deutlich: Eine **vollautomatisierte Hausverwaltung erscheint keineswegs unerreichbar.** Der Kern eines autonomen Verwaltungs-Agenten ist hier bereits gelegt: Intent-Erkennung, mehrstufige Tool-Orchestrierung, Sicherheits-Guardrails für riskante Schritte und eine Domänenmodellierung, die praktisch jeden Verwaltungsvorgang abbildet.

Was fehlt, ist eher **Breite als Grundgerüst**: Anbindung an Zahlungsverkehr/Kontoauszüge für automatischen Abgleich, terminierte/eventgesteuerte Läufe (z. B. „prüfe jeden Monatsersten automatisch“) statt nur Chat-getriggerter Aufträge, sowie die Erweiterung der bereits als Platzhalter angelegten Module (Instandhaltung, Budgetierung, Assetmanagement) um eigene Tools nach demselben Muster. Architektonisch ist der Agent so gebaut, dass genau das – neue Tools registrieren, in den bestehenden Loop einhängen – ein inkrementeller, kein grundlegender Schritt ist.

---

| Schicht | Technologie |
|---------|-------------|
| Framework | **Next.js 15** (App Router), React 19 |
| Sprache | **TypeScript 5** |
| UI | **Tailwind CSS 4**, Framer Motion, Lucide |
| State | **Zustand** |
| KI | **Groq** (Vision + Text, u. a. Llama 4 Scout / multimodale Modelle) |
| OCR | tesseract.js + pdf-parse + Vision-Fallback |
| PDF | **pdf-lib** (Export, Briefkopf) |
| Excel | eigenes minimales XLSX (kein schweres Extra-Dependency-Zwang) |
| Persistenz | **JSON-Dateien** unter `DATA_DIR` – zero-config |
| Deploy | Docker + **Fly.io** (Volume für `/data`), optional GitHub Actions |

### Wichtige Lib-Dateien

```
src/lib/
  ai.ts              # Klassifikation, Extraktion, Chat, Recht, Textgenerierung
  db.ts              # JSON-Persistenz (austauschbar)
  rechnung-intake.ts # gemeinsame Logik Einzel- + Sammel-Upload
  pruefung.ts        # Plausibilitätsmodule
  pdf.ts             # Abrechnungs- & Schriftverkehr-PDFs
  xlsx.ts            # Excel-Export
  matching.ts        # Adress-/Namensabgleich
  types.ts           # alle Domain-Typen
```

### API (Auszug)

`/api/analyze` · `/api/smart-upload` · `/api/chat` · `/api/recht` · `/api/generate/abrechnung` · `/api/generate/anschreiben` · `/api/export/pdf/[id]` · `/api/export/csv` · `/api/export/xlsx` · CRUD für Liegenschaften, Wohnungen, Mieter, Mietverträge, …

---

## 🎨 Design & Marke

Siehe **[BRAND_GUIDE.md](./BRAND_GUIDE.md)** – Farben, Logo-Schutzraum, Typografie, Ton (Deutsch, Sie-Ansprache, sachlich mit Tech-Optimismus).

Marketing-Theme (Dark) und App-Theme (Light/Dark) sind getrennt, damit die produktive Oberfläche klar bleibt.

---

## 🌍 Deployment (Fly.io)

```bash
fly auth login
# App-Namen in fly.toml anpassen
fly apps create <dein-app-name>
fly volumes create betriebskosten_data --region fra --size 1
fly secrets set GROQ_API_KEY=gsk_...
fly deploy
```

Optional: GitHub Action mit `FLY_API_TOKEN` für Deploy bei Push auf `main`.

---

## 💡 Warum 0 € – und trotzdem viel möglich?

| Kostenpunkt | Hier gelöst durch |
|-------------|-------------------|
| KI-Inferenz | Groq Free / Developer Tier (schnell, Vision-fähig) |
| Datenbank | JSON-Dateien + Volume – kein Managed-DB-Abo |
| Hosting | Fly.io Free/Hobby-tauglich, auto-stop Machines |
| OCR | tesseract.js + pdf-parse lokal im Container |
| Auth / Multi-Tenant | bewusst noch schlank – Erweiterung willkommen |
| Design-System | Tailwind + eigene Marketing-Komponenten |

**Mehr Budget** öffnet Türen: stärkere Modelle, Vektorsuche, echte Collaboration, Agenten-Pipelines, professionelles Monitoring.  
**Aber:** Viele Verbesserungen sind **Architektur**, nicht Euro – Caching, bessere Prompts, klarere Domänenmodelle, Tests.

---

## 🤝 Mitmachen – Developer Community

Wir suchen Leute, die **Lust auf Hausverwaltung + KI + sauberes TypeScript** haben – und an gemeinsamen Projekten wachsen wollen.

### Gute Einstiege

- Coming-Soon-Module füllen (Instandhaltung, Budgetierung, Assetmanagement, Dienstleistungsverträge)
- Postgres/Supabase-Adapter für `db.ts`
- Bessere Matching-Heuristiken (Adresse, Firmennamen)
- Tests (Unit + API) und CI-Härte
- Accessibility & Mobile-Feinschliff
- Internationale Varianten (andere Rechtsräume – ohne Copy-Paste-Rechtstexte)

### So startest du

1. Fork → Branch → PR mit klarer Beschreibung.  
2. Issue aufmachen, wenn du etwas Größeres planst (wir koordinieren gern).  
3. Issues mit Label `good first issue` / `help wanted` bevorzugen.  
4. Code-Stil: TypeScript strict, bestehende Patterns in `lib/` und Komponenten wiederverwenden.

> Ziel: ein **gemeinsames** Werkzeug, das in echten Verwaltungen Zeit spart – und an dem man als Dev sichtbar und mit Spaß mitbauen kann.

---

## 📁 Projektstruktur (Kurz)

```
src/
  app/                 # App Router – Seiten + API-Routen
    api/               # analyze, smart-upload, chat, recht, export, …
    smart-upload/      # Sammel-Upload UI
    liegenschaften/ …  # Stammdaten-Module
    marketing/         # Landing Page
  components/          # Workspace, Chat, Dropzone, Nav, Marketing-UI
  lib/                 # ai, db, pdf, types, prüfung, …
public/brand/          # Logo, Social-Assets
Dockerfile · fly.toml · BRAND_GUIDE.md
```

---

## ⚠️ Hinweise

- **Kein Rechtsrat.** Der Recht-Check ist eine KI-gestützte Orientierungshilfe auf Basis hinterlegter Texte (BetrKV, HeizkostenV, § 556 BGB) – keine anwaltliche Prüfung.  
- API-Keys nie committen (`.env*` ist in `.gitignore`).  
- Für produktiven Mehrbenutzer-Betrieb: Persistenz und Auth erweitern.

---

## Lizenz

Frei nutzbar für privaten und produktiven Einsatz.  
Beiträge willkommen – Attribution an das Projekt freut uns.

---

<div align="center">

**Gebaut mit Neugier, TypeScript und 0 € Budget.**  
Wenn dich das anstupst: Star ⭐ · Fork · Issue · PR.

*Betriebskostenabrechnungen, die sich von selbst erledigen – und eine Community, die mitbaut.*

</div>
