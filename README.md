# BetriebsKostenBot – Automatische Betriebskostenabrechnungen

KI-gestützte Web-App zur automatisierten Erstellung und Prüfung von Betriebskostenabrechnungen
(Wohnen & Gewerbe). Next.js 15 (App Router) + TypeScript + Tailwind CSS + Zustand + Anthropic
Claude (Vision & Text).

## Features

- **Datei-Upload & KI-Erkennung** – Drag & Drop (oder Button) für PDF, JPG, PNG, TXT. Claude
  erkennt automatisch Betriebskosten-, Neben- und Heizkostenabrechnungen sowie Mietverträge und
  extrahiert Adresse, Zeitraum, Gesamtsumme und Kostenpositionen.
- **Live-Workspace** – jede Abrechnung landet sofort in einer bearbeitbaren Kachel-/Detailansicht,
  alle Felder sind live editierbar und werden serverseitig persistiert.
- **Kachelansicht mit Filtern** – nach Objekttyp, Status und Jahr, plus Volltextsuche.
- **Recht & Urteile** – `/api/recht` liefert eine KI-gestützte Einschätzung auf Basis einer
  hinterlegten Rechtsgrundlage (BetrKV, HeizkostenV, § 556 BGB) inkl. Quellenangaben.
- **Immer sichtbarer Chat** – der Bot kennt die aktuell ausgewählte Abrechnung *und* alle anderen,
  macht Optimierungsvorschläge und findet fehlende Positionen.
- **Automatische Texterstellung** – vollständige Betriebskostenabrechnung und formelles
  Anschreiben per Klick, direkt editierbar im Workspace.
- **Vorschau & Export** – Druckansicht mit Farbcodierung, PDF-Export (serverseitig via `pdf-lib`)
  und CSV-Export aller Abrechnungen.
- **Versionierung** – jede Aktualisierung erhöht die Version und speichert einen Snapshot in der
  Historie.
- **Dark Mode**, responsives Layout (mobile-first).

## Technik-Stack

Next.js 15 · TypeScript 5 · Tailwind CSS 4 · Zustand · Anthropic SDK (`claude-sonnet-5`,
Vision + Text) · pdf-lib · Datei-basierte JSON-Persistenz (kein externer DB-Server nötig,
auf Fly.io über ein Volume persistiert).

> Hinweis: Statt Supabase/Postgres nutzt die App eine simple, robuste JSON-Datei-Persistenz unter
> `DATA_DIR` (Standard: `./data`, in Docker/Fly: `/data`). Das läuft "out of the box" ohne
> externe Abhängigkeiten. Für echten Mehrbenutzerbetrieb mit hoher Schreiblast kann `src/lib/db.ts`
> 1:1 gegen einen Postgres/Supabase-Client ausgetauscht werden – die Funktionssignaturen bleiben
> gleich.

## Lokale Entwicklung

```bash
npm install
cp .env.example .env.local
# ANTHROPIC_API_KEY eintragen (https://console.anthropic.com/settings/keys)

npm run dev
```

App läuft unter http://localhost:3000

## Docker (lokal testen)

```bash
docker build -t betriebskosten-ki .
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -v $(pwd)/data:/data \
  betriebskosten-ki
```

## Deployment auf GitHub + Fly.io

### 1. Repository auf GitHub anlegen

```bash
git init
git add .
git commit -m "BetriebsKostenBot – initial commit"
git branch -M main
git remote add origin https://github.com/<dein-user>/betriebskosten-ki.git
git push -u origin main
```

### 2. Fly.io Setup

```bash
# Fly CLI installieren, falls noch nicht vorhanden: https://fly.io/docs/flyctl/install/
fly auth login

# App-Namen in fly.toml anpassen (muss global eindeutig sein) und dann:
fly apps create betriebskosten-ki   # oder den Namen aus fly.toml verwenden

# Persistentes Volume für die JSON-Datenbank erstellen (Region wie in fly.toml, z.B. fra)
fly volumes create betriebskosten_data --region fra --size 1

# API-Key als Secret hinterlegen (wird NICHT ins Repo committed)
fly secrets set ANTHROPIC_API_KEY=sk-ant-...

# Deploy
fly deploy
```

### 3. Automatisches Deployment via GitHub Actions (optional, bereits vorbereitet)

In `.github/workflows/fly-deploy.yml` liegt ein Workflow, der bei jedem Push auf `main`
automatisch `fly deploy` ausführt. Dafür in den GitHub-Repo-Settings unter
**Settings → Secrets and variables → Actions** ein Secret `FLY_API_TOKEN` hinterlegen
(Token erzeugen mit `fly tokens create deploy`).

## Projektstruktur

```
src/
  app/
    api/
      abrechnungen/          # CRUD für Abrechnungen
      analyze/                # Datei-Upload + KI-Extraktion
      chat/                   # Chat mit Seitenkontext
      generate/abrechnung/    # KI generiert Abrechnungstext
      generate/anschreiben/   # KI generiert Anschreiben
      recht/                  # Recht & Urteile (GET Basis, POST KI-Check)
      export/pdf/[id]/        # PDF-Export
      export/csv/             # CSV-Export
    layout.tsx
    page.tsx                  # Dashboard (Sidebar + Workspace + Chat)
    globals.css
  components/                 # Sidebar, Dropzone, Workspace, ChatWindow, PreviewModal, ThemeToggle
  lib/
    ai.ts                     # Anthropic Claude Vision + Text
    db.ts                     # JSON-Datei-Persistenz
    pdf.ts                    # PDF-Erzeugung
    store.ts                  # Zustand Store (Client)
    types.ts
    recht-content.ts
Dockerfile
fly.toml
```

## Lizenz

Frei nutzbar für den privaten und produktiven Einsatz.
