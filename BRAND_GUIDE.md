# BetriebsKostenBot AI — Corporate Design Guide

Kurzreferenz für Marke, Farben, Typografie und digitale Assets.

## 1. Logo

| Datei | Verwendung |
|---|---|
| `public/brand/logo.png` | Vollmarke (Icon + Schriftzug + Claim) – Briefkopf, Anschreiben, PDF-Export, große Flächen |
| `public/brand/logo-icon.png` | Icon-only – Navbar, Footer, App-Icon-Quelle |
| `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png` | Browser-Favicon |
| `apple-touch-icon.png` (180×180) | iOS Homescreen-Icon |
| `android-chrome-192x192.png` / `-512x512.png` | Android/PWA-Icon (siehe `site.webmanifest`) |

**Schutzraum:** mindestens die Höhe des „B“ in „BetriebsKostenBot“ als Abstand zu anderen Elementen freihalten.
**Nicht erlaubt:** Logo stauchen/verzerren, Farbverlauf des Icons ändern, Schatten/Effekte hinzufügen, auf zu kleine Flächen (< 24 px Höhe) setzen.

## 2. Farbpalette (Marketing-Theme, `.mk` in `marketing.css`)

| Token | Wert | Verwendung |
|---|---|---|
| `--background` | `#05070d` | Seitenhintergrund (Deep Navy/Black) |
| `--foreground` | `#f4f6fb` | Primärer Text |
| `--card` | `#0c0f18` | Karten/Flächen |
| `--muted-foreground` | `#93a0b8` | Sekundärtext |
| `--primary` | `#3b9dff` | Markenblau – CTAs, Links, Akzente |
| `--brand-accent` | `#22d3ee` | Cyan – Glow-Effekte, Icons, Highlights |
| Akzent Grün | `#34d399` (Tailwind `emerald-300/400`) | dritter Farbverlauf-Stop (Gradient-Text) |

Primärer Verlauf: `linear-gradient(90deg, #22d3ee, #3b9dff, #34d399)` für Gradient-Headlines und Primary-Buttons.

Die eigentliche App (`/`, `/liegenschaften`, …) verwendet ein **eigenes**, neutrales Light/Dark-Theme (`globals.css`, Tokens `--background/--card/--primary` dort). Das Marketing-Dark-Theme ist bewusst getrennt und beeinflusst die App nicht.

## 3. Typografie

- **Schrift:** Systemfont-Stack (`-apple-system, "Segoe UI", Helvetica, Arial`) – kein Web-Font-Ladevorgang nötig, maximale Performance.
- **Headlines:** `font-bold`, `tracking-tight`, Größen 36–72 px (`Heading`-Komponente: `md/lg/xl/2xl`).
- **Fließtext:** 16–18 px, `text-muted-foreground`, `leading-relaxed`.
- **Zahlen/Beträge:** `font-mono` für Beträge in Vorschau/PDF (Konsistenz mit Tabellenkalkulation).

## 4. Ton & Sprache

- Deutsch, Sie-Ansprache, sachlich-vertrauenswürdig mit leichtem Tech-Optimismus.
- Konkrete Zahlen statt Floskeln („90 % weniger manueller Aufwand“ statt „spart viel Zeit“).
- Rechtliche Begriffe korrekt referenzieren (§ 556 BGB, BetrKV) – schafft Vertrauen bei Hausverwaltungen.

## 5. UI-Bausteine (Marketing-Design-System)

`src/components/marketing/ui/`: `Button`, `GlassCard`, `Section`, `Container`, `Heading`, `GradientText`, `Badge`, `AnimatedCounter`, `FadeUp`, `Aurora`.
Neue Marketing-Abschnitte sollten ausschließlich diese Bausteine verwenden statt eigenes Styling zu definieren (siehe `src/app/marketing/page.tsx` als Referenz-Komposition).

## 6. Digitale Assets (`public/brand/social/`)

| Datei | Maße | VerwenDung |
|---|---|---|
| `og-image.png` | 1200 × 630 | Open-Graph/Link-Vorschau (Website, WhatsApp, Slack) |
| `linkedin-banner.png` | 1584 × 396 | LinkedIn-Unternehmensseite Titelbild |
| `instagram-post.png` | 1080 × 1080 | Social-Media-Post (Instagram/Facebook, quadratisch) |

Die Quell-HTML-Vorlagen (für Anpassungen/neue Formate) liegen unter `brand-assets/*.html` im Lieferpaket und lassen sich mit Playwright (`node render.js`) erneut als PNG rendern.

## 7. Anwendungsbeispiele im  Produkt

- **PDF-/Vorschau-Briefkopf:** `logo.png`, siehe `src/components/PreviewModal.tsx` & `src/lib/pdf.ts`
- **Marketing-Navbar/Footer:** `logo-icon.png`, siehe `src/components/marketing/Navbar.tsx` & `Footer.tsx`
- **Browser-Tab/Homescreen:** Favicon-Set, eingebunden über `src/app/layout.tsx` (`metadata.icons`) und `site.webmanifest`
- **Link-Vorschau bei `/marketing`:** `og-image.png`, eingebunden über `src/app/marketing/layout.tsx` (`metadata.openGraph`)
