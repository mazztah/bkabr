# SOTA-Empfehlungen (State of the Art) — Richtung 100 %

Diese Datei dokumentiert 10 handverlesene, umsetzbare Verbesserungen, die die
Agent-Architektur und die App als Ganzes auf State-of-the-Art-Niveau bringen.
Prioritäten: **1 = höchster Nutzen/Aufwand**.

---

## 1. Deterministic Guardrails statt Regex-Fallback (hoch, mittel)
`isAgentIntent` + `tryDeterministicCleanup`/`tryDeterministicMahnung` basieren auf
Regex-Heuristiken. Das ist fragil und schwer wartbar.
**Empfehlung:** Ersetze die Regex-Fallback-Kette durch einen kleinen
Entscheidungsklassifikator (Rule-Engine mit klar getrennten Modulen) oder einen
schmalen LLM-Intent-Call (cheap, `max_tokens` klein), der in 3–5 eindeutige
Intents klassifiziert. Fallback bleibt deterministisch.

## 2. Tool-Schema automatisch aus der Implementierung ableiten (hoch, niedrig)
`AGENT_TOOLS` (75+ Tool-Definitionen) wird manuell gepflegt und ist bereits
einmal an einem Sparse-Array (`},,`) zerbrochen. **Empfehlung:** Die
JSON-Schemas mit `zod`-Schemas je Tool deklarieren und daraus die
OpenAI-kompatiblen Parameter generieren (Bibliothek: `zod-to-json-schema`).
Damit kann sich das Schema nie wieder vom Handler entkoppeln.

## 3. Typsichere Tool-Dispatch-Tabelle (hoch, niedrig)
Der `switch` in `executeTool` ist über 1000 Zeilen. **Empfehlung:** In eine
`Record<ToolName, (args)=>Promise<unknown>>`-Dispatch-Map umbauen, mit
`typed-route-handlers`. Fehlende/unbekannte Tools werden dadurch zur
Compile-Zeit erkannt statt zur Laufzeit.

## 4. Streaming für den Agent-Loop (hoch, mittel)
`createChatCompletion` nutzt non-streaming Chat Completions. Für bessere UX
(und um Timeouts bei langen Läufen zu vermeiden) **Empfehlung:** Streaming mit
`stream: true` + SSE an den Client, während Tool-Calls weiterhin intern
non-streaming laufen. Zwischenstände („Bereinige Stammdaten…“) geben
Transparenz.

## 5. Strukturierte Tool-Ergebnisse + Schemavalidierung (hoch, mittel)
Tool-Antworten werden als `JSON.stringify(result)` an das Modell zurückgegeben.
**Empfehlung:** Jede Tool-Antwort mit einem Ergebnis-Schema validieren und
`JSON.parse`-fehler wie schon bei den Argumenten sauber ans Modell melden.
Optional Ergebnisse auf relevante Felder reduzieren (Token-Sparen).

## 6. Observability & Tracing (mittel, niedrig)
Es gibt bereits Usage-Logging und Reflection. **Empfehlung:** OpenTelemetry
(oder `@vercel/otel`) für den Agent-Loop aktivieren: Tool-Calls, Latenzen,
Fehler, Modell-Fallbacks pro Run. Das macht die `agent_runs`-Tabelle in
Supabase zur echten Trace-Quelle.

## 7. Konversations-Gedächtnis über Sessions hinweg (mittel, mittel)
Supabase persistiert nur den Lauf (Goal/Steps/Reflection), nicht die
Chat-History über Sessions. **Empfehlung:** Pro User/Session eine kompakte
Semantic-Memory (chronologische Zusammenfassung + letzte N Tool-Ergebnisse) in
Supabase ablegen und beim Agent-Start injizieren. Basiert auf dem vorhandenen
`agent_runs`-Modell.

## 8. Rate-Limit- & Kontingent-Prognose (mittel, niedrig)
Der Fallback über Provider (Groq→Cerebras→Cloudflare→NVIDIA) ist solide.
**Empfehlung:** Aus dem AI Cost Observatory ein Modell ableiten, das pro
Provider das verbleibende Tagesbudget schätzt, die Modellkette dynamisch
sortiert und bevorzugt den reichsten Provider nutzt — statt immer linear
herunterzufallen.

## 9. Soft-Delete & Audit statt hartem Löschen (mittel, mittel)
Destruktive Tools löschen derzeit endgültig (mit `user_confirmed`).
**Empfehlung:** `deletedAt`-Soft-Delete + Wiederherstellung plus durchgängiges
Audit-Log (wer/was/wann), damit versehentliche Löschungen (namentlich bei
Liegenschaften/Mietern) reversibel sind. Existierendes `logEvent` dafür
erweitern.

## 10. Tests & CI (hoch, mittel)
Es gibt keine Unit-/Integrationstests; `tsc` kann ohne `node_modules` nicht
laufen. **Empfehlung:** `vitest` für die Kern-Logik (Agent-Intents,
Tool-Dispatch, `isAgentIntent`, `matchesQuery`, KPI-Berechnungen) und
`playwright`-Smoke-Tests für die Chat-/Agent-API. Ein CI (GitHub Actions) führt
`typecheck` + Lint + Tests vor jedem Merge aus. Am wichtigsten: Ein Test, der
verhindert, dass `AGENT_TOOLS` wieder ein Sparse-Array/ein ungültiges Tool
enthält.

---

## Kurz-Checkliste
- [ ] 1–3: Typsicherheit & Wartbarkeit der Tool-Definitionen
- [ ] 4–5: Streaming + validierte Tool-Antworten
- [ ] 6–8: Observability, Memory, Kontingent-Prognose
- [ ] 9: Soft-Delete/Audit
- [ ] 10: Tests + CI (Regression für `AGENT_TOOLS`)
