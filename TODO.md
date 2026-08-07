# TODO — Agent-Bugfixes & SOTA-Analyse

- [x] Codebase analysieren (agent.ts, groq-client.ts, supabase.ts, db.ts, API-Routen)
- [x] Plan mit Nutzer abgestimmt

## Fixes
- [x] Fix Bug #1: `},,` → `},` in `src/lib/agent.ts` (Sparse-Array bricht Tool-Calling)
- [x] Fix Bug #2: Stray-Dateien `route.ts` + `db.ts` im Projekt-Root entfernt
- [x] Fix Bug #3: `isAgentIntent`-Bestätigungs-Regex verengt (kein false-trigger bei „Ja, das ist gut")
- [x] Fix Bug #4: `getDashboardUebersicht` Prüflauf konsistent nach `gestartetAm` sortiert

## Doku
- [x] `SOTA_EMPFEHLUNGEN.md` mit 10 Empfehlungen Richtung 100% SOTA angelegt

## Verifikation
- [x] Edits manuell verifiziert (`},,` entfernt, `istBestatigung` korrekt platziert)
- [ ] TypeScript-/Lint-Check (blockiert: `node_modules` nicht installiert; `npx tsc` würde fremdes `tsc`-Paket ziehen)
