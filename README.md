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

[Features](#-was-kann-die-app) · [Schnellstart](#-schnellstart) · [Module](#-alle-module-im-detail) · [Tech](#-technik-stack) · [Mitmachen](#-mitmachen--developer-community)

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

## 🛠 Technik-Stack

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
