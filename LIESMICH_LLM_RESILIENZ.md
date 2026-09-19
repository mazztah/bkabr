# LLM-Resilienz – Änderungen (Drop-in)

Dateien einfach über das bestehende Repo legen (Ordnerstruktur ist enthalten), neu bauen/deployen.
`tsc --noEmit` und `next build` laufen sauber durch.

## Neu
- `src/lib/llm-message-hygiene.ts` – bereinigt die Nachrichtenliste vor JEDEM Modellversuch passend zum Zielmodell:
  Tool-Paare (verwaiste tool-Nachrichten entfernen, fehlende Ergebnisse ergänzen), kaputte Tool-Argumente reparieren,
  mehrere system-Nachrichten zusammenführen, Rollenfolge für Gemma/Mistral/Nemotron, Mistral-Tool-IDs (9 Zeichen),
  Tool-Verlauf als Text für Modelle ohne Tool-Kanal (pseudo/none), Tool-Ergebnisse kürzen.
- `src/lib/llm-error-classifier.ts` – Fehlerklassen (Minuten-/Tageslimit, 402, Auth, zu groß, 404, nicht unterstützt,
  kaputtes JSON, 400, Timeout, 5xx, leer) + Circuit-Breaker pro Modus (strukturiert/Freitext) und Größen-Gedächtnis für 413.

## Geändert
- `groq-client.ts`
  - Nachrichten je Modell bereinigen (vor und nach der Token-Kürzung).
  - Token-Kürzung entfernt nur noch ganze Einheiten (tool_call+Ergebnis), behält den Auftrag; große Tool-Ergebnisse werden zuerst gekürzt.
  - 413 sperrt das Modell nicht mehr 2 Min. für alles, sondern nur Anfragen ab der abgelehnten Größe (10 Min.).
  - „nicht unterstützt“ sperrt nur den strukturierten Modus, nicht mehr den Freitext.
  - Fehlerserien (Timeout/5xx/leer/kaputtes JSON) → exponentieller Cooldown mit Half-Open-Versuch.
  - Vorab-Überspringer (Prompt zu groß) zählen nicht mehr als Fehlaufruf (Compound: 141 „Aufrufe“, 0 Tokens).
  - Vergiftete Anfragen (gleiche 400-Meldung bei ≥3 Anbietern) brechen die Kette früh ab.
  - Neue Statistik: Fehlerklasse je Modell und Ketten-Erfolgsquote (Anfragen statt Einzelversuche).
- `agent.ts` – Tool-Ergebnisse im Verlauf auf ~8000 Zeichen begrenzt (gültiges JSON mit „gekuerzt“-Hinweis).
- `db.ts`, `types.ts` – Felder `errorClasses`, `lastError*`, `recordChainOutcome`, `getChainStats`.
- `api/dashboard/cost-recommendation/route.ts` – deterministische Diagnose aus echten Fehlerklassen statt LLM-Freitext
  (die alte Empfehlung erzeugte selbst Kettenaufrufe und nannte nur generische Maßnahmen).

## Grenzen
- Cooldowns/Breaker liegen im Arbeitsspeicher: nach Neustart oder bei mehreren Fly-Maschinen beginnen sie neu.
- Fehlerklassen erscheinen im Dashboard erst für Aufrufe NACH dem Deploy.
- Ob 402-Stufen (Cerebras) oder das Cloudflare-Tageslimit wieder laufen, entscheidet der Provider, nicht der Code.
